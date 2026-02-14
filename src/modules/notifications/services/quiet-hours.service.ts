/**
 * QuietHoursService
 * Story 10.6: Configurable Notification Preferences
 *
 * Handles timezone-aware quiet hours checking and notification queueing.
 * Features:
 * - Timezone-aware time comparison
 * - Redis queue for held notifications
 * - Batch digest on quiet hours end
 * - Critical notification bypass
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationPreferences,
  QuietHoursConfig,
  CRITICAL_NOTIFICATION_TYPES,
} from '../../../database/entities/notification-preferences.entity';
import { NotificationEvent, NotificationRecipient, NotificationType } from '../events/notification.events';

/**
 * Queue key prefix for held notifications
 */
const QUIET_HOURS_QUEUE_PREFIX = 'quiet-hours';
const QUEUE_TTL = 43200; // 12 hours max retention

/**
 * Quiet hours status response
 */
export interface QuietHoursStatus {
  inQuietHours: boolean;
  endsAt?: string;
  timezone?: string;
}

/**
 * Queued notification structure
 */
export interface QueuedNotification {
  type: NotificationType;
  payload: Record<string, any>;
  timestamp: number;
  workspaceId: string;
}

@Injectable()
export class QuietHoursService {
  private readonly logger = new Logger(QuietHoursService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if user is currently in quiet hours
   */
  async isInQuietHours(
    userId: string,
    prefs: NotificationPreferences,
  ): Promise<boolean> {
    if (!prefs.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const userTime = this.toUserTimezone(now, prefs.quietHours.timezone);
    const currentTime = this.formatTime(userTime);

    return this.isTimeBetween(
      currentTime,
      prefs.quietHours.startTime,
      prefs.quietHours.endTime,
    );
  }

  /**
   * Get quiet hours status for a user
   */
  async getStatus(userId: string, prefs: NotificationPreferences): Promise<QuietHoursStatus> {
    if (!prefs.quietHours?.enabled) {
      return { inQuietHours: false };
    }

    const isInQuietHours = await this.isInQuietHours(userId, prefs);

    if (!isInQuietHours) {
      return { inQuietHours: false };
    }

    // Calculate when quiet hours end
    const endsAt = this.calculateEndTime(prefs.quietHours);

    return {
      inQuietHours: true,
      endsAt,
      timezone: prefs.quietHours.timezone,
    };
  }

  /**
   * Check if notification type should bypass quiet hours
   */
  shouldBypassQuietHours(
    type: NotificationType,
    exceptCritical: boolean,
  ): boolean {
    if (!exceptCritical) {
      return false;
    }
    return CRITICAL_NOTIFICATION_TYPES.includes(type as any);
  }

  /**
   * Queue notification for later delivery
   */
  async queueForLater(
    recipient: NotificationRecipient,
    event: NotificationEvent,
  ): Promise<void> {
    const key = this.getQueueKey(recipient.userId, Date.now());
    const queuedNotification: QueuedNotification = {
      type: event.type,
      payload: event.payload,
      timestamp: Date.now(),
      workspaceId: recipient.workspaceId,
    };

    try {
      await this.redisService.set(
        key,
        JSON.stringify(queuedNotification),
        QUEUE_TTL,
      );

      this.logger.debug(
        `Queued notification for user ${recipient.userId} during quiet hours`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue notification for user ${recipient.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Get all queued notifications for a user
   */
  async getQueuedNotifications(userId: string): Promise<QueuedNotification[]> {
    try {
      const pattern = `${QUIET_HOURS_QUEUE_PREFIX}:${userId}:*`;
      const keys = await this.redisService.scanKeys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const notifications: QueuedNotification[] = [];

      for (const key of keys) {
        const value = await this.redisService.get(key);
        if (value) {
          try {
            notifications.push(JSON.parse(value));
          } catch {
            // Skip invalid entries
          }
        }
      }

      // Sort by timestamp
      return notifications.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      this.logger.error(
        `Failed to get queued notifications for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  /**
   * Flush queued notifications for a user (called when quiet hours end)
   */
  async flushQueuedNotifications(userId: string): Promise<QueuedNotification[]> {
    const notifications = await this.getQueuedNotifications(userId);

    if (notifications.length === 0) {
      return [];
    }

    // Delete all queued notifications
    try {
      const pattern = `${QUIET_HOURS_QUEUE_PREFIX}:${userId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.redisService.del(...keys);
      }

      this.logger.log(
        `Flushed ${notifications.length} queued notifications for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to flush notifications for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return notifications;
  }

  /**
   * Build a digest summary of queued notifications
   */
  buildDigestSummary(notifications: QueuedNotification[]): {
    title: string;
    body: string;
    count: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const notification of notifications) {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    }

    const count = notifications.length;
    const title = `${count} notification${count === 1 ? '' : 's'} during quiet hours`;

    const typeSummary = Object.entries(byType)
      .map(([type, typeCount]) => `${typeCount} ${type.replace(/_/g, ' ')}`)
      .join(', ');

    const body = `You missed: ${typeSummary}`;

    return {
      title,
      body,
      count,
      byType,
    };
  }

  /**
   * Count queued notifications for a user
   */
  async countQueuedNotifications(userId: string): Promise<number> {
    try {
      const pattern = `${QUIET_HOURS_QUEUE_PREFIX}:${userId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      return keys.length;
    } catch {
      return 0;
    }
  }

  /**
   * Convert time to user's timezone and extract hour/minute
   * Returns a Date object with hours/minutes set to the user's local time
   * Note: The returned Date is only useful for extracting time components,
   * not for absolute time comparison
   */
  toUserTimezone(date: Date, timezone: string): Date {
    try {
      // Validate timezone first
      if (!this.isValidTimezone(timezone)) {
        this.logger.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
        return date;
      }

      // Get the time components in the user's timezone
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      };

      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(date);

      const hourPart = parts.find(p => p.type === 'hour');
      const minutePart = parts.find(p => p.type === 'minute');

      // Handle edge case where hour might be "24" in some locales
      let hour = parseInt(hourPart?.value || '0', 10);
      if (hour === 24) hour = 0;
      const minute = parseInt(minutePart?.value || '0', 10);

      // Create a new date with the extracted time components
      // We use UTC methods to avoid local timezone interference
      const result = new Date(0);
      result.setUTCHours(hour, minute, 0, 0);
      return result;
    } catch (error) {
      this.logger.warn(`Error converting timezone: ${error}, falling back to UTC`);
      return date;
    }
  }

  /**
   * Check if a timezone string is valid
   */
  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format time as HH:MM
   * Uses UTC methods for consistency with toUserTimezone
   */
  formatTime(date: Date): string {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Check if current time is between start and end (handles midnight crossing)
   */
  isTimeBetween(current: string, start: string, end: string): boolean {
    const currentMinutes = this.timeToMinutes(current);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);

    if (startMinutes <= endMinutes) {
      // Normal range (e.g., 09:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Crosses midnight (e.g., 22:00 - 08:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Convert HH:MM to minutes since midnight
   */
  timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Calculate when quiet hours will end (ISO string)
   */
  calculateEndTime(quietHours: QuietHoursConfig): string {
    const now = new Date();
    const [endHour, endMinute] = quietHours.endTime.split(':').map(Number);

    // Create end time in user's timezone
    const endDate = new Date(now);

    // If end time is before current time, it's tomorrow
    const currentTime = this.formatTime(this.toUserTimezone(now, quietHours.timezone));
    const currentMinutes = this.timeToMinutes(currentTime);
    const endMinutes = this.timeToMinutes(quietHours.endTime);

    // Handle midnight crossing
    if (this.timeToMinutes(quietHours.startTime) > endMinutes) {
      // Quiet hours cross midnight
      if (currentMinutes >= this.timeToMinutes(quietHours.startTime)) {
        // After start time, end is tomorrow
        endDate.setDate(endDate.getDate() + 1);
      }
    } else {
      // Normal range, if before end time, it's today, otherwise tomorrow
      if (currentMinutes >= endMinutes) {
        endDate.setDate(endDate.getDate() + 1);
      }
    }

    endDate.setHours(endHour, endMinute, 0, 0);

    return endDate.toISOString();
  }

  /**
   * Get queue key for a notification
   */
  private getQueueKey(userId: string, timestamp: number): string {
    return `${QUIET_HOURS_QUEUE_PREFIX}:${userId}:${timestamp}`;
  }
}
