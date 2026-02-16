/**
 * Push Notification Controller Tests
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (admin endpoint tests)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PushController } from '../push.controller';
import { PushNotificationService } from '../push.service';
import { VapidKeyService } from '../services/vapid-key.service';
import { PushSubscriptionCleanupService } from '../services/push-subscription-cleanup.service';
import { CreatePushSubscriptionDto } from '../push.dto';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';

const mockPushService = () => ({
  isEnabled: jest.fn(),
  getPublicKey: jest.fn(),
  createSubscription: jest.fn(),
  deleteSubscription: jest.fn(),
  deleteSubscriptionById: jest.fn(),
  getUserSubscriptions: jest.fn(),
  getDeliveryStats: jest.fn(),
});

const mockVapidKeyService = () => ({
  isEnabled: jest.fn(),
  getPublicKey: jest.fn(),
  getKeyStatus: jest.fn(),
  generateKeyPair: jest.fn(),
  getSubject: jest.fn(),
});

const mockCleanupService = () => ({
  getSubscriptionStats: jest.fn(),
  getLastCleanupResult: jest.fn(),
  handleWeeklyCleanup: jest.fn(),
});

describe('PushController', () => {
  let controller: PushController;
  let service: jest.Mocked<PushNotificationService>;
  let vapidKeyService: jest.Mocked<VapidKeyService>;
  let cleanupService: jest.Mocked<PushSubscriptionCleanupService>;

  const mockRequest = {
    user: { sub: 'user-123', userId: 'user-123' },
  };

  const mockAdminRequest = {
    user: { sub: 'admin-123', userId: 'admin-123', role: 'admin' },
  };

  const mockNonAdminRequest = {
    user: { sub: 'user-456', userId: 'user-456', role: 'member' },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        {
          provide: PushNotificationService,
          useFactory: mockPushService,
        },
        {
          provide: VapidKeyService,
          useFactory: mockVapidKeyService,
        },
        {
          provide: PushSubscriptionCleanupService,
          useFactory: mockCleanupService,
        },
      ],
    }).compile();

    controller = module.get<PushController>(PushController);
    service = module.get(PushNotificationService);
    vapidKeyService = module.get(VapidKeyService);
    cleanupService = module.get(PushSubscriptionCleanupService);
  });

  describe('getConfig', () => {
    it('should return push configuration', () => {
      service.getPublicKey.mockReturnValue('test-public-key');
      service.isEnabled.mockReturnValue(true);

      const result = controller.getConfig();

      expect(result).toEqual({
        vapidPublicKey: 'test-public-key',
        supported: true,
      });
    });

    it('should return empty key when not configured', () => {
      service.getPublicKey.mockReturnValue(null);
      service.isEnabled.mockReturnValue(false);

      const result = controller.getConfig();

      expect(result).toEqual({
        vapidPublicKey: '',
        supported: false,
      });
    });
  });

  describe('createSubscription', () => {
    const mockDto: CreatePushSubscriptionDto = {
      endpoint: 'https://push.example.com/endpoint',
      keys: {
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      },
      userAgent: 'Mozilla/5.0',
      deviceName: 'Chrome on Windows',
    };

    it('should create subscription successfully', async () => {
      const workspaceId = 'workspace-123';
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        workspaceId,
        endpoint: mockDto.endpoint,
        keys: mockDto.keys,
        deviceName: mockDto.deviceName,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      } as PushSubscription;

      service.isEnabled.mockReturnValue(true);
      service.createSubscription.mockResolvedValue(mockSubscription);

      const result = await controller.createSubscription(
        mockRequest,
        workspaceId,
        mockDto,
      );

      expect(service.createSubscription).toHaveBeenCalledWith(
        'user-123',
        workspaceId,
        mockDto.endpoint,
        mockDto.keys,
        mockDto.userAgent,
        mockDto.deviceName,
        undefined,
      );
      expect(result.id).toBe('sub-123');
      expect(result.endpoint).toBe(mockDto.endpoint);
    });

    it('should throw BadRequestException when workspaceId missing', async () => {
      await expect(
        controller.createSubscription(mockRequest, '', mockDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when push not configured', async () => {
      service.isEnabled.mockReturnValue(false);

      await expect(
        controller.createSubscription(mockRequest, 'workspace-123', mockDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle expiration time', async () => {
      const workspaceId = 'workspace-123';
      const expirationTime = Date.now() + 86400000;
      const dtoWithExpiration: CreatePushSubscriptionDto = {
        ...mockDto,
        expirationTime,
      };

      service.isEnabled.mockReturnValue(true);
      service.createSubscription.mockResolvedValue({
        id: 'sub-123',
        userId: 'user-123',
        workspaceId,
        endpoint: mockDto.endpoint,
        createdAt: new Date(),
      } as PushSubscription);

      await controller.createSubscription(
        mockRequest,
        workspaceId,
        dtoWithExpiration,
      );

      expect(service.createSubscription).toHaveBeenCalledWith(
        'user-123',
        workspaceId,
        mockDto.endpoint,
        mockDto.keys,
        mockDto.userAgent,
        mockDto.deviceName,
        expirationTime,
      );
    });
  });

  describe('deleteSubscription', () => {
    it('should delete subscription successfully', async () => {
      const endpoint = 'https://push.example.com/endpoint';
      service.deleteSubscription.mockResolvedValue(true);

      await expect(
        controller.deleteSubscription(mockRequest, endpoint),
      ).resolves.toBeUndefined();

      expect(service.deleteSubscription).toHaveBeenCalledWith(endpoint, 'user-123');
    });

    it('should throw BadRequestException when endpoint missing', async () => {
      await expect(
        controller.deleteSubscription(mockRequest, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when subscription not found', async () => {
      service.deleteSubscription.mockResolvedValue(false);

      await expect(
        controller.deleteSubscription(mockRequest, 'https://invalid.endpoint'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 'sub-1',
          userId: 'user-123',
          workspaceId: 'workspace-123',
          endpoint: 'endpoint-1',
          deviceName: 'Chrome',
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
        {
          id: 'sub-2',
          userId: 'user-123',
          workspaceId: 'workspace-456',
          endpoint: 'endpoint-2',
          deviceName: 'Firefox',
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ] as PushSubscription[];

      service.getUserSubscriptions.mockResolvedValue(mockSubscriptions);

      const result = await controller.getUserSubscriptions(mockRequest);

      expect(service.getUserSubscriptions).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sub-1');
      expect(result[1].id).toBe('sub-2');
    });

    it('should return empty array when no subscriptions', async () => {
      service.getUserSubscriptions.mockResolvedValue([]);

      const result = await controller.getUserSubscriptions(mockRequest);

      expect(result).toHaveLength(0);
    });
  });

  describe('deleteSubscriptionById', () => {
    it('should delete subscription by ID successfully', async () => {
      const id = 'sub-123';
      service.deleteSubscriptionById.mockResolvedValue(true);

      await expect(
        controller.deleteSubscriptionById(mockRequest, id),
      ).resolves.toBeUndefined();

      expect(service.deleteSubscriptionById).toHaveBeenCalledWith(id, 'user-123');
    });

    it('should throw BadRequestException when id missing', async () => {
      await expect(
        controller.deleteSubscriptionById(mockRequest, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when subscription not found', async () => {
      service.deleteSubscriptionById.mockResolvedValue(false);

      await expect(
        controller.deleteSubscriptionById(mockRequest, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('user identification', () => {
    it('should use sub from JWT', async () => {
      const request = { user: { sub: 'user-from-sub' } };
      service.getUserSubscriptions.mockResolvedValue([]);

      await controller.getUserSubscriptions(request);

      expect(service.getUserSubscriptions).toHaveBeenCalledWith('user-from-sub');
    });

    it('should fallback to userId from JWT', async () => {
      const request = { user: { userId: 'user-from-userId' } };
      service.getUserSubscriptions.mockResolvedValue([]);

      await controller.getUserSubscriptions(request);

      expect(service.getUserSubscriptions).toHaveBeenCalledWith('user-from-userId');
    });
  });

  // Story 16.7: Admin endpoint tests
  describe('getVapidStatus', () => {
    it('should return VAPID key status with configured=true', () => {
      vapidKeyService.getKeyStatus.mockReturnValue({
        configured: true,
        publicKeyPresent: true,
        privateKeyPresent: true,
        subjectConfigured: true,
        publicKeyPrefix: 'BNxRk3rA',
        subject: 'mailto:a***n@d***s.app',
        keyFormat: 'valid' as const,
      });

      const result = controller.getVapidStatus(mockAdminRequest);

      expect(result.configured).toBe(true);
      expect(result.keyFormat).toBe('valid');
      expect(vapidKeyService.getKeyStatus).toHaveBeenCalled();
    });

    it('should return VAPID key status with configured=false when not set up', () => {
      vapidKeyService.getKeyStatus.mockReturnValue({
        configured: false,
        publicKeyPresent: false,
        privateKeyPresent: false,
        subjectConfigured: true,
        publicKeyPrefix: '',
        subject: 'mailto:a***n@d***s.app',
        keyFormat: 'missing' as const,
      });

      const result = controller.getVapidStatus(mockAdminRequest);

      expect(result.configured).toBe(false);
      expect(result.keyFormat).toBe('missing');
    });

    it('should throw ForbiddenException for non-admin user', () => {
      expect(() => controller.getVapidStatus(mockNonAdminRequest)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getStats', () => {
    it('should return subscription statistics', async () => {
      cleanupService.getSubscriptionStats.mockResolvedValue({
        total: 100,
        staleCount: 10,
        expiredCount: 5,
      });
      service.getDeliveryStats.mockReturnValue({
        totalSent: 500,
        totalFailed: 20,
        totalExpiredRemoved: 15,
      });
      cleanupService.getLastCleanupResult.mockReturnValue(null);

      const result = await controller.getStats(mockAdminRequest);

      expect(result.subscriptions.total).toBe(100);
      expect(result.subscriptions.staleCount).toBe(10);
      expect(result.subscriptions.expiredCount).toBe(5);
    });

    it('should return delivery statistics', async () => {
      cleanupService.getSubscriptionStats.mockResolvedValue({
        total: 50,
        staleCount: 5,
        expiredCount: 2,
      });
      service.getDeliveryStats.mockReturnValue({
        totalSent: 200,
        totalFailed: 10,
        totalExpiredRemoved: 8,
      });
      cleanupService.getLastCleanupResult.mockReturnValue(null);

      const result = await controller.getStats(mockAdminRequest);

      expect(result.delivery.totalSent).toBe(200);
      expect(result.delivery.totalFailed).toBe(10);
      expect(result.delivery.totalExpiredRemoved).toBe(8);
    });

    it('should return last cleanup result in stats', async () => {
      const cleanupResult = {
        staleRemoved: 3,
        expiredRemoved: 2,
        totalRemoved: 5,
        executedAt: '2026-02-16T03:00:00.000Z',
        durationMs: 150,
      };

      cleanupService.getSubscriptionStats.mockResolvedValue({
        total: 50,
        staleCount: 5,
        expiredCount: 2,
      });
      service.getDeliveryStats.mockReturnValue({
        totalSent: 100,
        totalFailed: 5,
        totalExpiredRemoved: 3,
      });
      cleanupService.getLastCleanupResult.mockReturnValue(cleanupResult);

      const result = await controller.getStats(mockAdminRequest);

      expect(result.lastCleanup).toEqual(cleanupResult);
    });

    it('should return undefined lastCleanup when no cleanup has run', async () => {
      cleanupService.getSubscriptionStats.mockResolvedValue({
        total: 50,
        staleCount: 5,
        expiredCount: 2,
      });
      service.getDeliveryStats.mockReturnValue({
        totalSent: 0,
        totalFailed: 0,
        totalExpiredRemoved: 0,
      });
      cleanupService.getLastCleanupResult.mockReturnValue(null);

      const result = await controller.getStats(mockAdminRequest);

      expect(result.lastCleanup).toBeUndefined();
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      await expect(controller.getStats(mockNonAdminRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('triggerCleanup', () => {
    it('should trigger manual cleanup and return result', async () => {
      const cleanupResult = {
        staleRemoved: 5,
        expiredRemoved: 3,
        totalRemoved: 8,
        executedAt: '2026-02-16T12:00:00.000Z',
        durationMs: 200,
      };

      cleanupService.handleWeeklyCleanup.mockResolvedValue(cleanupResult);

      const result = await controller.triggerCleanup(mockAdminRequest);

      expect(cleanupService.handleWeeklyCleanup).toHaveBeenCalled();
      expect(result).toEqual(cleanupResult);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      await expect(controller.triggerCleanup(mockNonAdminRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
