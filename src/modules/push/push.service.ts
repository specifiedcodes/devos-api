/**
 * Push Notification Service
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (enhanced with retry, topics, delivery stats)
 *
 * Handles Web Push API integration including:
 * - Subscription management
 * - Push notification delivery with retry logic
 * - Topic-based notification support
 * - Delivery statistics tracking
 * - Failed subscription cleanup
 *
 * VAPID configuration is delegated to VapidKeyService (Story 16.7).
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PushSubscription, PushSubscriptionKeys } from '../../database/entities/push-subscription.entity';
import {
  PushNotificationPayloadDto,
  PushResultDto,
  NotificationUrgency,
} from './push.dto';
import { VapidKeyService } from './services/vapid-key.service';

/**
 * Push service configuration
 */
export interface PushServiceConfig {
  maxConcurrentPushes: number;
  retryAttempts: number;
  retryDelay: number;
  batchSize: number;
  ttl: number;
}

/**
 * Delivery statistics
 */
export interface DeliveryStats {
  totalSent: number;
  totalFailed: number;
  totalExpiredRemoved: number;
}

/**
 * Maximum retry delay cap (30 seconds) to prevent unbounded backoff
 * when retryAttempts or retryDelay are set to large values via env vars.
 */
const MAX_RETRY_DELAY_MS = 30_000;

const DEFAULT_CONFIG: PushServiceConfig = {
  maxConcurrentPushes: 100,
  retryAttempts: 3,
  retryDelay: 1000,
  batchSize: 500,
  ttl: 86400, // 24 hours
};

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly config: PushServiceConfig;
  private deliveryStats: DeliveryStats = {
    totalSent: 0,
    totalFailed: 0,
    totalExpiredRemoved: 0,
  };

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    private readonly configService: ConfigService,
    private readonly vapidKeyService: VapidKeyService,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      maxConcurrentPushes: this.configService.get<number>('PUSH_MAX_CONCURRENT', DEFAULT_CONFIG.maxConcurrentPushes),
      retryAttempts: this.configService.get<number>('PUSH_RETRY_ATTEMPTS', DEFAULT_CONFIG.retryAttempts),
      retryDelay: this.configService.get<number>('PUSH_RETRY_DELAY', DEFAULT_CONFIG.retryDelay),
      batchSize: this.configService.get<number>('PUSH_BATCH_SIZE', DEFAULT_CONFIG.batchSize),
    };
  }

  /**
   * Initialize - delegate VAPID configuration check to VapidKeyService
   */
  onModuleInit(): void {
    if (this.vapidKeyService.isEnabled()) {
      this.logger.log('Push notification service ready (VAPID configured via VapidKeyService)');
    } else {
      this.logger.warn('Push notifications disabled - VAPID keys not configured');
    }
  }

  /**
   * Check if push notifications are configured
   */
  isEnabled(): boolean {
    return this.vapidKeyService.isEnabled();
  }

  /**
   * Get VAPID public key for client subscription
   */
  getPublicKey(): string | null {
    return this.vapidKeyService.getPublicKey();
  }

  /**
   * Create a new push subscription
   */
  async createSubscription(
    userId: string,
    workspaceId: string,
    endpoint: string,
    keys: PushSubscriptionKeys,
    userAgent?: string,
    deviceName?: string,
    expirationTime?: number | null,
  ): Promise<PushSubscription> {
    // Check for existing subscription with same endpoint
    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint },
    });

    if (existing) {
      // Update existing subscription
      existing.userId = userId;
      existing.workspaceId = workspaceId;
      existing.keys = keys;
      existing.userAgent = userAgent;
      existing.deviceName = deviceName;
      existing.expiresAt = expirationTime ? new Date(expirationTime) : undefined;
      existing.lastUsedAt = new Date();

      const updated = await this.subscriptionRepository.save(existing);
      this.logger.log(`Push subscription updated: ${updated.id} for user ${userId}`);
      return updated;
    }

    // Create new subscription
    const subscription = this.subscriptionRepository.create({
      userId,
      workspaceId,
      endpoint,
      keys,
      userAgent,
      deviceName,
      expiresAt: expirationTime ? new Date(expirationTime) : undefined,
      lastUsedAt: new Date(),
    });

    const saved = await this.subscriptionRepository.save(subscription);
    this.logger.log(`Push subscription created: ${saved.id} for user ${userId}`);
    return saved;
  }

  /**
   * Delete a push subscription by endpoint
   */
  async deleteSubscription(endpoint: string, userId: string): Promise<boolean> {
    const result = await this.subscriptionRepository.delete({
      endpoint,
      userId,
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Push subscription deleted for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Delete a push subscription by ID
   */
  async deleteSubscriptionById(id: string, userId: string): Promise<boolean> {
    const result = await this.subscriptionRepository.delete({
      id,
      userId,
    });

    return (result.affected ?? 0) > 0;
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    return this.subscriptionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all subscriptions for a workspace
   */
  async getWorkspaceSubscriptions(workspaceId: string): Promise<PushSubscription[]> {
    return this.subscriptionRepository.find({
      where: { workspaceId },
    });
  }

  /**
   * Send push notification to a specific user
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayloadDto,
  ): Promise<PushResultDto[]> {
    if (!this.isEnabled()) {
      this.logger.warn('Push notifications not configured');
      return [];
    }

    const subscriptions = await this.subscriptionRepository.find({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No push subscriptions found for user ${userId}`);
      return [];
    }

    return this.sendToSubscriptions(subscriptions, payload);
  }

  /**
   * Send push notification to all users in a workspace
   */
  async sendToWorkspace(
    workspaceId: string,
    payload: PushNotificationPayloadDto,
    excludeUserId?: string,
  ): Promise<PushResultDto[]> {
    if (!this.isEnabled()) {
      this.logger.warn('Push notifications not configured');
      return [];
    }

    let subscriptions = await this.subscriptionRepository.find({
      where: { workspaceId },
    });

    // Exclude specific user if specified
    if (excludeUserId) {
      subscriptions = subscriptions.filter(s => s.userId !== excludeUserId);
    }

    if (subscriptions.length === 0) {
      this.logger.debug(`No push subscriptions found for workspace ${workspaceId}`);
      return [];
    }

    return this.sendToSubscriptions(subscriptions, payload);
  }

  /**
   * Send push notification to a specific topic/tag.
   * Groups all subscriptions for users matching the topic.
   */
  async sendToTopic(
    workspaceId: string,
    topic: string,
    payload: PushNotificationPayloadDto,
  ): Promise<PushResultDto[]> {
    // Set tag on payload for client-side grouping
    const taggedPayload = { ...payload, tag: topic };
    return this.sendToWorkspace(workspaceId, taggedPayload);
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): DeliveryStats {
    return { ...this.deliveryStats };
  }

  /**
   * Send push notifications to multiple subscriptions
   */
  private async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: PushNotificationPayloadDto,
  ): Promise<PushResultDto[]> {
    const results: PushResultDto[] = [];
    const toDelete: string[] = [];

    // Process in batches
    for (let i = 0; i < subscriptions.length; i += this.config.batchSize) {
      const batch = subscriptions.slice(i, i + this.config.batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(sub => this.sendPushWithRetry(sub, payload))
      );

      batchResults.forEach((result, index) => {
        const subscription = batch[index];

        if (result.status === 'fulfilled') {
          results.push({
            subscriptionId: subscription.id,
            success: true,
          });

          this.deliveryStats.totalSent++;

          // Update last used timestamp
          this.subscriptionRepository.update(
            { id: subscription.id },
            { lastUsedAt: new Date() }
          ).catch(err => this.logger.error('Failed to update lastUsedAt:', err));

        } else {
          const error = result.reason;
          results.push({
            subscriptionId: subscription.id,
            success: false,
            error: error.message || 'Unknown error',
          });

          this.deliveryStats.totalFailed++;

          // Mark expired subscriptions for deletion
          if (this.isExpiredError(error)) {
            toDelete.push(subscription.id);
          }
        }
      });
    }

    // Delete expired subscriptions
    if (toDelete.length > 0) {
      await this.deleteExpiredSubscriptions(toDelete);
      this.deliveryStats.totalExpiredRemoved += toDelete.length;
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    this.logger.log(`Push notifications sent: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Send push notification with retry for transient failures.
   * Retries on 429 (Too Many Requests) and 5xx server errors.
   */
  private async sendPushWithRetry(
    subscription: PushSubscription,
    payload: PushNotificationPayloadDto,
    attempt: number = 1,
  ): Promise<webPush.SendResult> {
    try {
      return await this.sendPush(subscription, payload);
    } catch (error: any) {
      if (this.isRetryableError(error) && attempt < this.config.retryAttempts) {
        const delay = Math.min(
          this.config.retryDelay * Math.pow(2, attempt - 1),
          MAX_RETRY_DELAY_MS,
        );
        this.logger.warn(
          `Push send failed (attempt ${attempt}/${this.config.retryAttempts}), retrying in ${delay}ms: ${error.message}`,
        );
        await this.sleep(delay);
        return this.sendPushWithRetry(subscription, payload, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable (429 or 5xx)
   */
  private isRetryableError(error: any): boolean {
    return error.statusCode === 429 || (error.statusCode >= 500 && error.statusCode < 600);
  }

  /**
   * Send a single push notification
   */
  private async sendPush(
    subscription: PushSubscription,
    payload: PushNotificationPayloadDto,
  ): Promise<webPush.SendResult> {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const options: webPush.RequestOptions = {
      TTL: this.config.ttl,
      urgency: this.mapUrgency(payload.urgency),
    };

    return webPush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      options,
    );
  }

  /**
   * Map DTO urgency to web-push urgency
   */
  private mapUrgency(urgency?: NotificationUrgency): 'very-low' | 'low' | 'normal' | 'high' {
    switch (urgency) {
      case NotificationUrgency.VERY_LOW:
        return 'very-low';
      case NotificationUrgency.LOW:
        return 'low';
      case NotificationUrgency.HIGH:
        return 'high';
      default:
        return 'normal';
    }
  }

  /**
   * Check if error indicates expired/invalid subscription
   */
  private isExpiredError(error: any): boolean {
    // HTTP 410 Gone or 404 Not Found indicate expired subscription
    return error.statusCode === 410 || error.statusCode === 404;
  }

  /**
   * Delete expired subscriptions
   */
  private async deleteExpiredSubscriptions(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const result = await this.subscriptionRepository.delete({ id: In(ids) });
    this.logger.log(`Deleted ${result.affected} expired push subscriptions`);
  }

  /**
   * Count subscriptions for a user
   */
  async countUserSubscriptions(userId: string): Promise<number> {
    return this.subscriptionRepository.count({
      where: { userId },
    });
  }

  /**
   * Count subscriptions for a workspace
   */
  async countWorkspaceSubscriptions(workspaceId: string): Promise<number> {
    return this.subscriptionRepository.count({
      where: { workspaceId },
    });
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
