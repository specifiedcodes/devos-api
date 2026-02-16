/**
 * Push Notification Service Tests
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (enhanced with retry, topics, delivery stats)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, In } from 'typeorm';
import * as webPush from 'web-push';
import { PushNotificationService } from '../push.service';
import { VapidKeyService } from '../services/vapid-key.service';
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
      PUSH_RETRY_DELAY: 1, // Use 1ms for tests (fast)
      PUSH_RETRY_ATTEMPTS: 3,
    };
    return config[key] ?? defaultValue;
  }),
});

const mockVapidKeyService = () => ({
  isEnabled: jest.fn().mockReturnValue(true),
  getPublicKey: jest.fn().mockReturnValue('test-public-key'),
  getSubject: jest.fn().mockReturnValue('mailto:test@example.com'),
  getKeyStatus: jest.fn(),
});

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let repository: jest.Mocked<Repository<PushSubscription>>;
  let configService: jest.Mocked<ConfigService>;
  let vapidKeyService: jest.Mocked<VapidKeyService>;

  beforeEach(async () => {
    jest.resetAllMocks();

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
        {
          provide: VapidKeyService,
          useFactory: mockVapidKeyService,
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    repository = module.get(getRepositoryToken(PushSubscription));
    configService = module.get(ConfigService);
    vapidKeyService = module.get(VapidKeyService);

    // Trigger onModuleInit
    service.onModuleInit();
  });

  describe('initialization - VapidKeyService delegation', () => {
    it('should delegate VAPID configuration check to VapidKeyService', () => {
      expect(vapidKeyService.isEnabled).toHaveBeenCalled();
    });

    it('should report enabled state from VapidKeyService', () => {
      vapidKeyService.isEnabled.mockReturnValue(true);
      expect(service.isEnabled()).toBe(true);

      vapidKeyService.isEnabled.mockReturnValue(false);
      expect(service.isEnabled()).toBe(false);
    });

    it('should return public key from VapidKeyService', () => {
      expect(service.getPublicKey()).toBe('test-public-key');
      expect(vapidKeyService.getPublicKey).toHaveBeenCalled();
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
      const error = new Error('Network error') as any;
      error.statusCode = 400; // non-retryable
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error);

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

    it('should return empty array when push is not configured', async () => {
      vapidKeyService.isEnabled.mockReturnValue(false);

      const results = await service.sendToUser('user-123', mockPayload);

      expect(results).toHaveLength(0);
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

  describe('retry logic', () => {
    const mockPayload: PushNotificationPayloadDto = {
      id: 'notif-123',
      title: 'Test Notification',
      body: 'Test body',
      url: '/dashboard',
      type: 'test',
    };

    it('should retry on 429 error with exponential backoff', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const error429 = new Error('Too Many Requests') as any;
      error429.statusCode = 429;

      (webPush.sendNotification as jest.Mock)
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const results = await service.sendToUser('user-123', mockPayload);

      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(results[0].success).toBe(true);
    });

    it('should retry on 500 error with exponential backoff', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const error500 = new Error('Internal Server Error') as any;
      error500.statusCode = 500;

      (webPush.sendNotification as jest.Mock)
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const results = await service.sendToUser('user-123', mockPayload);

      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(results[0].success).toBe(true);
    });

    it('should not retry on 410 Gone error (not retryable)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const error410 = new Error('Gone') as any;
      error410.statusCode = 410;

      (webPush.sendNotification as jest.Mock).mockRejectedValue(error410);
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      const results = await service.sendToUser('user-123', mockPayload);

      // Should NOT retry - only one call to sendNotification
      expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
      expect(results[0].success).toBe(false);
    });

    it('should not retry on 404 Not Found error (not retryable)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const error404 = new Error('Not Found') as any;
      error404.statusCode = 404;

      (webPush.sendNotification as jest.Mock).mockRejectedValue(error404);
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      const results = await service.sendToUser('user-123', mockPayload);

      expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
      expect(results[0].success).toBe(false);
    });

    it('should stop retrying after max attempts', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);

      const error429 = new Error('Too Many Requests') as any;
      error429.statusCode = 429;

      // All attempts fail
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error429);

      const results = await service.sendToUser('user-123', mockPayload);

      // config.retryAttempts = 3, so 3 total attempts
      expect(webPush.sendNotification).toHaveBeenCalledTimes(3);
      expect(results[0].success).toBe(false);
    });
  });

  describe('sendToTopic', () => {
    it('should send topic-tagged notification to workspace', async () => {
      const workspaceId = 'workspace-123';
      const mockSubscriptions = [
        { id: 'sub-1', userId: 'user-1', workspaceId, endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      const payload: PushNotificationPayloadDto = {
        id: 'notif-123',
        title: 'Topic Test',
        body: 'Topic body',
        url: '/dashboard',
        type: 'test',
      };

      const results = await service.sendToTopic(workspaceId, 'deployment', payload);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      // Verify the payload sent to webPush includes the tag
      const sentPayload = JSON.parse(
        (webPush.sendNotification as jest.Mock).mock.calls[0][1],
      );
      expect(sentPayload.tag).toBe('deployment');
    });
  });

  describe('delivery statistics', () => {
    const mockPayload: PushNotificationPayloadDto = {
      id: 'notif-123',
      title: 'Test Notification',
      body: 'Test body',
      url: '/dashboard',
      type: 'test',
    };

    it('should track delivery statistics (totalSent increment)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      await service.sendToUser('user-123', mockPayload);

      const stats = service.getDeliveryStats();
      expect(stats.totalSent).toBe(1);
    });

    it('should track delivery statistics (totalFailed increment)', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      const error = new Error('Bad Request') as any;
      error.statusCode = 400;
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error);

      await service.sendToUser('user-123', mockPayload);

      const stats = service.getDeliveryStats();
      expect(stats.totalFailed).toBe(1);
    });

    it('should track expired subscription removal count', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', endpoint: 'endpoint-1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ] as PushSubscription[];

      repository.find.mockResolvedValue(mockSubscriptions);
      const error = new Error('Gone') as any;
      error.statusCode = 410;
      (webPush.sendNotification as jest.Mock).mockRejectedValue(error);
      repository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.sendToUser('user-123', mockPayload);

      const stats = service.getDeliveryStats();
      expect(stats.totalExpiredRemoved).toBe(1);
    });

    it('should return zero stats initially', () => {
      const stats = service.getDeliveryStats();
      expect(stats.totalSent).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalExpiredRemoved).toBe(0);
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
