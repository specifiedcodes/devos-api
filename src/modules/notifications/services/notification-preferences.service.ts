/**
 * NotificationPreferencesService
 * Story 10.6: Configurable Notification Preferences
 *
 * Handles CRUD operations for notification preferences with:
 * - Default creation for new users
 * - Critical notification protection
 * - Type-based preference checking
 * - Redis caching for performance
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationPreferences,
  EventNotificationSettings,
  ChannelPreferences,
  QuietHoursConfig,
  CRITICAL_NOTIFICATION_TYPES,
  DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_QUIET_HOURS_CONFIG,
} from '../../../database/entities/notification-preferences.entity';
import { NotificationType } from '../events/notification.events';

/**
 * Update preferences DTO
 */
export interface UpdateNotificationPreferencesDto {
  enabled?: boolean;
  pushEnabled?: boolean;
  soundEnabled?: boolean;
  soundVolume?: number;
  soundFile?: string;
  dndEnabled?: boolean;
  eventSettings?: Partial<EventNotificationSettings>;
  channelPreferences?: Partial<ChannelPreferences>;
  quietHours?: Partial<QuietHoursConfig>;
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
}

/**
 * Cache key prefix
 */
const CACHE_PREFIX = 'notification-prefs';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectRepository(NotificationPreferences)
    private readonly preferencesRepository: Repository<NotificationPreferences>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get preferences for user in workspace (creates defaults if not exist)
   */
  async getPreferences(
    userId: string,
    workspaceId: string,
  ): Promise<NotificationPreferences> {
    // Try cache first
    const cacheKey = this.getCacheKey(userId, workspaceId);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached) as NotificationPreferences;
      } catch {
        // Cache corrupted, continue to database
        await this.redisService.del(cacheKey);
      }
    }

    // Find in database
    let prefs = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    // Create defaults if not exist
    if (!prefs) {
      prefs = await this.createDefaults(userId, workspaceId);
    }

    // Cache the result
    await this.cachePreferences(prefs);

    return prefs;
  }

  /**
   * Update preferences with validation
   */
  async updatePreferences(
    userId: string,
    workspaceId: string,
    updates: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    // Validate critical notifications cannot be disabled
    this.validateCriticalNotifications(updates);

    // Get existing preferences (creates if not exist)
    const existing = await this.getPreferences(userId, workspaceId);

    // Merge event settings
    if (updates.eventSettings) {
      existing.eventSettings = {
        ...existing.eventSettings,
        ...updates.eventSettings,
        // Ensure critical notifications stay enabled
        deploymentFailure: true,
        agentErrors: true,
      };
    }

    // Merge channel preferences
    if (updates.channelPreferences) {
      existing.channelPreferences = {
        ...existing.channelPreferences,
        ...updates.channelPreferences,
        // In-app always enabled
        inApp: true,
      };
    }

    // Merge quiet hours
    if (updates.quietHours) {
      existing.quietHours = {
        ...existing.quietHours,
        ...updates.quietHours,
      };
    }

    // Apply other updates
    if (updates.enabled !== undefined) {
      existing.enabled = updates.enabled;
    }
    if (updates.pushEnabled !== undefined) {
      existing.pushEnabled = updates.pushEnabled;
    }
    if (updates.soundEnabled !== undefined) {
      existing.soundEnabled = updates.soundEnabled;
    }
    if (updates.soundVolume !== undefined) {
      existing.soundVolume = updates.soundVolume;
    }
    if (updates.soundFile !== undefined) {
      existing.soundFile = updates.soundFile as any;
    }
    if (updates.dndEnabled !== undefined) {
      existing.dndEnabled = updates.dndEnabled;
    }
    if (updates.inAppEnabled !== undefined) {
      // In-app notifications cannot be disabled
      existing.inAppEnabled = true;
    }
    if (updates.emailEnabled !== undefined) {
      existing.emailEnabled = updates.emailEnabled;
    }

    // Save and cache
    const saved = await this.preferencesRepository.save(existing);
    await this.cachePreferences(saved);

    // Audit log for preference changes (Story 10.6 security requirement)
    this.logger.log({
      action: 'notification_preferences_updated',
      userId,
      workspaceId,
      changes: this.sanitizeUpdatesForAudit(updates),
      timestamp: new Date().toISOString(),
    });

    return saved;
  }

  /**
   * Check if notification type is enabled for user
   */
  async isTypeEnabled(
    userId: string,
    workspaceId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId, workspaceId);

    // If notifications are globally disabled, return false (except for critical)
    if (!prefs.enabled && !this.isCriticalType(type)) {
      return false;
    }

    return this.checkTypePreference(prefs, type);
  }

  /**
   * Check if a notification type is enabled in the preferences
   */
  checkTypePreference(prefs: NotificationPreferences, type: NotificationType): boolean {
    // Critical types are always enabled
    if (this.isCriticalType(type)) {
      return true;
    }

    // Map notification type to event setting
    // Note: context_degraded and context_critical (Story 12.5) are not user-configurable
    // and default to enabled (handled by the fallback below)
    const typeToSettingMap: Partial<Record<NotificationType, keyof EventNotificationSettings>> = {
      epic_completed: 'epicCompletions',
      story_completed: 'storyCompletions',
      deployment_success: 'deploymentSuccess',
      deployment_failed: 'deploymentFailure',
      agent_error: 'agentErrors',
      agent_message: 'agentMessages',
    };

    const settingKey = typeToSettingMap[type];
    if (!settingKey) {
      // Unknown type, default to enabled
      return true;
    }

    return prefs.eventSettings?.[settingKey] ?? true;
  }

  /**
   * Check if notification type is critical (cannot be disabled)
   */
  isCriticalType(type: NotificationType): boolean {
    return CRITICAL_NOTIFICATION_TYPES.includes(type as any);
  }

  /**
   * Get channel preferences for a notification type
   */
  async getChannelPreferences(
    userId: string,
    workspaceId: string,
    type: NotificationType,
  ): Promise<ChannelPreferences> {
    const prefs = await this.getPreferences(userId, workspaceId);

    // Check for per-type overrides
    if (prefs.perTypeChannelOverrides?.[type]) {
      return {
        ...prefs.channelPreferences,
        ...prefs.perTypeChannelOverrides[type],
        // In-app always enabled
        inApp: true,
      };
    }

    return {
      ...prefs.channelPreferences,
      // In-app always enabled
      inApp: true,
    };
  }

  /**
   * Create default preferences for a user in a workspace
   */
  async createDefaults(
    userId: string,
    workspaceId: string,
  ): Promise<NotificationPreferences> {
    const defaults = this.preferencesRepository.create({
      userId,
      workspaceId,
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
    });

    const saved = await this.preferencesRepository.save(defaults);
    this.logger.log(`Created default notification preferences for user ${userId} in workspace ${workspaceId}`);

    return saved;
  }

  /**
   * Delete preferences for a user (used when user leaves workspace)
   */
  async deletePreferences(userId: string, workspaceId: string): Promise<void> {
    await this.preferencesRepository.delete({ userId, workspaceId });
    await this.invalidateCache(userId, workspaceId);
    this.logger.log(`Deleted notification preferences for user ${userId} in workspace ${workspaceId}`);
  }

  /**
   * Get all preferences for a user across workspaces
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences[]> {
    return this.preferencesRepository.find({
      where: { userId },
    });
  }

  /**
   * Validate that critical notifications are not being disabled
   */
  private validateCriticalNotifications(updates: UpdateNotificationPreferencesDto): void {
    if (updates.eventSettings) {
      if (updates.eventSettings.deploymentFailure === false) {
        throw new BadRequestException(
          'Critical notification "deploymentFailure" cannot be disabled',
        );
      }
      if (updates.eventSettings.agentErrors === false) {
        throw new BadRequestException(
          'Critical notification "agentErrors" cannot be disabled',
        );
      }
    }
  }

  /**
   * Cache preferences in Redis
   */
  private async cachePreferences(prefs: NotificationPreferences): Promise<void> {
    const cacheKey = this.getCacheKey(prefs.userId, prefs.workspaceId);
    try {
      await this.redisService.set(cacheKey, JSON.stringify(prefs), CACHE_TTL);
    } catch (error) {
      this.logger.warn(`Failed to cache preferences: ${error}`);
    }
  }

  /**
   * Invalidate cache for user/workspace
   */
  async invalidateCache(userId: string, workspaceId: string): Promise<void> {
    const cacheKey = this.getCacheKey(userId, workspaceId);
    try {
      await this.redisService.del(cacheKey);
    } catch (error) {
      this.logger.warn(`Failed to invalidate preferences cache: ${error}`);
    }
  }

  /**
   * Get cache key for user/workspace preferences
   */
  private getCacheKey(userId: string, workspaceId: string): string {
    return `${CACHE_PREFIX}:${userId}:${workspaceId}`;
  }

  /**
   * Sanitize updates for audit logging (remove sensitive data if any)
   */
  private sanitizeUpdatesForAudit(updates: UpdateNotificationPreferencesDto): Record<string, unknown> {
    // Log which settings were changed without including full payload
    const changedFields: string[] = [];

    if (updates.enabled !== undefined) changedFields.push('enabled');
    if (updates.pushEnabled !== undefined) changedFields.push('pushEnabled');
    if (updates.soundEnabled !== undefined) changedFields.push('soundEnabled');
    if (updates.soundVolume !== undefined) changedFields.push('soundVolume');
    if (updates.soundFile !== undefined) changedFields.push('soundFile');
    if (updates.dndEnabled !== undefined) changedFields.push('dndEnabled');
    if (updates.eventSettings) changedFields.push('eventSettings');
    if (updates.channelPreferences) changedFields.push('channelPreferences');
    if (updates.quietHours) changedFields.push('quietHours');
    if (updates.inAppEnabled !== undefined) changedFields.push('inAppEnabled');
    if (updates.emailEnabled !== undefined) changedFields.push('emailEnabled');

    return {
      fieldsChanged: changedFields,
      eventSettingsChanged: updates.eventSettings ? Object.keys(updates.eventSettings) : [],
      channelPreferencesChanged: updates.channelPreferences ? Object.keys(updates.channelPreferences) : [],
      quietHoursChanged: updates.quietHours ? Object.keys(updates.quietHours) : [],
    };
  }
}
