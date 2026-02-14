/**
 * Push Notification Service Tests
 * Story 10.4: Push Notifications Setup
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, In, LessThan } from 'typeorm';
import * as webPush from 'web-push';
import { PushNotificationService } from '../push.service';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';
import { PushNotificationPayloadDto, NotificationUrgency } from '../push.dto';

// Mock web-push
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
});

const mockConfigService = () => ({
  get: jest.fn((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@example.com',
    };
    return config[key] ?? defaultValue;
  }),
});

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let repository: jest.Mocked<Repository<PushSubscription>>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: getRepositoryToken(PushSubscription),
          useFactory: mockRepository,
        },
        {
          provide: ConfigService,
          useFactory: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    repository = module.get(getRepositoryToken(PushSubscription));
    configService = module.get(ConfigService);

    // Trigger onModuleInit
    service.onModuleInit();
  });

  describe('initialization', () => {
    it('should set VAPID details on module init', () => {
      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'test-public-key',
        'test-private-key',
      );
    });

    it('should report as enabled when configured', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return public key', () => {
      expect(service.getPublicKey()).toBe('test-public-key');
    });
  });

  describe('createSubscription', () => {
    const mockKeys = {
      p256dh: 'test-p256dh',
      auth: 'test-auth',
    };

    it('should create new subscription when endpoint not exists', async () => {
      const userId = 'user-123';
      const workspaceId = 'workspace-123';
      const endpoint = 'https://push.example.com/endpoint';

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({
        id: 'sub-123',
        userId,
        workspaceId,
        endpoint,
        keys: mockKeys,
      } as PushSubscription);
      repository.save.mockResolvedValue({
        id: 'sub-123',
        userId,
        workspaceId,
        endpoint,
        keys: mockKeys,
        createdAt: new Date(),
      } as PushSubscription);

      const result = await service.createSubscription(
        userId,
        workspaceId,
        endpoint,
        mockKeys,
      );

      expect(repository.findOne).toHaveBeenCalledWith({ where: { endpoint } });
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result.id).toBe('sub-123');
    });

    it('should update existing subscription when endpoint exists', async () => {
      const userId = 'user-123';
      const workspaceId = 'workspace-123';
      const endpoint = 'https://push.example.com/endpoint';

      const existingSubscription = {
        id: 'sub-existing',
        userId: 'old-user',
        workspaceId: 'old-workspace',
        endpoint,
        keys: mockKeys,
      } as PushSubscription;

      repository.findOne.mockResolvedValue(existingSubscription);
      repository.save.mockResolvedValue({
        ...existingSubscription,
        userId,
        workspaceId,
      } as PushSubscription);

      const result = await service.createSubscription(
        userId,
        workspaceId,
        endpoint,
        mockKeys,
      );

      expect(repository.findOne).toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result.userId).toBe(userId);
    });

    it('should set expiration time when provided', async () => {
      const userId = 'user-123';
      const workspaceId = 'workspace-123';
      const endpoint = 'https://push.example.com/endpoint';
      const expirationTime = Date.now() + 86400000;

      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data: any) => data);
      repository.save.mockImplementation((data: any) => Promise.resolve({
        ...data,
        id: 'sub-123',
        createdAt: new Date(),
      }));

      await service.createSubscription(
        userId,
        workspaceId,
        endpoint,
        mockKeys,
        undefined,
        undefined,
        expirationTime,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('deleteSubscription', () => {
    it('should delete subscription by endpoint and userId', async () => {
      const userId = 'user-123';
      const endpoint = 'https://push.example.com/endpoint';

      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      const result = await service.deleteSubscription(endpoint, userId);

      expect(repository.delete).toHaveBeenCalledWith({ endpoint, userId });
      expect(result).toBe(true);
    });

    it('should return false when subscription not found', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: {} });

      const result = await service.deleteSubscription('endpoint', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return subscriptions for user', async () => {
      const userId = 'user-123';
      const mockSubscriptions = [
        { id: 'sub-1', userId, endpoint: 'endpoint-1' },
        { id: 'sub-2', userId, endpoint: 'endpoint-2' },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const result = await service.getUserSubscriptions(userId);

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('sendToUser', () => {
    const mockPayload: PushNotificationPayloadDto = {
      id: 'notif-123',
      title: 'Test Notification',
      body: 'Test body',
      url: '/dashboard',
      type: 'test',
    };

    it('should send to all user subscriptions', async () => {
      const userId = 'user-123';
      const mockSubscriptions = [
        { id: 'sub-1', userId, endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
        { id: 'sub-2', userId, endpoint: 'endpoint-2', keys: { p256dh: 'key2', auth: 'auth2' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const results = await service.sendToUser(userId, mockPayload);

      expect(repository.find).toHaveBeenCalledWith({ where: { userId } });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should return empty array when no subscriptions', async () => {
      repository.find.mockResolvedValue([]);

      const results = await service.sendToUser('user-123', mockPayload);

      expect(results).toHaveLength(0);
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle send failures', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      const results = await service.sendToUser('user-123', mockPayload);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Network error');
    });

    it('should delete expired subscriptions (410)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      const error = new Error('Gone') as any;
      error.statusCode = 410;
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error);
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.sendToUser('user-123', mockPayload);

      expect(repository.delete).toHaveBeenCalledWith({ id: In(['sub-1']) });
    });

    it('should delete expired subscriptions (404)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      const error = new Error('Not Found') as any;
      error.statusCode = 404;
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error);
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.sendToUser('user-123', mockPayload);

      expect(repository.delete).toHaveBeenCalledWith({ id: In(['sub-1']) });
    });
  });

  describe('sendToWorkspace', () => {
    const mockPayload: PushNotificationPayloadDto = {
      id: 'notif-123',
      title: 'Test Notification',
      body: 'Test body',
      url: '/dashboard',
      type: 'test',
    };

    it('should send to all workspace subscriptions', async () => {
      const workspaceId = 'workspace-123';
      const mockSubscriptions = [
        { id: 'sub-1', userId: 'user-1', workspaceId, endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
        { id: 'sub-2', userId: 'user-2', workspaceId, endpoint: 'endpoint-2', keys: { p256dh: 'key2', auth: 'auth2' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const results = await service.sendToWorkspace(workspaceId, mockPayload);

      expect(repository.find).toHaveBeenCalledWith({ where: { workspaceId } });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it('should exclude specified user', async () => {
      const workspaceId = 'workspace-123';
      const mockSubscriptions = [
        { id: 'sub-1', userId: 'user-1', workspaceId, endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
        { id: 'sub-2', userId: 'user-2', workspaceId, endpoint: 'endpoint-2', keys: { p256dh: 'key2', auth: 'auth2' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const results = await service.sendToWorkspace(workspaceId, mockPayload, 'user-1');

      // Only user-2's subscription should be sent
      expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
    });
  });

  describe('cleanupStaleSubscriptions', () => {
    it('should delete subscriptions not used in specified days', async () => {
      repository.delete.mockResolvedValue({ affected: 5, raw: {} });

      const result = await service.cleanupStaleSubscriptions(30);

      expect(repository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedAt: expect.any(Object),
        }),
      );
      expect(result).toBe(5);
    });

    it('should use custom days parameter', async () => {
      repository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.cleanupStaleSubscriptions(60);

      expect(repository.delete).toHaveBeenCalled();
    });
  });

  describe('urgency mapping', () => {
    it('should use correct urgency in push options', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const payload: PushNotificationPayloadDto = {
        id: 'notif-123',
        title: 'High Priority',
        body: 'Urgent notification',
        url: '/dashboard',
        type: 'alert',
        urgency: NotificationUrgency.HIGH,
      };

      await service.sendToUser('user-123', payload);

      expect(webPush.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ urgency: 'high' }),
      );
    });
  });

  describe('countSubscriptions', () => {
    it('should count user subscriptions', async () => {
      repository.count.mockResolvedValue(3);

      const result = await service.countUserSubscriptions('user-123');

      expect(repository.count).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(result).toBe(3);
    });

    it('should count workspace subscriptions', async () => {
      repository.count.mockResolvedValue(10);

      const result = await service.countWorkspaceSubscriptions('workspace-123');

      expect(repository.count).toHaveBeenCalledWith({ where: { workspaceId: 'workspace-123' } });
      expect(result).toBe(10);
    });
  });
});
