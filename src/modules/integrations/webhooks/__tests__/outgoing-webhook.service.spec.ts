/**
 * OutgoingWebhookService Tests
 * Story 21-8: Webhook Management (AC6)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';
import { OutgoingWebhook } from '../../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog, DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

describe('OutgoingWebhookService', () => {
  let service: OutgoingWebhookService;
  let webhookRepo: any;
  let deliveryLogRepo: any;
  let deliveryQueue: any;
  let encryptionService: any;
  let redisService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockWebhookId = '33333333-3333-3333-3333-333333333333';

  const mockWebhook: Partial<OutgoingWebhook> = {
    id: mockWebhookId,
    workspaceId: mockWorkspaceId,
    name: 'Test Webhook',
    url: 'https://example.com/webhook',
    events: ['agent.task.started', 'agent.task.completed'],
    headers: {},
    secretHash: 'encrypted-secret',
    isActive: true,
    failureCount: 0,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastTriggeredAt: null,
    lastDeliveryStatus: null,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    webhookRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...mockWebhook, ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ ...mockWebhook, ...data })),
      find: jest.fn().mockResolvedValue([mockWebhook]),
      findOne: jest.fn().mockResolvedValue(mockWebhook),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(mockWebhook),
    };

    deliveryLogRepo = {
      create: jest.fn().mockImplementation((data) => ({
        id: '44444444-4444-4444-4444-444444444444',
        ...data,
        createdAt: new Date(),
      })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({
        ...data,
        id: data.id || '44444444-4444-4444-4444-444444444444',
      })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    deliveryQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue('encrypted-value'),
      decrypt: jest.fn().mockReturnValue('decrypted-value'),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutgoingWebhookService,
        { provide: getRepositoryToken(OutgoingWebhook), useValue: webhookRepo },
        { provide: getRepositoryToken(WebhookDeliveryLog), useValue: deliveryLogRepo },
        { provide: getQueueToken('webhook-delivery'), useValue: deliveryQueue },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<OutgoingWebhookService>(OutgoingWebhookService);
  });

  describe('createWebhook', () => {
    it('should create webhook with auto-generated secret', async () => {
      webhookRepo.count.mockResolvedValue(0);
      const result = await service.createWebhook(mockWorkspaceId, {
        name: 'New Webhook',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      }, mockUserId);

      expect(result.webhook).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(result.secret).toHaveLength(64); // 32 bytes hex
    });

    it('should encrypt secret via EncryptionService', async () => {
      webhookRepo.count.mockResolvedValue(0);
      await service.createWebhook(mockWorkspaceId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      }, mockUserId);

      expect(encryptionService.encrypt).toHaveBeenCalled();
    });

    it('should encrypt headers via EncryptionService', async () => {
      webhookRepo.count.mockResolvedValue(0);
      await service.createWebhook(mockWorkspaceId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
        headers: { Authorization: 'Bearer token' },
      }, mockUserId);

      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        expect.stringContaining('Authorization'),
      );
    });

    it('should reject invalid event types with BadRequestException', async () => {
      webhookRepo.count.mockResolvedValue(0);
      await expect(
        service.createWebhook(mockWorkspaceId, {
          name: 'Test',
          url: 'https://example.com/webhook',
          events: ['invalid.event'],
        }, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce max 10 webhooks per workspace', async () => {
      webhookRepo.count.mockResolvedValue(10);
      await expect(
        service.createWebhook(mockWorkspaceId, {
          name: 'Test',
          url: 'https://example.com/webhook',
          events: ['agent.task.started'],
        }, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return raw secret in response', async () => {
      webhookRepo.count.mockResolvedValue(0);
      const result = await service.createWebhook(mockWorkspaceId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      }, mockUserId);

      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBe(64);
    });

    it('should invalidate cache on create', async () => {
      webhookRepo.count.mockResolvedValue(0);
      await service.createWebhook(mockWorkspaceId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      }, mockUserId);

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining(mockWorkspaceId),
      );
    });
  });

  describe('listWebhooks', () => {
    it('should return all webhooks for workspace', async () => {
      const result = await service.listWebhooks(mockWorkspaceId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockWebhookId);
    });

    it('should return empty array when no webhooks exist', async () => {
      webhookRepo.find.mockResolvedValue([]);
      const result = await service.listWebhooks(mockWorkspaceId);
      expect(result).toHaveLength(0);
    });

    it('should not include secret in response', async () => {
      const result = await service.listWebhooks(mockWorkspaceId);
      expect((result[0] as any).secretHash).toBeUndefined();
      expect((result[0] as any).secret).toBeUndefined();
    });
  });

  describe('getWebhook', () => {
    it('should return single webhook', async () => {
      const result = await service.getWebhook(mockWorkspaceId, mockWebhookId);
      expect(result.id).toBe(mockWebhookId);
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getWebhook(mockWorkspaceId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for webhook in different workspace', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getWebhook('different-workspace', mockWebhookId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateWebhook', () => {
    it('should update name, url, events, headers, isActive', async () => {
      await service.updateWebhook(mockWorkspaceId, mockWebhookId, {
        name: 'Updated',
        url: 'https://new.example.com/webhook',
        events: ['deployment.started'],
        isActive: false,
      });

      expect(webhookRepo.update).toHaveBeenCalled();
    });

    it('should validate new event types', async () => {
      await expect(
        service.updateWebhook(mockWorkspaceId, mockWebhookId, {
          events: ['invalid.event'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reset consecutiveFailures when URL changes', async () => {
      await service.updateWebhook(mockWorkspaceId, mockWebhookId, {
        url: 'https://new.example.com/webhook',
      });

      expect(webhookRepo.update).toHaveBeenCalledWith(
        { id: mockWebhookId },
        expect.objectContaining({ consecutiveFailures: 0 }),
      );
    });

    it('should re-encrypt headers when updated', async () => {
      await service.updateWebhook(mockWorkspaceId, mockWebhookId, {
        headers: { Authorization: 'Bearer new-token' },
      });

      expect(encryptionService.encrypt).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateWebhook(mockWorkspaceId, 'nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache on update', async () => {
      await service.updateWebhook(mockWorkspaceId, mockWebhookId, { name: 'Updated' });
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining(mockWorkspaceId),
      );
    });
  });

  describe('deleteWebhook', () => {
    it('should remove webhook', async () => {
      await service.deleteWebhook(mockWorkspaceId, mockWebhookId);
      expect(webhookRepo.remove).toHaveBeenCalledWith(mockWebhook);
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.deleteWebhook(mockWorkspaceId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache on delete', async () => {
      await service.deleteWebhook(mockWorkspaceId, mockWebhookId);
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining(mockWorkspaceId),
      );
    });
  });

  describe('rotateSecret', () => {
    it('should generate new secret and return raw value', async () => {
      const result = await service.rotateSecret(mockWorkspaceId, mockWebhookId);
      expect(result.secret).toBeDefined();
      expect(result.secret).toHaveLength(64);
    });

    it('should encrypt new secret via EncryptionService', async () => {
      await service.rotateSecret(mockWorkspaceId, mockWebhookId);
      expect(encryptionService.encrypt).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.rotateSecret(mockWorkspaceId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('testWebhook', () => {
    beforeEach(() => {
      // Mock for the delivery log findOne after execution
      deliveryLogRepo.findOne.mockResolvedValue({
        id: '44444444-4444-4444-4444-444444444444',
        webhookId: mockWebhookId,
        eventType: 'test.ping',
        status: DeliveryStatus.SUCCESS,
        responseCode: 200,
        errorMessage: null,
        attemptNumber: 1,
        maxAttempts: 1,
        durationMs: 100,
        nextRetryAt: null,
        createdAt: new Date(),
      });

      // Mock fetch for the delivery execution
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('OK'),
      }) as any;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should use default test.ping event type when not provided', async () => {
      const result = await service.testWebhook(mockWorkspaceId, mockWebhookId, {});
      expect(deliveryLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'test.ping' }),
      );
      expect(result).toBeDefined();
    });

    it('should record delivery result in delivery log', async () => {
      await service.testWebhook(mockWorkspaceId, mockWebhookId, {});
      expect(deliveryLogRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.testWebhook(mockWorkspaceId, 'nonexistent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDeliveryLogs', () => {
    it('should return paginated results', async () => {
      const result = await service.getDeliveryLogs(mockWorkspaceId, mockWebhookId, {});
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('should default limit to 20 and offset to 0', async () => {
      await service.getDeliveryLogs(mockWorkspaceId, mockWebhookId, {});
      const qb = deliveryLogRepo.createQueryBuilder();
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(0);
    });

    it('should filter by status when provided', async () => {
      await service.getDeliveryLogs(mockWorkspaceId, mockWebhookId, { status: 'failed' });
      const qb = deliveryLogRepo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.status = :status',
        { status: 'failed' },
      );
    });

    it('should throw NotFoundException for non-existent webhook', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getDeliveryLogs(mockWorkspaceId, 'nonexistent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryDelivery', () => {
    const mockDeliveryLog = {
      id: '44444444-4444-4444-4444-444444444444',
      webhookId: mockWebhookId,
      eventType: 'agent.task.started',
      status: DeliveryStatus.FAILED,
      attemptNumber: 1,
      maxAttempts: 4,
      createdAt: new Date(),
    };

    it('should requeue failed delivery via BullMQ', async () => {
      deliveryLogRepo.findOne.mockResolvedValue(mockDeliveryLog);
      await service.retryDelivery(
        mockWorkspaceId, mockWebhookId, mockDeliveryLog.id,
      );
      expect(deliveryQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ webhookId: mockWebhookId }),
        expect.any(Object),
      );
    });

    it('should throw BadRequestException for non-failed delivery', async () => {
      deliveryLogRepo.findOne.mockResolvedValue({
        ...mockDeliveryLog,
        status: DeliveryStatus.SUCCESS,
      });
      await expect(
        service.retryDelivery(mockWorkspaceId, mockWebhookId, mockDeliveryLog.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dispatchEvent', () => {
    it('should queue delivery for each active subscribed webhook', async () => {
      webhookRepo.find.mockResolvedValue([mockWebhook]);
      await service.dispatchEvent(mockWorkspaceId, 'agent.task.started', {
        taskId: 'task-1',
      });
      expect(deliveryQueue.add).toHaveBeenCalled();
    });

    it('should skip inactive webhooks', async () => {
      webhookRepo.find.mockResolvedValue([]);
      await service.dispatchEvent(mockWorkspaceId, 'agent.task.started', {});
      expect(deliveryQueue.add).not.toHaveBeenCalled();
    });

    it('should skip webhooks not subscribed to event type', async () => {
      webhookRepo.find.mockResolvedValue([{
        ...mockWebhook,
        events: ['deployment.started'],
      }]);
      await service.dispatchEvent(mockWorkspaceId, 'agent.task.started', {});
      expect(deliveryQueue.add).not.toHaveBeenCalled();
    });

    it('should use cached active webhooks when available', async () => {
      redisService.get.mockResolvedValue(JSON.stringify([mockWebhook]));
      await service.dispatchEvent(mockWorkspaceId, 'agent.task.started', {});
      // Should use cached data, not query DB
      expect(webhookRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('signPayload', () => {
    it('should create correct HMAC-SHA256 hex signature', () => {
      const signature = service.signPayload('test-secret', '{"test":true}');
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should produce different signatures for different payloads', () => {
      const sig1 = service.signPayload('secret', '{"a":1}');
      const sig2 = service.signPayload('secret', '{"a":2}');
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const sig1 = service.signPayload('secret1', '{"test":true}');
      const sig2 = service.signPayload('secret2', '{"test":true}');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('getRetryDelay', () => {
    it('should return 1s for attempt 1', () => {
      expect(service.getRetryDelay(1)).toBe(1000);
    });

    it('should return 10s for attempt 2', () => {
      expect(service.getRetryDelay(2)).toBe(10000);
    });

    it('should return 60s for attempt 3', () => {
      expect(service.getRetryDelay(3)).toBe(60000);
    });
  });

  describe('toResponseDto (via listWebhooks)', () => {
    it('should never include secret', async () => {
      const result = await service.listWebhooks(mockWorkspaceId);
      const dto = result[0] as any;
      expect(dto.secretHash).toBeUndefined();
      expect(dto.secret).toBeUndefined();
    });

    it('should include required fields', async () => {
      const result = await service.listWebhooks(mockWorkspaceId);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('url');
      expect(result[0]).toHaveProperty('events');
      expect(result[0]).toHaveProperty('isActive');
      expect(result[0]).toHaveProperty('failureCount');
      expect(result[0]).toHaveProperty('consecutiveFailures');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).toHaveProperty('updatedAt');
    });
  });
});
