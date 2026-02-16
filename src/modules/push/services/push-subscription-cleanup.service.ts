/**
 * Push Subscription Cleanup Service
 * Story 16.7: VAPID Key Web Push Setup
 *
 * Scheduled service for cleaning up stale and expired push subscriptions.
 * Runs weekly via cron to keep the subscription table clean.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, And } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';

export interface CleanupResult {
  staleRemoved: number;
  expiredRemoved: number;
  totalRemoved: number;
  executedAt: string;
  durationMs: number;
}

@Injectable()
export class PushSubscriptionCleanupService {
  private readonly logger = new Logger(PushSubscriptionCleanupService.name);
  private readonly staleThresholdDays: number;
  private lastCleanupResult: CleanupResult | null = null;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    private readonly configService: ConfigService,
  ) {
    this.staleThresholdDays = this.configService.get<number>(
      'PUSH_STALE_THRESHOLD_DAYS',
      30,
    );
  }

  /**
   * Weekly cleanup of stale and expired subscriptions.
   * Runs every Sunday at 3:00 AM.
   *
   * Note: Stale subscriptions are removed first, then expired. If a subscription
   * qualifies as both stale and expired, it will be attributed to the stale count.
   * The totalRemoved sum is always accurate since a row can only be deleted once.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyCleanup(): Promise<CleanupResult> {
    this.logger.log('Starting weekly push subscription cleanup...');
    const startTime = Date.now();

    const staleRemoved = await this.removeStaleSubscriptions();
    const expiredRemoved = await this.removeExpiredSubscriptions();

    const result: CleanupResult = {
      staleRemoved,
      expiredRemoved,
      totalRemoved: staleRemoved + expiredRemoved,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    this.lastCleanupResult = result;
    this.logger.log(
      `Push subscription cleanup complete: ${result.totalRemoved} removed ` +
        `(${staleRemoved} stale, ${expiredRemoved} expired) in ${result.durationMs}ms`,
    );

    return result;
  }

  /**
   * Remove subscriptions not used within staleThresholdDays.
   * Also removes subscriptions where lastUsedAt is NULL and createdAt is older
   * than the threshold, since NULL lastUsedAt means the subscription was never
   * confirmed as active.
   */
  async removeStaleSubscriptions(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.staleThresholdDays);

    // Remove subscriptions with lastUsedAt older than cutoff
    const staleResult = await this.subscriptionRepository.delete({
      lastUsedAt: LessThan(cutoffDate),
    });

    // Remove subscriptions where lastUsedAt is NULL and createdAt is older than cutoff
    const nullResult = await this.subscriptionRepository.delete({
      lastUsedAt: IsNull(),
      createdAt: LessThan(cutoffDate),
    });

    const removed = (staleResult.affected || 0) + (nullResult.affected || 0);
    if (removed > 0) {
      this.logger.log(
        `Removed ${removed} stale push subscriptions (inactive > ${this.staleThresholdDays} days)`,
      );
    }
    return removed;
  }

  /**
   * Remove subscriptions that have passed their expiresAt timestamp.
   */
  async removeExpiredSubscriptions(): Promise<number> {
    const now = new Date();

    const result = await this.subscriptionRepository.delete({
      expiresAt: LessThan(now),
    });

    const removed = result.affected || 0;
    if (removed > 0) {
      this.logger.log(`Removed ${removed} expired push subscriptions`);
    }
    return removed;
  }

  /**
   * Get the result of the last cleanup run.
   */
  getLastCleanupResult(): CleanupResult | null {
    return this.lastCleanupResult;
  }

  /**
   * Get subscription statistics.
   */
  async getSubscriptionStats(): Promise<{
    total: number;
    staleCount: number;
    expiredCount: number;
  }> {
    const total = await this.subscriptionRepository.count();

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - this.staleThresholdDays);

    const staleCount = await this.subscriptionRepository.count({
      where: { lastUsedAt: LessThan(staleCutoff) },
    });

    const expiredCount = await this.subscriptionRepository.count({
      where: { expiresAt: LessThan(new Date()) },
    });

    return { total, staleCount, expiredCount };
  }
}
