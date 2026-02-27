/**
 * WebhookDeliveryProcessor Tests
 * Story 21-8: Webhook Management (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { WebhookDeliveryProcessor } from '../processors/webhook-delivery.processor';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';
import { OutgoingWebhook } from '../../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog, DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;
  let webhookRepo: any;
  let deliveryLogRepo: any;
  let webhookService: any;
  let deliveryQueue: any;

  const mockWebhookId = '33333333-3333-3333-3333-333333333333';
  const mockDeliveryLogId = '44444444-4444-4444-4444-444444444444';

  const mockWebhook = {
    id: mockWebhookId,
    workspaceId: '11111111-1111-1111-1111-111111111111',
    name: 'Test',
    url: 'https://example.com/webhook',
    events: ['agent.task.started'],
    headers: {},
    secretHash: 'encrypted',
    isActive: true,
    failureCount: 0,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
  };

  const mockDeliveryLog = {
    id: mockDeliveryLogId,
    webhookId: mockWebhookId,
    eventType: 'agent.task.started',
    payload: { test: true },
    status: DeliveryStatus.PENDING,
    attemptNumber: 1,
    maxAttempts: 4,
  };

  beforeEach(async () => {
    webhookRepo = {
      findOne: jest.fn().mockResolvedValue(mockWebhook),
    };

    deliveryLogRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };

    webhookService = {
      executeDelivery: jest.fn().mockResolvedValue(undefined),
      getRetryDelay: jest.fn().mockReturnValue(1000),
    };

    deliveryQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryProcessor,
        { provide: getRepositoryToken(OutgoingWebhook), useValue: webhookRepo },
        { provide: getRepositoryToken(WebhookDeliveryLog), useValue: deliveryLogRepo },
        { provide: OutgoingWebhookService, useValue: webhookService },
        { provide: getQueueToken('webhook-delivery'), useValue: deliveryQueue },
      ],
    }).compile();

    processor = module.get<WebhookDeliveryProcessor>(WebhookDeliveryProcessor);
  });

  it('should call executeDelivery with correct webhook and delivery log', async () => {
    deliveryLogRepo.findOne
      .mockResolvedValueOnce(mockDeliveryLog) // First call: fetch delivery log
      .mockResolvedValueOnce({ ...mockDeliveryLog, status: DeliveryStatus.SUCCESS }); // After execution

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(webhookService.executeDelivery).toHaveBeenCalledWith(
      mockWebhook,
      mockDeliveryLog,
    );
  });

  it('should skip delivery when webhook is deleted (not found)', async () => {
    webhookRepo.findOne.mockResolvedValue(null);
    deliveryLogRepo.findOne.mockResolvedValue(mockDeliveryLog);

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(webhookService.executeDelivery).not.toHaveBeenCalled();
  });

  it('should skip delivery when webhook is inactive', async () => {
    webhookRepo.findOne.mockResolvedValue({ ...mockWebhook, isActive: false });
    deliveryLogRepo.findOne.mockResolvedValue(mockDeliveryLog);

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(webhookService.executeDelivery).not.toHaveBeenCalled();
    expect(deliveryLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DeliveryStatus.FAILED }),
    );
  });

  it('should skip delivery when delivery log is not found', async () => {
    deliveryLogRepo.findOne.mockResolvedValue(null);

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(webhookService.executeDelivery).not.toHaveBeenCalled();
  });

  it('should schedule retry on failure when attemptNumber < maxAttempts', async () => {
    deliveryLogRepo.findOne
      .mockResolvedValueOnce(mockDeliveryLog) // fetch
      .mockResolvedValueOnce({ ...mockDeliveryLog, status: DeliveryStatus.FAILED }); // after execution

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(deliveryQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ webhookId: mockWebhookId }),
      expect.objectContaining({ delay: 1000 }),
    );
  });

  it('should mark as permanently failed when attemptNumber >= maxAttempts', async () => {
    const failedLog = {
      ...mockDeliveryLog,
      attemptNumber: 4,
      maxAttempts: 4,
      status: DeliveryStatus.FAILED,
    };
    deliveryLogRepo.findOne
      .mockResolvedValueOnce(failedLog)
      .mockResolvedValueOnce(failedLog);

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    // Should NOT schedule retry
    expect(deliveryQueue.add).not.toHaveBeenCalled();
  });

  it('should update delivery log status to retrying on retry', async () => {
    deliveryLogRepo.findOne
      .mockResolvedValueOnce(mockDeliveryLog)
      .mockResolvedValueOnce({ ...mockDeliveryLog, status: DeliveryStatus.FAILED });

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(deliveryLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DeliveryStatus.RETRYING }),
    );
  });

  it('should calculate correct retry delay for each attempt', async () => {
    deliveryLogRepo.findOne
      .mockResolvedValueOnce({ ...mockDeliveryLog, attemptNumber: 2 })
      .mockResolvedValueOnce({ ...mockDeliveryLog, attemptNumber: 2, status: DeliveryStatus.FAILED });

    webhookService.getRetryDelay.mockReturnValue(10000);

    await processor.handleDelivery({
      data: { webhookId: mockWebhookId, deliveryLogId: mockDeliveryLogId },
    } as any);

    expect(webhookService.getRetryDelay).toHaveBeenCalledWith(2);
    expect(deliveryQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.any(Object),
      expect.objectContaining({ delay: 10000 }),
    );
  });
});
