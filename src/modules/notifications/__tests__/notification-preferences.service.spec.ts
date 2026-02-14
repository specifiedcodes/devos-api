/**
 * NotificationPreferencesService Tests
 * Story 10.6: Configurable Notification Preferences
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationPreferences,
  DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_QUIET_HOURS_CONFIG,
} from '../../../database/entities/notification-preferences.entity';
import { NotificationType } from '../events/notification.events';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let preferencesRepository: jest.Mocked<Repository<NotificationPreferences>>;
  let redisService: jest.Mocked<RedisService>;

  const mockUserId = 'user-123';
  const mockWorkspaceId = 'workspace-456';

  const createMockPreferences = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
    id: 'pref-789',
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    enabled: true,
    pushEnabled: true,
    soundEnabled: true,
    soundVolume: 0.5,
    soundFile: 'default',
    dndEnabled: false,
    dndSchedule: null,
    agentSettings: {},
    typeSettings: {
      chatMessages: true,
      statusUpdates: true,
      taskCompletions: true,
      errors: true,
      mentions: true,
    },
    eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS },
    channelPreferences: { ...DEFAULT_CHANNEL_PREFERENCES },
    perTypeChannelOverrides: null,
    inAppEnabled: true,
    emailEnabled: false,
    quietHours: { ...DEFAULT_QUIET_HOURS_CONFIG },
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {} as any,
    workspace: {} as any,
    ...overrides,
  });

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
    };

    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        {
          provide: getRepositoryToken(NotificationPreferences),
          useValue: mockRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
    preferencesRepository = module.get(getRepositoryToken(NotificationPreferences));
    redisService = module.get(RedisService);
  });

  describe('getPreferences', () => {
    it('should return cached preferences if available', async () => {
      const mockPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.getPreferences(mockUserId, mockWorkspaceId);

      expect(result.userId).toBe(mockUserId);
      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(preferencesRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return database preferences if cache miss', async () => {
      const mockPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(null);
      preferencesRepository.findOne.mockResolvedValueOnce(mockPrefs);

      const result = await service.getPreferences(mockUserId, mockWorkspaceId);

      expect(result.userId).toBe(mockUserId);
      expect(preferencesRepository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId, workspaceId: mockWorkspaceId },
      });
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should create defaults if not exist', async () => {
      const mockPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(null);
      preferencesRepository.findOne.mockResolvedValueOnce(null);
      preferencesRepository.create.mockReturnValueOnce(mockPrefs);
      preferencesRepository.save.mockResolvedValueOnce(mockPrefs);

      const result = await service.getPreferences(mockUserId, mockWorkspaceId);

      expect(preferencesRepository.create).toHaveBeenCalled();
      expect(preferencesRepository.save).toHaveBeenCalled();
      expect(result.eventSettings).toEqual(DEFAULT_EVENT_NOTIFICATION_SETTINGS);
      expect(result.channelPreferences).toEqual(DEFAULT_CHANNEL_PREFERENCES);
      expect(result.quietHours).toEqual(DEFAULT_QUIET_HOURS_CONFIG);
    });
  });

  describe('updatePreferences', () => {
    it('should update event settings', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));
      preferencesRepository.save.mockResolvedValueOnce({
        ...existingPrefs,
        eventSettings: { ...existingPrefs.eventSettings, epicCompletions: false },
      });

      const result = await service.updatePreferences(mockUserId, mockWorkspaceId, {
        eventSettings: { epicCompletions: false },
      });

      expect(result.eventSettings.epicCompletions).toBe(false);
      expect(preferencesRepository.save).toHaveBeenCalled();
    });

    it('should update channel preferences', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));
      preferencesRepository.save.mockResolvedValueOnce({
        ...existingPrefs,
        channelPreferences: { ...existingPrefs.channelPreferences, push: false },
      });

      const result = await service.updatePreferences(mockUserId, mockWorkspaceId, {
        channelPreferences: { push: false },
      });

      expect(result.channelPreferences.push).toBe(false);
      // In-app should always be true
      expect(result.channelPreferences.inApp).toBe(true);
    });

    it('should update quiet hours', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));
      preferencesRepository.save.mockResolvedValueOnce({
        ...existingPrefs,
        quietHours: { ...existingPrefs.quietHours, enabled: true, timezone: 'America/New_York' },
      });

      const result = await service.updatePreferences(mockUserId, mockWorkspaceId, {
        quietHours: { enabled: true, timezone: 'America/New_York' },
      });

      expect(result.quietHours.enabled).toBe(true);
      expect(result.quietHours.timezone).toBe('America/New_York');
    });

    it('should throw error when disabling critical notification: deploymentFailure', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));

      await expect(
        service.updatePreferences(mockUserId, mockWorkspaceId, {
          eventSettings: { deploymentFailure: false },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when disabling critical notification: agentErrors', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));

      await expect(
        service.updatePreferences(mockUserId, mockWorkspaceId, {
          eventSettings: { agentErrors: false },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should keep critical notifications enabled even if update attempts to disable them', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));

      // This should throw before reaching save
      await expect(
        service.updatePreferences(mockUserId, mockWorkspaceId, {
          eventSettings: { deploymentFailure: false },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(preferencesRepository.save).not.toHaveBeenCalled();
    });

    it('should invalidate cache after update', async () => {
      const existingPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(existingPrefs));
      preferencesRepository.save.mockResolvedValueOnce({
        ...existingPrefs,
        pushEnabled: false,
      });

      await service.updatePreferences(mockUserId, mockWorkspaceId, {
        pushEnabled: false,
      });

      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('isTypeEnabled', () => {
    it('should return true for enabled notification types', async () => {
      const mockPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.isTypeEnabled(mockUserId, mockWorkspaceId, 'epic_completed');

      expect(result).toBe(true);
    });

    it('should return false for disabled notification types', async () => {
      const mockPrefs = createMockPreferences({
        eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS, epicCompletions: false },
      });
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.isTypeEnabled(mockUserId, mockWorkspaceId, 'epic_completed');

      expect(result).toBe(false);
    });

    it('should always return true for critical notification types', async () => {
      const mockPrefs = createMockPreferences({
        enabled: false, // Even when globally disabled
      });
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.isTypeEnabled(mockUserId, mockWorkspaceId, 'deployment_failed');

      expect(result).toBe(true);
    });

    it('should return false for non-critical types when globally disabled', async () => {
      const mockPrefs = createMockPreferences({
        enabled: false,
      });
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.isTypeEnabled(mockUserId, mockWorkspaceId, 'epic_completed');

      expect(result).toBe(false);
    });
  });

  describe('checkTypePreference', () => {
    it('should correctly map epic_completed to epicCompletions', () => {
      const mockPrefs = createMockPreferences({
        eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS, epicCompletions: false },
      });

      const result = service.checkTypePreference(mockPrefs, 'epic_completed');

      expect(result).toBe(false);
    });

    it('should correctly map story_completed to storyCompletions', () => {
      const mockPrefs = createMockPreferences({
        eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS, storyCompletions: false },
      });

      const result = service.checkTypePreference(mockPrefs, 'story_completed');

      expect(result).toBe(false);
    });

    it('should correctly map deployment_success to deploymentSuccess', () => {
      const mockPrefs = createMockPreferences({
        eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS, deploymentSuccess: false },
      });

      const result = service.checkTypePreference(mockPrefs, 'deployment_success');

      expect(result).toBe(false);
    });

    it('should always return true for deployment_failed (critical)', () => {
      const mockPrefs = createMockPreferences();

      const result = service.checkTypePreference(mockPrefs, 'deployment_failed');

      expect(result).toBe(true);
    });

    it('should always return true for agent_error (critical)', () => {
      const mockPrefs = createMockPreferences();

      const result = service.checkTypePreference(mockPrefs, 'agent_error');

      expect(result).toBe(true);
    });
  });

  describe('isCriticalType', () => {
    it('should return true for deployment_failed', () => {
      expect(service.isCriticalType('deployment_failed')).toBe(true);
    });

    it('should return true for agent_error', () => {
      expect(service.isCriticalType('agent_error')).toBe(true);
    });

    it('should return false for non-critical types', () => {
      expect(service.isCriticalType('epic_completed')).toBe(false);
      expect(service.isCriticalType('story_completed')).toBe(false);
      expect(service.isCriticalType('deployment_success')).toBe(false);
      expect(service.isCriticalType('agent_message')).toBe(false);
    });
  });

  describe('getChannelPreferences', () => {
    it('should return default channel preferences', async () => {
      const mockPrefs = createMockPreferences();
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.getChannelPreferences(mockUserId, mockWorkspaceId, 'epic_completed');

      expect(result.push).toBe(true);
      expect(result.inApp).toBe(true);
      expect(result.email).toBe(false);
    });

    it('should apply per-type overrides', async () => {
      const mockPrefs = createMockPreferences({
        perTypeChannelOverrides: {
          deployment_failed: { email: true },
        },
      });
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.getChannelPreferences(mockUserId, mockWorkspaceId, 'deployment_failed');

      expect(result.email).toBe(true);
    });

    it('should always enable inApp channel', async () => {
      const mockPrefs = createMockPreferences({
        channelPreferences: { push: true, inApp: false, email: false }, // Try to disable inApp
      });
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockPrefs));

      const result = await service.getChannelPreferences(mockUserId, mockWorkspaceId, 'epic_completed');

      expect(result.inApp).toBe(true); // Should still be true
    });
  });

  describe('createDefaults', () => {
    it('should create preferences with sensible defaults', async () => {
      const mockPrefs = createMockPreferences();
      preferencesRepository.create.mockReturnValueOnce(mockPrefs);
      preferencesRepository.save.mockResolvedValueOnce(mockPrefs);

      const result = await service.createDefaults(mockUserId, mockWorkspaceId);

      expect(preferencesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          enabled: true,
          pushEnabled: true,
          inAppEnabled: true,
          emailEnabled: false,
          eventSettings: DEFAULT_EVENT_NOTIFICATION_SETTINGS,
          channelPreferences: DEFAULT_CHANNEL_PREFERENCES,
          quietHours: DEFAULT_QUIET_HOURS_CONFIG,
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('deletePreferences', () => {
    it('should delete preferences and invalidate cache', async () => {
      preferencesRepository.delete.mockResolvedValueOnce({ affected: 1, raw: {} });

      await service.deletePreferences(mockUserId, mockWorkspaceId);

      expect(preferencesRepository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
      });
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('getUserPreferences', () => {
    it('should return all preferences for a user', async () => {
      const prefs1 = createMockPreferences({ workspaceId: 'ws-1' });
      const prefs2 = createMockPreferences({ workspaceId: 'ws-2' });
      preferencesRepository.find.mockResolvedValueOnce([prefs1, prefs2]);

      const result = await service.getUserPreferences(mockUserId);

      expect(result).toHaveLength(2);
      expect(preferencesRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });
  });
});
