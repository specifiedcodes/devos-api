import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SsoAuditWebhookService } from './sso-audit-webhook.service';
import { SsoAuditWebhook } from '../../../database/entities/sso-audit-webhook.entity';
import { SsoAuditWebhookDelivery } from '../../../database/entities/sso-audit-webhook-delivery.entity';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';
import * as crypto from 'crypto';

describe('SsoAuditWebhookService', () => {
  let service: SsoAuditWebhookService;

  const mockWebhookRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockDeliveryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockHttpService = {
    axiosRef: {
      post: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAuditWebhookService,
        { provide: getRepositoryToken(SsoAuditWebhook), useValue: mockWebhookRepository },
        { provide: getRepositoryToken(SsoAuditWebhookDelivery), useValue: mockDeliveryRepository },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<SsoAuditWebhookService>(SsoAuditWebhookService);
  });

  describe('createWebhook', () => {
    it('should create webhook with correct fields', async () => {
      const webhook = { id: 'wh-1', name: 'Splunk', url: 'https://siem.test.com/api' };
      mockWebhookRepository.create.mockReturnValue(webhook);
      mockWebhookRepository.save.mockResolvedValue(webhook);

      const result = await service.createWebhook({
        workspaceId: 'ws-1',
        name: 'Splunk',
        url: 'https://siem.test.com/api',
        actorId: 'user-1',
      });

      expect(result.name).toBe('Splunk');
      expect(mockWebhookRepository.create).toHaveBeenCalled();
    });

    it('should reject non-HTTPS URL', async () => {
      await expect(service.createWebhook({
        workspaceId: 'ws-1',
        name: 'Test',
        url: 'http://siem.test.com/api',
        actorId: 'user-1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateWebhook', () => {
    it('should apply partial updates', async () => {
      const existing = { id: 'wh-1', workspaceId: 'ws-1', name: 'Old', isActive: true, consecutiveFailures: 0 };
      mockWebhookRepository.findOne.mockResolvedValue({ ...existing });
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      const result = await service.updateWebhook({
        webhookId: 'wh-1',
        workspaceId: 'ws-1',
        name: 'New Name',
        actorId: 'user-1',
      });

      expect(result.name).toBe('New Name');
    });

    it('should reset consecutive failures on re-activation', async () => {
      const existing = { id: 'wh-1', workspaceId: 'ws-1', isActive: false, consecutiveFailures: 5 };
      mockWebhookRepository.findOne.mockResolvedValue({ ...existing });
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      const result = await service.updateWebhook({
        webhookId: 'wh-1',
        workspaceId: 'ws-1',
        isActive: true,
        actorId: 'user-1',
      });

      expect(result.consecutiveFailures).toBe(0);
      expect(result.isActive).toBe(true);
    });

    it('should reject when not found', async () => {
      mockWebhookRepository.findOne.mockResolvedValue(null);

      await expect(service.updateWebhook({
        webhookId: 'nonexistent',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteWebhook', () => {
    it('should remove webhook', async () => {
      const webhook = { id: 'wh-1', workspaceId: 'ws-1' };
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockWebhookRepository.remove.mockResolvedValue(undefined);

      await service.deleteWebhook('wh-1', 'ws-1');
      expect(mockWebhookRepository.remove).toHaveBeenCalledWith(webhook);
    });

    it('should throw when not found', async () => {
      mockWebhookRepository.findOne.mockResolvedValue(null);
      await expect(service.deleteWebhook('nonexistent', 'ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listWebhooks', () => {
    it('should return all webhooks for workspace', async () => {
      const webhooks = [{ id: 'wh-1' }, { id: 'wh-2' }];
      mockWebhookRepository.find.mockResolvedValue(webhooks);

      const result = await service.listWebhooks('ws-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getWebhook', () => {
    it('should return webhook by ID', async () => {
      const webhook = { id: 'wh-1', workspaceId: 'ws-1' };
      mockWebhookRepository.findOne.mockResolvedValue(webhook);

      const result = await service.getWebhook('wh-1', 'ws-1');
      expect(result.id).toBe('wh-1');
    });

    it('should throw NotFoundException when not found', async () => {
      mockWebhookRepository.findOne.mockResolvedValue(null);
      await expect(service.getWebhook('wh-1', 'ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('queueDelivery', () => {
    const mockEvent = {
      id: 'event-1',
      workspaceId: 'ws-1',
      eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
    } as any;

    it('should create pending delivery records for matching webhooks', async () => {
      const webhooks = [
        { id: 'wh-1', workspaceId: 'ws-1', isActive: true, eventTypes: ['saml_login_success'] },
      ];
      mockWebhookRepository.find.mockResolvedValue(webhooks);
      mockDeliveryRepository.create.mockImplementation(d => d);
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve({ id: 'del-1', ...d }));

      await service.queueDelivery(mockEvent);
      expect(mockDeliveryRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should skip webhooks that do not match event type', async () => {
      const webhooks = [
        { id: 'wh-1', workspaceId: 'ws-1', isActive: true, eventTypes: ['oidc_login_failure'] },
      ];
      mockWebhookRepository.find.mockResolvedValue(webhooks);

      await service.queueDelivery(mockEvent);
      expect(mockDeliveryRepository.save).not.toHaveBeenCalled();
    });

    it('should deliver to webhooks with empty eventTypes (all events)', async () => {
      const webhooks = [
        { id: 'wh-1', workspaceId: 'ws-1', isActive: true, eventTypes: [] },
      ];
      mockWebhookRepository.find.mockResolvedValue(webhooks);
      mockDeliveryRepository.create.mockImplementation(d => d);
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));

      await service.queueDelivery(mockEvent);
      expect(mockDeliveryRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should skip inactive webhooks (filtered by query)', async () => {
      mockWebhookRepository.find.mockResolvedValue([]);

      await service.queueDelivery(mockEvent);
      expect(mockDeliveryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processDeliveries', () => {
    const mockWebhook = {
      id: 'wh-1',
      url: 'https://test.com/webhook',
      secret: 'test-secret',
      headers: {},
      timeoutMs: 5000,
      retryCount: 3,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 10,
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
      isActive: true,
    };

    const mockEventData = {
      id: 'event-1',
      eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
      workspaceId: 'ws-1',
      actorId: 'user-1',
      targetUserId: null,
      ipAddress: '192.168.1.1',
      details: {},
      createdAt: new Date('2026-01-15T10:00:00Z'),
    };

    it('should make HTTP POST with correct headers and payload', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200, data: 'OK' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();

      expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(1);
      const callArgs = mockHttpService.axiosRef.post.mock.calls[0];
      expect(callArgs[0]).toBe('https://test.com/webhook');
      const headers = callArgs[2].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers[SSO_AUDIT_CONSTANTS.WEBHOOK_EVENT_HEADER]).toBe(SsoAuditEventType.SAML_LOGIN_SUCCESS);
    });

    it('should compute HMAC signature correctly', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook, secret: 'test-secret' },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200, data: 'OK' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();

      const callArgs = mockHttpService.axiosRef.post.mock.calls[0];
      const headers = callArgs[2].headers;
      expect(headers[SSO_AUDIT_CONSTANTS.WEBHOOK_SIGNATURE_HEADER]).toMatch(/^sha256=[a-f0-9]+$/);
    });

    it('should update delivery status to success on 2xx', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200, data: 'OK' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      const count = await service.processDeliveries();
      expect(count).toBe(1);
      expect(delivery.status).toBe('success');
    });

    it('should update delivery status to failure on non-2xx', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook, retryCount: 0 },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500, data: 'Server Error' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();
      expect(delivery.status).toBe('failure');
    });

    it('should create retry delivery on failure when attempts remain', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook, retryCount: 3 },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500, data: 'Error' });
      mockDeliveryRepository.create.mockImplementation(d => d);
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();

      // Check that a retry was created
      const saveCallsWithPending = mockDeliveryRepository.save.mock.calls
        .filter((call: any[]) => call[0].status === 'pending' && call[0].attemptNumber === 2);
      expect(saveCallsWithPending.length).toBe(1);
    });

    it('should auto-disable webhook after max consecutive failures', async () => {
      const webhook = { ...mockWebhook, consecutiveFailures: 9, maxConsecutiveFailures: 10 };
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 3,
        webhook,
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500, data: 'Error' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();

      expect(webhook.isActive).toBe(false);
    });

    it('should truncate response body to max length', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook, retryCount: 0 },
        event: { ...mockEventData },
      };

      const longResponse = 'x'.repeat(2000);
      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500, data: longResponse });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();
      expect(delivery.responseBody!.length).toBeLessThanOrEqual(SSO_AUDIT_CONSTANTS.WEBHOOK_RESPONSE_BODY_MAX_LENGTH);
    });

    it('should handle timeout via AbortController with cleanup', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: { ...mockWebhook, retryCount: 0 },
        event: { ...mockEventData },
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockHttpService.axiosRef.post.mockRejectedValue({ name: 'AbortError', code: 'ERR_CANCELED', message: 'Request timed out' });
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));
      mockWebhookRepository.save.mockImplementation(w => Promise.resolve(w));

      await service.processDeliveries();
      expect(delivery.status).toBe('timeout');
    });

    it('should handle missing webhook or event', async () => {
      const delivery = {
        id: 'del-1',
        webhookId: 'wh-1',
        eventId: 'event-1',
        status: 'pending',
        attemptNumber: 1,
        webhook: null,
        event: null,
      };

      mockDeliveryRepository.find.mockResolvedValue([delivery]);
      mockDeliveryRepository.save.mockImplementation(d => Promise.resolve(d));

      const count = await service.processDeliveries();
      expect(count).toBe(1);
      expect(delivery.status).toBe('failure');
    });
  });

  describe('listDeliveries', () => {
    it('should return paginated deliveries', async () => {
      mockWebhookRepository.findOne.mockResolvedValue({ id: 'wh-1', workspaceId: 'ws-1' });
      mockDeliveryRepository.findAndCount.mockResolvedValue([
        [{ id: 'del-1' }, { id: 'del-2' }],
        2,
      ]);

      const result = await service.listDeliveries('wh-1', 'ws-1', 1, 50);
      expect(result.deliveries).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('testWebhook', () => {
    it('should send test payload and return result', async () => {
      const webhook = {
        id: 'wh-1',
        workspaceId: 'ws-1',
        url: 'https://test.com/webhook',
        secret: null,
        headers: {},
        timeoutMs: 5000,
      };
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200, data: 'OK' });

      const result = await service.testWebhook('wh-1', 'ws-1');
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should return failure on non-2xx', async () => {
      const webhook = {
        id: 'wh-1',
        workspaceId: 'ws-1',
        url: 'https://test.com/webhook',
        secret: null,
        headers: {},
        timeoutMs: 5000,
      };
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500, data: 'Error' });

      const result = await service.testWebhook('wh-1', 'ws-1');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('cleanupDeliveryLogs', () => {
    it('should delete old delivery logs', async () => {
      const qb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 100 }),
      };
      mockDeliveryRepository.createQueryBuilder.mockReturnValue(qb);

      const count = await service.cleanupDeliveryLogs(30);
      expect(count).toBe(100);
    });
  });
});
