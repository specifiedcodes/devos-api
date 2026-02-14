/**
 * NotificationBatchService
 * Story 10.5: Notification Triggers
 *
 * Handles batching of non-urgent notifications.
 * Uses Redis for batch queue storage with TTL.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { NotificationEvent, NotificationType } from '../events/notification.events';

/**
 * Batched notification entry stored in Redis
 */
interface BatchedNotification {
  type: NotificationType;
  payload: Record<string, any>;
  timestamp: number;
  workspaceId: string;
}

/**
 * Consolidated batch notification
 */
export interface ConsolidatedNotification {
  type: string;
  payload: Record<string, any>;
  items?: BatchedNotification[];
}

/**
 * Types that should be sent immediately, never batched
 */
const IMMEDIATE_TYPES: NotificationType[] = ['deployment_failed', 'agent_error'];

/**
 * Types that can be consolidated into batch summaries
 */
const CONSOLIDATABLE_TYPES: NotificationType[] = [
  'epic_completed',
  'story_completed',
  'agent_message',
  'deployment_success',
];

/**
 * Default batch TTL in seconds (30 minutes)
 */
const BATCH_TTL_SECONDS = 30 * 60;

@Injectable()
export class NotificationBatchService {
  private readonly logger = new Logger(NotificationBatchService.name);
  private readonly BATCH_KEY_PREFIX = 'notifications:batch:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Queue a notification for batched delivery
   */
  async queueNotification(notification: NotificationEvent): Promise<void> {
    // Queue for each recipient with their workspace context
    for (const recipient of notification.recipients) {
      const batchedNotification: BatchedNotification = {
        type: notification.type,
        payload: notification.payload,
        timestamp: Date.now(),
        workspaceId: recipient.workspaceId,
      };
      await this.addToBatch(recipient.userId, batchedNotification);
    }

    this.logger.debug(
      `Queued ${notification.type} notification for ${notification.recipients.length} recipients`,
    );
  }

  /**
   * Add notification to user's batch queue
   */
  private async addToBatch(userId: string, notification: BatchedNotification): Promise<void> {
    const key = this.getBatchKey(userId);
    const existing = await this.redisService.get(key);

    let batch: BatchedNotification[] = [];
    if (existing) {
      try {
        batch = JSON.parse(existing);
      } catch {
        batch = [];
      }
    }

    batch.push(notification);

    await this.redisService.set(key, JSON.stringify(batch), BATCH_TTL_SECONDS);
  }

  /**
   * Get the current batch size for a user
   */
  async getBatchSize(userId: string): Promise<number> {
    const key = this.getBatchKey(userId);
    const data = await this.redisService.get(key);

    if (!data) return 0;

    try {
      const batch = JSON.parse(data);
      return Array.isArray(batch) ? batch.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Flush batch for a user - returns all notifications and clears queue
   */
  async flushBatch(userId: string): Promise<BatchedNotification[]> {
    const key = this.getBatchKey(userId);
    const data = await this.redisService.get(key);

    if (!data) return [];

    try {
      const batch = JSON.parse(data);
      await this.redisService.del(key);
      this.logger.log(`Flushed ${batch.length} notifications for user ${userId}`);
      return Array.isArray(batch) ? batch : [];
    } catch (error) {
      this.logger.error(`Failed to flush batch for user ${userId}`, error);
      return [];
    }
  }

  /**
   * Consolidate batch notifications into summary notifications
   * e.g., "3 stories completed in the last 15 minutes"
   */
  consolidateBatch(notifications: BatchedNotification[]): ConsolidatedNotification[] {
    const grouped = new Map<string, BatchedNotification[]>();

    // Group by type
    for (const notification of notifications) {
      const existing = grouped.get(notification.type) || [];
      existing.push(notification);
      grouped.set(notification.type, existing);
    }

    const consolidated: ConsolidatedNotification[] = [];

    for (const [type, items] of grouped.entries()) {
      if (items.length > 1 && this.isConsolidatableType(type as NotificationType)) {
        // Create consolidated notification
        consolidated.push(this.createConsolidatedNotification(type as NotificationType, items));
      } else {
        // Keep individual notifications
        for (const item of items) {
          consolidated.push({
            type: item.type,
            payload: item.payload,
          });
        }
      }
    }

    return consolidated;
  }

  /**
   * Create a consolidated notification from multiple of the same type
   */
  private createConsolidatedNotification(
    type: NotificationType,
    items: BatchedNotification[],
  ): ConsolidatedNotification {
    switch (type) {
      case 'epic_completed':
        return {
          type: 'epic_completed_batch',
          payload: {
            count: items.length,
            message: `${items.length} epics completed`,
            epicTitles: items.map((i) => i.payload.epicTitle).filter(Boolean),
          },
          items,
        };

      case 'story_completed':
        return {
          type: 'story_completed_batch',
          payload: {
            count: items.length,
            message: `${items.length} stories completed`,
            storyTitles: items.map((i) => i.payload.storyTitle).filter(Boolean),
          },
          items,
        };

      case 'agent_message':
        return {
          type: 'agent_message_batch',
          payload: {
            count: items.length,
            message: `You have ${items.length} new messages from agents`,
            agentNames: [...new Set(items.map((i) => i.payload.agentName).filter(Boolean))],
          },
          items,
        };

      case 'deployment_success':
        return {
          type: 'deployment_success_batch',
          payload: {
            count: items.length,
            message: `${items.length} deployments completed`,
            projects: [...new Set(items.map((i) => i.payload.projectName).filter(Boolean))],
          },
          items,
        };

      default:
        return {
          type: `${type}_batch`,
          payload: {
            count: items.length,
            message: `${items.length} notifications`,
          },
          items,
        };
    }
  }

  /**
   * Check if a notification type can be consolidated
   */
  private isConsolidatableType(type: NotificationType): boolean {
    return CONSOLIDATABLE_TYPES.includes(type);
  }

  /**
   * Check if a notification should be sent immediately (not batched)
   */
  isImmediateNotification(notification: NotificationEvent): boolean {
    // Check explicit types that should never be batched
    if (IMMEDIATE_TYPES.includes(notification.type)) {
      return true;
    }

    // Check if notification explicitly disables batching
    if (notification.batchable === false) {
      return true;
    }

    return false;
  }

  /**
   * Get all user IDs that have pending batch notifications
   */
  async getAllPendingUserIds(): Promise<string[]> {
    const keys = await this.redisService.keys(`${this.BATCH_KEY_PREFIX}*`);
    return keys.map((key) => key.replace(this.BATCH_KEY_PREFIX, ''));
  }

  /**
   * Get batch key for user
   */
  private getBatchKey(userId: string): string {
    return `${this.BATCH_KEY_PREFIX}${userId}`;
  }
}
