/**
 * OutgoingWebhookController Tests
 * Story 21-8: Webhook Management (AC8)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OutgoingWebhookController } from '../controllers/outgoing-webhook.controller';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../../shared/guards/workspace-access.guard';
import { RoleGuard } from '../../../../common/guards/role.guard';
import { DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';

describe('OutgoingWebhookController', () => {
  let controller: OutgoingWebhookController;
  let service: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockWebhookId = '33333333-3333-3333-3333-333333333333';
  const mockDeliveryId = '44444444-4444-4444-4444-444444444444';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const mockWebhookResponse = {
    id: mockWebhookId,
    name: 'Test Webhook',
    url: 'https://example.com/webhook',
    events: ['agent.task.started'],
    isActive: true,
    failureCount: 0,
    consecutiveFailures: 0,
    lastTriggeredAt: null,
    lastDeliveryStatus: null,
    createdBy: mockUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockDeliveryLogResponse = {
    id: mockDeliveryId,
    webhookId: mockWebhookId,
    eventType: 'test.ping',
    status: 'success',
    responseCode: 200,
    errorMessage: null,
    attemptNumber: 1,
    maxAttempts: 4,
    durationMs: 150,
    nextRetryAt: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    service = {
      listWebhooks: jest.fn().mockResolvedValue([mockWebhookResponse]),
      createWebhook: jest.fn().mockResolvedValue({
        webhook: mockWebhookResponse,
        secret: 'a'.repeat(64),
      }),
      getWebhook: jest.fn().mockResolvedValue(mockWebhookResponse),
      updateWebhook: jest.fn().mockResolvedValue(mockWebhookResponse),
      deleteWebhook: jest.fn().mockResolvedValue(undefined),
      testWebhook: jest.fn().mockResolvedValue(mockDeliveryLogResponse),
      rotateSecret: jest.fn().mockResolvedValue({ secret: 'b'.repeat(64) }),
      getDeliveryLogs: jest.fn().mockResolvedValue({
        items: [mockDeliveryLogResponse],
        total: 1,
      }),
      retryDelivery: jest.fn().mockResolvedValue({
        ...mockDeliveryLogResponse,
        status: 'retrying',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutgoingWebhookController],
      providers: [
        { provide: OutgoingWebhookService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OutgoingWebhookController>(OutgoingWebhookController);
  });

  describe('GET /webhooks', () => {
    it('should return array of webhooks', async () => {
      const result = await controller.listWebhooks(mockWorkspaceId);
      expect(result).toHaveLength(1);
      expect(service.listWebhooks).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should return empty array when no webhooks exist', async () => {
      service.listWebhooks.mockResolvedValue([]);
      const result = await controller.listWebhooks(mockWorkspaceId);
      expect(result).toHaveLength(0);
    });
  });

  describe('POST /webhooks', () => {
    it('should create webhook and return with secret', async () => {
      const req = { user: { id: mockUserId } } as any;
      const result = await controller.createWebhook(
        mockWorkspaceId,
        { name: 'Test', url: 'https://example.com/webhook', events: ['agent.task.started'] },
        req,
      );
      expect(result).toHaveProperty('secret');
      expect(service.createWebhook).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.any(Object),
        mockUserId,
      );
    });
  });

  describe('GET /webhooks/:webhookId', () => {
    it('should return webhook details', async () => {
      const result = await controller.getWebhook(mockWorkspaceId, mockWebhookId);
      expect(result.id).toBe(mockWebhookId);
    });
  });

  describe('PUT /webhooks/:webhookId', () => {
    it('should return updated webhook', async () => {
      const result = await controller.updateWebhook(
        mockWorkspaceId,
        mockWebhookId,
        { name: 'Updated' },
      );
      expect(result).toBeDefined();
      expect(service.updateWebhook).toHaveBeenCalledWith(
        mockWorkspaceId, mockWebhookId, { name: 'Updated' },
      );
    });
  });

  describe('DELETE /webhooks/:webhookId', () => {
    it('should call deleteWebhook on service', async () => {
      await controller.deleteWebhook(mockWorkspaceId, mockWebhookId);
      expect(service.deleteWebhook).toHaveBeenCalledWith(mockWorkspaceId, mockWebhookId);
    });
  });

  describe('POST /webhooks/:webhookId/test', () => {
    it('should return delivery result', async () => {
      const result = await controller.testWebhook(
        mockWorkspaceId,
        mockWebhookId,
        {},
      );
      expect(result).toHaveProperty('status');
      expect(service.testWebhook).toHaveBeenCalledWith(
        mockWorkspaceId, mockWebhookId, {},
      );
    });
  });

  describe('POST /webhooks/:webhookId/rotate-secret', () => {
    it('should return new secret', async () => {
      const result = await controller.rotateSecret(mockWorkspaceId, mockWebhookId);
      expect(result).toHaveProperty('secret');
      expect(result.secret).toHaveLength(64);
    });
  });

  describe('GET /webhooks/:webhookId/deliveries', () => {
    it('should return paginated delivery logs', async () => {
      const result = await controller.getDeliveryLogs(
        mockWorkspaceId,
        mockWebhookId,
        {},
      );
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('should support status filter', async () => {
      await controller.getDeliveryLogs(
        mockWorkspaceId,
        mockWebhookId,
        { status: 'failed' },
      );
      expect(service.getDeliveryLogs).toHaveBeenCalledWith(
        mockWorkspaceId, mockWebhookId, { status: 'failed' },
      );
    });
  });

  describe('POST /webhooks/:webhookId/deliveries/:deliveryId/retry', () => {
    it('should retry failed delivery', async () => {
      const result = await controller.retryDelivery(
        mockWorkspaceId,
        mockWebhookId,
        mockDeliveryId,
      );
      expect(result).toBeDefined();
      expect(service.retryDelivery).toHaveBeenCalledWith(
        mockWorkspaceId, mockWebhookId, mockDeliveryId,
      );
    });
  });
});
