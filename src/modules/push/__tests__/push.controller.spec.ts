/**
 * Push Notification Controller Tests
 * Story 10.4: Push Notifications Setup
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PushController } from '../push.controller';
import { PushNotificationService } from '../push.service';
import { CreatePushSubscriptionDto } from '../push.dto';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';

const mockPushService = () => ({
  isEnabled: jest.fn(),
  getPublicKey: jest.fn(),
  createSubscription: jest.fn(),
  deleteSubscription: jest.fn(),
  deleteSubscriptionById: jest.fn(),
  getUserSubscriptions: jest.fn(),
});

describe('PushController', () => {
  let controller: PushController;
  let service: jest.Mocked<PushNotificationService>;

  const mockRequest = {
    user: { sub: 'user-123', userId: 'user-123' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        {
          provide: PushNotificationService,
          useFactory: mockPushService,
        },
      ],
    }).compile();

    controller = module.get<PushController>(PushController);
    service = module.get(PushNotificationService);
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

      // Note: The id now comes from @Param instead of @Query
      await expect(
        controller.deleteSubscriptionById(mockRequest, id),
      ).resolves.toBeUndefined();

      expect(service.deleteSubscriptionById).toHaveBeenCalledWith(id, 'user-123');
    });

    it('should throw BadRequestException when id missing', async () => {
      // Empty path param
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
});
