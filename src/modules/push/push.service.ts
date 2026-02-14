/**
 * Push Notification Service
 * Story 10.4: Push Notifications Setup
 *
 * Handles Web Push API integration including:
 * - VAPID configuration
 * - Subscription management
 * - Push notification delivery
 * - Failed subscription cleanup
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
  private isConfigured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      maxConcurrentPushes: this.configService.get<number>('PUSH_MAX_CONCURRENT', DEFAULT_CONFIG.maxConcurrentPushes),
      retryAttempts: this.configService.get<number>('PUSH_RETRY_ATTEMPTS', DEFAULT_CONFIG.retryAttempts),
      batchSize: this.configService.get<number>('PUSH_BATCH_SIZE', DEFAULT_CONFIG.batchSize),
    };
  }

  /**
   * Initialize VAPID details on module init
   */
  onModuleInit(): void {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT', 'mailto:support@devos.app');

    if (publicKey && privateKey) {
      try {
        webPush.setVapidDetails(subject, publicKey, privateKey);
        this.isConfigured = true;
        this.logger.log('VAPID details configured successfully');
      } catch (error) {
        this.logger.error('Failed to configure VAPID details:', error);
      }
    } else {
      this.logger.warn('VAPID keys not configured - push notifications disabled');
    }
  }

  /**
   * Check if push notifications are configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Get VAPID public key for client subscription
   */
  getPublicKey(): string | null {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') || null;
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
    if (!this.isConfigured) {
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
    if (!this.isConfigured) {
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
        batch.map(sub => this.sendPush(sub, payload))
      );

      batchResults.forEach((result, index) => {
        const subscription = batch[index];

        if (result.status === 'fulfilled') {
          results.push({
            subscriptionId: subscription.id,
            success: true,
          });

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
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    this.logger.log(`Push notifications sent: ${successful} successful, ${failed} failed`);

    return results;
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
   * Cleanup stale subscriptions (not used in 30 days)
   */
  async cleanupStaleSubscriptions(daysInactive: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const result = await this.subscriptionRepository.delete({
      lastUsedAt: LessThan(cutoffDate),
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} stale push subscriptions`);
    }

    return result.affected || 0;
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
}
