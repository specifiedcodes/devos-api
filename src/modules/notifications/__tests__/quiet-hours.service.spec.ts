/**
 * QuietHoursService Tests
 * Story 10.6: Configurable Notification Preferences
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QuietHoursService, QuietHoursStatus, QueuedNotification } from '../services/quiet-hours.service';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationPreferences,
  DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_QUIET_HOURS_CONFIG,
} from '../../../database/entities/notification-preferences.entity';
import { NotificationEvent, NotificationRecipient } from '../events/notification.events';

describe('QuietHoursService', () => {
  let service: QuietHoursService;
  let redisService: jest.Mocked<RedisService>;

  const mockUserId = 'user-123';
  const mockWorkspaceId = 'workspace-456';

  const createMockPreferences = (
    quietHours: Partial<typeof DEFAULT_QUIET_HOURS_CONFIG> = {},
  ): NotificationPreferences => ({
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
    quietHours: { ...DEFAULT_QUIET_HOURS_CONFIG, ...quietHours },
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {} as any,
    workspace: {} as any,
  });

  beforeEach(async () => {
    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      scanKeys: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuietHoursService,
        {
          provide: RedisService,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<QuietHoursService>(QuietHoursService);
    redisService = module.get(RedisService);
  });

  describe('isInQuietHours', () => {
    it('should return false when quiet hours are disabled', async () => {
      const prefs = createMockPreferences({ enabled: false });

      const result = await service.isInQuietHours(mockUserId, prefs);

      expect(result).toBe(false);
    });

    it('should return true when current time is within quiet hours', async () => {
      // Mock the current time to be at 23:00
      jest.spyOn(service, 'formatTime').mockReturnValueOnce('23:00');
      jest.spyOn(service as any, 'toUserTimezone').mockReturnValueOnce(new Date());

      const prefs = createMockPreferences({
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
      });

      const result = await service.isInQuietHours(mockUserId, prefs);

      expect(result).toBe(true);
    });

    it('should return false when current time is outside quiet hours', async () => {
      // Mock the current time to be at 12:00
      jest.spyOn(service, 'formatTime').mockReturnValueOnce('12:00');
      jest.spyOn(service as any, 'toUserTimezone').mockReturnValueOnce(new Date());

      const prefs = createMockPreferences({
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
      });

      const result = await service.isInQuietHours(mockUserId, prefs);

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return not in quiet hours when disabled', async () => {
      const prefs = createMockPreferences({ enabled: false });

      const result = await service.getStatus(mockUserId, prefs);

      expect(result.inQuietHours).toBe(false);
      expect(result.endsAt).toBeUndefined();
    });

    it('should return status with end time when in quiet hours', async () => {
      jest.spyOn(service, 'isInQuietHours').mockResolvedValueOnce(true);

      const prefs = createMockPreferences({
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'America/New_York',
      });

      const result = await service.getStatus(mockUserId, prefs);

      expect(result.inQuietHours).toBe(true);
      expect(result.timezone).toBe('America/New_York');
      expect(result.endsAt).toBeDefined();
    });
  });

  describe('shouldBypassQuietHours', () => {
    it('should return true for deployment_failed when exceptCritical is true', () => {
      const result = service.shouldBypassQuietHours('deployment_failed', true);
      expect(result).toBe(true);
    });

    it('should return true for agent_error when exceptCritical is true', () => {
      const result = service.shouldBypassQuietHours('agent_error', true);
      expect(result).toBe(true);
    });

    it('should return false for non-critical types', () => {
      const result = service.shouldBypassQuietHours('epic_completed', true);
      expect(result).toBe(false);
    });

    it('should return false when exceptCritical is false', () => {
      const result = service.shouldBypassQuietHours('deployment_failed', false);
      expect(result).toBe(false);
    });
  });

  describe('queueForLater', () => {
    it('should queue notification in Redis', async () => {
      const recipient: NotificationRecipient = {
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
      };

      const event: NotificationEvent = {
        type: 'epic_completed',
        payload: { epicId: '123' },
        recipients: [recipient],
        urgency: 'normal',
        batchable: true,
      };

      await service.queueForLater(recipient, event);

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('quiet-hours'),
        expect.any(String),
        43200,
      );
    });
  });

  describe('getQueuedNotifications', () => {
    it('should return empty array when no queued notifications', async () => {
      redisService.scanKeys.mockResolvedValueOnce([]);

      const result = await service.getQueuedNotifications(mockUserId);

      expect(result).toEqual([]);
    });

    it('should return sorted notifications by timestamp', async () => {
      const notification1: QueuedNotification = {
        type: 'epic_completed',
        payload: { epicId: '1' },
        timestamp: 1000,
        workspaceId: mockWorkspaceId,
      };

      const notification2: QueuedNotification = {
        type: 'story_completed',
        payload: { storyId: '2' },
        timestamp: 2000,
        workspaceId: mockWorkspaceId,
      };

      redisService.scanKeys.mockResolvedValueOnce(['key1', 'key2']);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(notification2))
        .mockResolvedValueOnce(JSON.stringify(notification1));

      const result = await service.getQueuedNotifications(mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(2000);
    });
  });

  describe('flushQueuedNotifications', () => {
    it('should return empty array when no queued notifications', async () => {
      redisService.scanKeys.mockResolvedValue([]);

      const result = await service.flushQueuedNotifications(mockUserId);

      expect(result).toEqual([]);
    });

    it('should delete all queued notifications after flushing', async () => {
      const notification: QueuedNotification = {
        type: 'epic_completed',
        payload: { epicId: '1' },
        timestamp: 1000,
        workspaceId: mockWorkspaceId,
      };

      redisService.scanKeys.mockResolvedValue(['key1']);
      redisService.get.mockResolvedValueOnce(JSON.stringify(notification));

      await service.flushQueuedNotifications(mockUserId);

      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('buildDigestSummary', () => {
    it('should build correct summary for single notification', () => {
      const notifications: QueuedNotification[] = [
        {
          type: 'epic_completed',
          payload: {},
          timestamp: 1000,
          workspaceId: mockWorkspaceId,
        },
      ];

      const result = service.buildDigestSummary(notifications);

      expect(result.count).toBe(1);
      expect(result.title).toBe('1 notification during quiet hours');
      expect(result.byType.epic_completed).toBe(1);
    });

    it('should build correct summary for multiple notifications', () => {
      const notifications: QueuedNotification[] = [
        { type: 'epic_completed', payload: {}, timestamp: 1000, workspaceId: mockWorkspaceId },
        { type: 'story_completed', payload: {}, timestamp: 2000, workspaceId: mockWorkspaceId },
        { type: 'story_completed', payload: {}, timestamp: 3000, workspaceId: mockWorkspaceId },
      ];

      const result = service.buildDigestSummary(notifications);

      expect(result.count).toBe(3);
      expect(result.title).toBe('3 notifications during quiet hours');
      expect(result.byType.epic_completed).toBe(1);
      expect(result.byType.story_completed).toBe(2);
    });
  });

  describe('isTimeBetween', () => {
    it('should correctly detect time within normal range', () => {
      // 10:00 is between 09:00 and 17:00
      expect(service.isTimeBetween('10:00', '09:00', '17:00')).toBe(true);
    });

    it('should correctly detect time outside normal range', () => {
      // 08:00 is not between 09:00 and 17:00
      expect(service.isTimeBetween('08:00', '09:00', '17:00')).toBe(false);
    });

    it('should correctly detect time within midnight-crossing range', () => {
      // 23:00 is between 22:00 and 08:00
      expect(service.isTimeBetween('23:00', '22:00', '08:00')).toBe(true);
      // 03:00 is between 22:00 and 08:00
      expect(service.isTimeBetween('03:00', '22:00', '08:00')).toBe(true);
    });

    it('should correctly detect time outside midnight-crossing range', () => {
      // 12:00 is not between 22:00 and 08:00
      expect(service.isTimeBetween('12:00', '22:00', '08:00')).toBe(false);
    });

    it('should handle edge cases at boundaries', () => {
      // Exactly at start time
      expect(service.isTimeBetween('09:00', '09:00', '17:00')).toBe(true);
      // Exactly at end time (exclusive)
      expect(service.isTimeBetween('17:00', '09:00', '17:00')).toBe(false);
    });
  });

  describe('timeToMinutes', () => {
    it('should convert time to minutes correctly', () => {
      expect(service.timeToMinutes('00:00')).toBe(0);
      expect(service.timeToMinutes('01:30')).toBe(90);
      expect(service.timeToMinutes('12:00')).toBe(720);
      expect(service.timeToMinutes('23:59')).toBe(1439);
    });
  });

  describe('formatTime', () => {
    it('should format time as HH:MM', () => {
      const date = new Date(0);
      date.setUTCHours(9, 30, 0, 0);

      const result = service.formatTime(date);

      expect(result).toBe('09:30');
    });

    it('should pad single digit hours and minutes', () => {
      const date = new Date(0);
      date.setUTCHours(5, 5, 0, 0);

      const result = service.formatTime(date);

      expect(result).toBe('05:05');
    });
  });

  describe('countQueuedNotifications', () => {
    it('should return count of queued notifications', async () => {
      redisService.scanKeys.mockResolvedValueOnce(['key1', 'key2', 'key3']);

      const result = await service.countQueuedNotifications(mockUserId);

      expect(result).toBe(3);
    });

    it('should return 0 when no notifications queued', async () => {
      redisService.scanKeys.mockResolvedValueOnce([]);

      const result = await service.countQueuedNotifications(mockUserId);

      expect(result).toBe(0);
    });
  });
});
