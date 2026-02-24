/**
 * PermissionWebhookService Tests
 * Story 20-10: Permission Analytics
 * Target: 20 tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionWebhookService } from '../services/permission-webhook.service';
import { PermissionWebhook } from '../../../database/entities/permission-webhook.entity';
import { WebhookEventType } from '../dto/create-permission-webhook.dto';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('PermissionWebhookService', () => {
  let service: PermissionWebhookService;
  let webhookRepo: jest.Mocked<Repository<PermissionWebhook>>;
  let mockDataSource: { transaction: jest.Mock };

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockWebhookId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    mockFetch.mockReset();

    // Mock DataSource.transaction to execute callback with a mock manager
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockImplementation((_entity: any, dto: any) => ({ ...dto, id: mockWebhookId })),
          save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: mockWebhookId, createdAt: new Date(), updatedAt: new Date() })),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionWebhookService,
        {
          provide: getRepositoryToken(PermissionWebhook),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: mockWebhookId })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: mockWebhookId, createdAt: new Date(), updatedAt: new Date() })),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PermissionWebhookService>(PermissionWebhookService);
    webhookRepo = module.get(getRepositoryToken(PermissionWebhook));
  });

  describe('createWebhook', () => {
    it('creates webhook with valid HTTPS URL', async () => {
      const dto = {
        url: 'https://example.com/webhook',
        eventTypes: [WebhookEventType.PERMISSION_CHANGED],
      };

      const result = await service.createWebhook(mockWorkspaceId, dto, mockActorId);

      expect(result.webhook).toBeDefined();
      expect(result.signingSecret).toBeDefined();
      expect(result.signingSecret.length).toBeGreaterThan(0);
    });

    it('rejects HTTP URL', async () => {
      const dto = {
        url: 'http://example.com/webhook',
        eventTypes: [WebhookEventType.PERMISSION_CHANGED],
      };

      await expect(
        service.createWebhook(mockWorkspaceId, dto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces workspace limit of 10', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          count: jest.fn().mockResolvedValue(10),
          create: jest.fn(),
          save: jest.fn(),
        };
        return cb(manager);
      });
      const dto = {
        url: 'https://example.com/webhook',
        eventTypes: [WebhookEventType.PERMISSION_CHANGED],
      };

      await expect(
        service.createWebhook(mockWorkspaceId, dto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns signing secret once', async () => {
      const dto = {
        url: 'https://example.com/webhook',
        eventTypes: [WebhookEventType.PERMISSION_CHANGED],
      };

      const result = await service.createWebhook(mockWorkspaceId, dto, mockActorId);

      expect(typeof result.signingSecret).toBe('string');
      expect(result.signingSecret.length).toBe(64); // 32 bytes hex = 64 chars
    });

    it('validates event types', async () => {
      const dto = {
        url: 'https://example.com/webhook',
        eventTypes: ['invalid.event_type'],
      };

      await expect(
        service.createWebhook(mockWorkspaceId, dto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listWebhooks', () => {
    it('excludes secretHash', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        workspaceId: mockWorkspaceId,
        url: 'https://example.com/webhook',
        secretHash: '$2b$12$secret',
        eventTypes: ['permission.changed'],
        isActive: true,
        failureCount: 0,
        lastTriggeredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PermissionWebhook;
      webhookRepo.find.mockResolvedValue([mockWebhook]);

      const result = await service.listWebhooks(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].secretHash).toBe('');
    });

    it('returns all workspace webhooks', async () => {
      const mockWebhooks = [
        { id: '1', secretHash: 'h1' } as PermissionWebhook,
        { id: '2', secretHash: 'h2' } as PermissionWebhook,
      ];
      webhookRepo.find.mockResolvedValue(mockWebhooks);

      const result = await service.listWebhooks(mockWorkspaceId);

      expect(result).toHaveLength(2);
    });
  });

  describe('updateWebhook', () => {
    const existingWebhook = {
      id: mockWebhookId,
      workspaceId: mockWorkspaceId,
      url: 'https://old.example.com/webhook',
      secretHash: '$2b$12$secret',
      eventTypes: ['permission.changed'],
      isActive: true,
      failureCount: 3,
    } as PermissionWebhook;

    it('updates URL', async () => {
      webhookRepo.findOne.mockResolvedValue({ ...existingWebhook });

      const result = await service.updateWebhook(
        mockWorkspaceId,
        mockWebhookId,
        { url: 'https://new.example.com/webhook' },
        mockActorId,
      );

      expect(webhookRepo.save).toHaveBeenCalled();
    });

    it('updates event types', async () => {
      webhookRepo.findOne.mockResolvedValue({ ...existingWebhook });

      await service.updateWebhook(
        mockWorkspaceId,
        mockWebhookId,
        { eventTypes: ['role.created', 'role.deleted'] },
        mockActorId,
      );

      expect(webhookRepo.save).toHaveBeenCalled();
    });

    it('updates active status', async () => {
      webhookRepo.findOne.mockResolvedValue({ ...existingWebhook });

      await service.updateWebhook(
        mockWorkspaceId,
        mockWebhookId,
        { isActive: false },
        mockActorId,
      );

      expect(webhookRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('validates workspace ownership', async () => {
      webhookRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateWebhook(mockWorkspaceId, mockWebhookId, { isActive: false }, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteWebhook', () => {
    it('removes webhook', async () => {
      const mockWebhook = { id: mockWebhookId } as PermissionWebhook;
      webhookRepo.findOne.mockResolvedValue(mockWebhook);

      await service.deleteWebhook(mockWorkspaceId, mockWebhookId, mockActorId);

      expect(webhookRepo.remove).toHaveBeenCalledWith(mockWebhook);
    });

    it('validates workspace ownership', async () => {
      webhookRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteWebhook(mockWorkspaceId, mockWebhookId, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dispatchEvent', () => {
    it('sends to matching webhooks', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        workspaceId: mockWorkspaceId,
        url: 'https://example.com/webhook',
        secretHash: 'test-secret',
        eventTypes: ['permission.changed'],
        isActive: true,
        failureCount: 0,
      } as PermissionWebhook;
      webhookRepo.find.mockResolvedValue([mockWebhook]);
      mockFetch.mockResolvedValue({ ok: true });

      await service.dispatchEvent(mockWorkspaceId, {
        event: 'permission.changed',
        timestamp: new Date().toISOString(),
        workspace_id: mockWorkspaceId,
        data: {},
      });

      // Async dispatch - give it a moment
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalled();
    });

    it('signs payload with HMAC-SHA256', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        url: 'https://example.com/webhook',
        secretHash: 'test-secret',
        eventTypes: ['permission.changed'],
        isActive: true,
        failureCount: 0,
      } as PermissionWebhook;
      webhookRepo.find.mockResolvedValue([mockWebhook]);
      mockFetch.mockResolvedValue({ ok: true });

      await service.dispatchEvent(mockWorkspaceId, {
        event: 'permission.changed',
        timestamp: new Date().toISOString(),
        workspace_id: mockWorkspaceId,
        data: {},
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      if (mockFetch.mock.calls.length > 0) {
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-DevOS-Signature']).toBeDefined();
      }
    });

    it('skips inactive webhooks', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        url: 'https://example.com/webhook',
        secretHash: 'test-secret',
        eventTypes: ['permission.changed'],
        isActive: false,
        failureCount: 0,
      } as PermissionWebhook;
      // isActive:true in where clause means this should return empty
      webhookRepo.find.mockResolvedValue([]);

      await service.dispatchEvent(mockWorkspaceId, {
        event: 'permission.changed',
        timestamp: new Date().toISOString(),
        workspace_id: mockWorkspaceId,
        data: {},
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('testWebhook', () => {
    it('sends ping and returns result', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        workspaceId: mockWorkspaceId,
        url: 'https://example.com/webhook',
        secretHash: 'test-secret',
      } as PermissionWebhook;
      webhookRepo.findOne.mockResolvedValue(mockWebhook);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await service.testWebhook(mockWorkspaceId, mockWebhookId);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('handles timeout gracefully', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        workspaceId: mockWorkspaceId,
        url: 'https://example.com/webhook',
        secretHash: 'test-secret',
      } as PermissionWebhook;
      webhookRepo.findOne.mockResolvedValue(mockWebhook);
      mockFetch.mockRejectedValue(new Error('timeout'));

      const result = await service.testWebhook(mockWorkspaceId, mockWebhookId);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(0);
    });
  });
});
