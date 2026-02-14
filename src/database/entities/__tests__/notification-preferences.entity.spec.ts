/**
 * NotificationPreferences Entity Tests
 * Story 10.6: Configurable Notification Preferences
 */

import {
  NotificationPreferences,
  EventNotificationSettings,
  ChannelPreferences,
  QuietHoursConfig,
  CRITICAL_NOTIFICATION_TYPES,
  DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_QUIET_HOURS_CONFIG,
} from '../notification-preferences.entity';

describe('NotificationPreferences Entity', () => {
  describe('EventNotificationSettings', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_EVENT_NOTIFICATION_SETTINGS).toEqual({
        epicCompletions: true,
        storyCompletions: true,
        deploymentSuccess: true,
        deploymentFailure: true,
        agentErrors: true,
        agentMessages: true,
        statusUpdates: false,
      });
    });

    it('should have critical notification types always enabled by default', () => {
      expect(DEFAULT_EVENT_NOTIFICATION_SETTINGS.deploymentFailure).toBe(true);
      expect(DEFAULT_EVENT_NOTIFICATION_SETTINGS.agentErrors).toBe(true);
    });

    it('should have statusUpdates disabled by default (too frequent)', () => {
      expect(DEFAULT_EVENT_NOTIFICATION_SETTINGS.statusUpdates).toBe(false);
    });
  });

  describe('ChannelPreferences', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CHANNEL_PREFERENCES).toEqual({
        push: true,
        inApp: true,
        email: false,
      });
    });

    it('should have in-app always enabled', () => {
      expect(DEFAULT_CHANNEL_PREFERENCES.inApp).toBe(true);
    });

    it('should have email disabled by default (future feature)', () => {
      expect(DEFAULT_CHANNEL_PREFERENCES.email).toBe(false);
    });
  });

  describe('QuietHoursConfig', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_QUIET_HOURS_CONFIG).toEqual({
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
        exceptCritical: true,
      });
    });

    it('should be disabled by default', () => {
      expect(DEFAULT_QUIET_HOURS_CONFIG.enabled).toBe(false);
    });

    it('should allow critical notifications by default', () => {
      expect(DEFAULT_QUIET_HOURS_CONFIG.exceptCritical).toBe(true);
    });

    it('should have default quiet hours from 10 PM to 8 AM', () => {
      expect(DEFAULT_QUIET_HOURS_CONFIG.startTime).toBe('22:00');
      expect(DEFAULT_QUIET_HOURS_CONFIG.endTime).toBe('08:00');
    });
  });

  describe('CRITICAL_NOTIFICATION_TYPES', () => {
    it('should include deployment_failed', () => {
      expect(CRITICAL_NOTIFICATION_TYPES).toContain('deployment_failed');
    });

    it('should include agent_error', () => {
      expect(CRITICAL_NOTIFICATION_TYPES).toContain('agent_error');
    });

    it('should have exactly 2 critical types', () => {
      expect(CRITICAL_NOTIFICATION_TYPES.length).toBe(2);
    });
  });

  describe('NotificationPreferences Entity Structure', () => {
    let preferences: NotificationPreferences;

    beforeEach(() => {
      preferences = new NotificationPreferences();
      preferences.id = 'test-id';
      preferences.userId = 'user-id';
      preferences.workspaceId = 'workspace-id';
      preferences.enabled = true;
      preferences.pushEnabled = true;
      preferences.soundEnabled = true;
      preferences.soundVolume = 0.5;
      preferences.soundFile = 'default';
      preferences.dndEnabled = false;
      preferences.dndSchedule = null;
      preferences.agentSettings = {};
      preferences.typeSettings = {
        chatMessages: true,
        statusUpdates: true,
        taskCompletions: true,
        errors: true,
        mentions: true,
      };
      preferences.eventSettings = { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS };
      preferences.channelPreferences = { ...DEFAULT_CHANNEL_PREFERENCES };
      preferences.perTypeChannelOverrides = null;
      preferences.inAppEnabled = true;
      preferences.emailEnabled = false;
      preferences.quietHours = { ...DEFAULT_QUIET_HOURS_CONFIG };
      preferences.createdAt = new Date();
      preferences.updatedAt = new Date();
    });

    it('should create a valid preferences object', () => {
      expect(preferences).toBeDefined();
      expect(preferences.id).toBe('test-id');
      expect(preferences.userId).toBe('user-id');
      expect(preferences.workspaceId).toBe('workspace-id');
    });

    it('should have all event notification settings', () => {
      expect(preferences.eventSettings.epicCompletions).toBe(true);
      expect(preferences.eventSettings.storyCompletions).toBe(true);
      expect(preferences.eventSettings.deploymentSuccess).toBe(true);
      expect(preferences.eventSettings.deploymentFailure).toBe(true);
      expect(preferences.eventSettings.agentErrors).toBe(true);
      expect(preferences.eventSettings.agentMessages).toBe(true);
      expect(preferences.eventSettings.statusUpdates).toBe(false);
    });

    it('should have all channel preferences', () => {
      expect(preferences.channelPreferences.push).toBe(true);
      expect(preferences.channelPreferences.inApp).toBe(true);
      expect(preferences.channelPreferences.email).toBe(false);
    });

    it('should have quiet hours configuration', () => {
      expect(preferences.quietHours.enabled).toBe(false);
      expect(preferences.quietHours.startTime).toBe('22:00');
      expect(preferences.quietHours.endTime).toBe('08:00');
      expect(preferences.quietHours.timezone).toBe('UTC');
      expect(preferences.quietHours.exceptCritical).toBe(true);
    });

    it('should allow per-type channel overrides', () => {
      preferences.perTypeChannelOverrides = {
        deployment_failed: { push: true, inApp: true, email: true },
        agent_error: { push: true, inApp: true },
      };

      expect(preferences.perTypeChannelOverrides).toBeDefined();
      expect(preferences.perTypeChannelOverrides?.deployment_failed?.email).toBe(true);
    });

    it('should maintain in-app enabled separately', () => {
      expect(preferences.inAppEnabled).toBe(true);
    });

    it('should maintain email enabled separately', () => {
      expect(preferences.emailEnabled).toBe(false);
    });
  });

  describe('Event Settings Type Guard', () => {
    function isValidEventSettings(settings: unknown): settings is EventNotificationSettings {
      if (!settings || typeof settings !== 'object') return false;
      const s = settings as Record<string, unknown>;
      return (
        typeof s.epicCompletions === 'boolean' &&
        typeof s.storyCompletions === 'boolean' &&
        typeof s.deploymentSuccess === 'boolean' &&
        typeof s.deploymentFailure === 'boolean' &&
        typeof s.agentErrors === 'boolean' &&
        typeof s.agentMessages === 'boolean' &&
        typeof s.statusUpdates === 'boolean'
      );
    }

    it('should validate correct event settings', () => {
      expect(isValidEventSettings(DEFAULT_EVENT_NOTIFICATION_SETTINGS)).toBe(true);
    });

    it('should reject invalid event settings', () => {
      expect(isValidEventSettings({})).toBe(false);
      expect(isValidEventSettings(null)).toBe(false);
      expect(isValidEventSettings({ epicCompletions: 'true' })).toBe(false);
    });
  });

  describe('Quiet Hours Type Guard', () => {
    function isValidQuietHours(config: unknown): config is QuietHoursConfig {
      if (!config || typeof config !== 'object') return false;
      const c = config as Record<string, unknown>;
      return (
        typeof c.enabled === 'boolean' &&
        typeof c.startTime === 'string' &&
        typeof c.endTime === 'string' &&
        typeof c.timezone === 'string' &&
        typeof c.exceptCritical === 'boolean'
      );
    }

    it('should validate correct quiet hours config', () => {
      expect(isValidQuietHours(DEFAULT_QUIET_HOURS_CONFIG)).toBe(true);
    });

    it('should reject invalid quiet hours config', () => {
      expect(isValidQuietHours({})).toBe(false);
      expect(isValidQuietHours(null)).toBe(false);
      expect(isValidQuietHours({ enabled: 'false' })).toBe(false);
    });
  });
});
