/**
 * Mobile Push Service Tests
 * Story 22.7: Mobile Push Notifications
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MobilePushService } from '../services/mobile-push.service';
import { PushToken } from '../../../database/entities/push-token.entity';
import { MobileNotificationPreferences } from '../../../database/entities/mobile-notification-preferences.entity';
import { MobileNotificationCategory, NOTIFICATION_EVENT_TYPES } from '../constants/notification-categories';

describe('MobilePushService', () => {
  let service: MobilePushService;
  let pushTokenRepository: jest.Mocked<Repository<PushToken>>;
  let preferencesRepository: jest.Mocked<Repository<MobileNotificationPreferences>>;

  const mockPushToken: Partial<PushToken> = {
    id: 'token-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    deviceId: 'device-1',
    pushToken: 'ExponentPushToken[test123]',
    platform: 'ios',
    isActive: true,
    lastUsedAt: new Date(),
  };

  const mockPreferences: Partial<MobileNotificationPreferences> = {
    id: 'pref-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    categoriesEnabled: ['agent', 'deployment', 'cost', 'sprint'],
    urgentOnlyInQuiet: true,
  };

  const mockNotificationEvent = {
    type: NOTIFICATION_EVENT_TYPES.AGENT_TASK_COMPLETE,
    title: 'Test notification',
    body: 'Test body',
    category: MobileNotificationCategory.AGENT,
    priority: 'normal' as const,
    data: { projectId: 'project-1' },
  };

  beforeEach(async () => {
    const mockPushTokenRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockPreferencesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobilePushService,
        {
          provide: getRepositoryToken(PushToken),
          useValue: mockPushTokenRepo,
        },
        {
          provide: getRepositoryToken(MobileNotificationPreferences),
          useValue: mockPreferencesRepo,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MobilePushService>(MobilePushService);
    pushTokenRepository = module.get(getRepositoryToken(PushToken));
    preferencesRepository = module.get(getRepositoryToken(MobileNotificationPreferences));
  });

  describe('registerToken', () => {
    it('should create a new push token', async () => {
      pushTokenRepository.findOne.mockResolvedValue(null);
      pushTokenRepository.create.mockReturnValue(mockPushToken as PushToken);
      pushTokenRepository.save.mockResolvedValue(mockPushToken as PushToken);

      const result = await service.registerToken(
        'user-1',
        'workspace-1',
        'ExponentPushToken[test123]',
        'device-1',
        'ios',
      );

      expect(pushTokenRepository.findOne).toHaveBeenCalledWith({
        where: { deviceId: 'device-1', userId: 'user-1' },
      });
      expect(pushTokenRepository.create).toHaveBeenCalled();
      expect(result).toEqual(mockPushToken);
    });

    it('should update existing token', async () => {
      const existingToken = { ...mockPushToken, pushToken: 'old-token' };
      pushTokenRepository.findOne.mockResolvedValue(existingToken as PushToken);
      pushTokenRepository.save.mockResolvedValue(mockPushToken as PushToken);

      const result = await service.registerToken(
        'user-1',
        'workspace-1',
        'ExponentPushToken[new123]',
        'device-1',
        'ios',
      );

      expect(existingToken.pushToken).toBe('ExponentPushToken[new123]');
      expect(pushTokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('unregisterDevice', () => {
    it('should deactivate device token', async () => {
      pushTokenRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.unregisterDevice('user-1', 'device-1');

      expect(pushTokenRepository.update).toHaveBeenCalledWith(
        { deviceId: 'device-1', userId: 'user-1' },
        { isActive: false },
      );
      expect(result).toBe(true);
    });

    it('should return false if device not found', async () => {
      pushTokenRepository.update.mockResolvedValue({ affected: 0 } as any);

      const result = await service.unregisterDevice('user-1', 'unknown-device');

      expect(result).toBe(false);
    });
  });

  describe('getUserDevices', () => {
    it('should return active devices for user', async () => {
      pushTokenRepository.find.mockResolvedValue([mockPushToken] as PushToken[]);

      const result = await service.getUserDevices('user-1', 'workspace-1');

      expect(pushTokenRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', workspaceId: 'workspace-1', isActive: true },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('sendToUser', () => {
    it('should return empty array if no tokens', async () => {
      pushTokenRepository.find.mockResolvedValue([]);

      const result = await service.sendToUser('user-1', 'workspace-1', mockNotificationEvent);

      expect(result).toEqual([]);
    });

    it('should filter by preferences', async () => {
      pushTokenRepository.find.mockResolvedValue([mockPushToken] as PushToken[]);
      preferencesRepository.findOne.mockResolvedValue({
        ...mockPreferences,
        categoriesEnabled: ['deployment'],
      } as MobileNotificationPreferences);

      const result = await service.sendToUser('user-1', 'workspace-1', mockNotificationEvent);

      expect(result).toEqual([]);
    });

    it('should respect quiet hours for non-urgent events', async () => {
      pushTokenRepository.find.mockResolvedValue([mockPushToken] as PushToken[]);
      
      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHour}:${currentMinute}`;

      preferencesRepository.findOne.mockResolvedValue({
        ...mockPreferences,
        quietHoursStart: '00:00',
        quietHoursEnd: '23:59',
        urgentOnlyInQuiet: true,
      } as MobileNotificationPreferences);

      const result = await service.sendToUser('user-1', 'workspace-1', mockNotificationEvent);

      expect(result).toEqual([]);
    });
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
      preferencesRepository.findOne.mockResolvedValue(mockPreferences as MobileNotificationPreferences);

      const result = await service.getPreferences('user-1', 'workspace-1');

      expect(result).toEqual(mockPreferences);
    });

    it('should create default preferences if not exists', async () => {
      preferencesRepository.findOne.mockResolvedValue(null);
      preferencesRepository.create.mockReturnValue(mockPreferences as MobileNotificationPreferences);
      preferencesRepository.save.mockResolvedValue(mockPreferences as MobileNotificationPreferences);

      const result = await service.getPreferences('user-1', 'workspace-1');

      expect(preferencesRepository.create).toHaveBeenCalled();
      expect(preferencesRepository.save).toHaveBeenCalled();
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences', async () => {
      preferencesRepository.findOne.mockResolvedValue(mockPreferences as MobileNotificationPreferences);
      preferencesRepository.save.mockResolvedValue({
        ...mockPreferences,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      } as MobileNotificationPreferences);

      const result = await service.updatePreferences('user-1', 'workspace-1', {
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });

      expect(result.quietHoursStart).toBe('22:00');
      expect(result.quietHoursEnd).toBe('08:00');
    });

    it('should create preferences if not exists', async () => {
      preferencesRepository.findOne.mockResolvedValue(null);
      preferencesRepository.create.mockReturnValue({
        ...mockPreferences,
        quietHoursStart: '22:00',
      } as MobileNotificationPreferences);
      preferencesRepository.save.mockResolvedValue({
        ...mockPreferences,
        quietHoursStart: '22:00',
      } as MobileNotificationPreferences);

      const result = await service.updatePreferences('user-1', 'workspace-1', {
        quietHoursStart: '22:00',
      });

      expect(preferencesRepository.create).toHaveBeenCalled();
    });

    it('should reject invalid categories', async () => {
      await expect(
        service.updatePreferences('user-1', 'workspace-1', {
          categoriesEnabled: ['invalid-category', 'agent'] as any,
        }),
      ).rejects.toThrow('Invalid notification category: invalid-category');
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should deactivate tokens not used in 30 days', async () => {
      pushTokenRepository.update.mockResolvedValue({ affected: 5 } as any);

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(5);
      expect(pushTokenRepository.update).toHaveBeenCalled();
    });
  });
});
