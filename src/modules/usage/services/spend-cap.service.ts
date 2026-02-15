import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { UsageService } from './usage.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';

/**
 * Spend level classification based on current spend vs budget thresholds
 */
export enum SpendLevel {
  NORMAL = 'normal',           // < warningThreshold (default < 70%)
  WARNING = 'warning',         // >= warningThreshold, < downgradeThreshold (70-85%)
  DOWNGRADE = 'downgrade',     // >= downgradeThreshold, < criticalThreshold (85-95%)
  CRITICAL = 'critical',       // >= criticalThreshold, < hardCapThreshold (95-100%)
  HARD_CAP = 'hard_cap',       // >= hardCapThreshold (100%)
}

/**
 * Complete spend cap status for a workspace
 */
export interface SpendCapStatus {
  workspaceId: string;
  spendCapEnabled: boolean;
  monthlyBudget: number;
  currentSpend: number;
  percentageUsed: number;      // 0-100+
  spendLevel: SpendLevel;
  isDowngraded: boolean;       // true if routing is being auto-downgraded
  isPaused: boolean;           // true if AI operations are paused (hard cap)
  forcePremiumOverride: boolean;
  autoDowngradePaused: boolean;
  remainingBudget: number;
  projectedMonthlySpend: number;
}

/**
 * Threshold notification event payload
 */
export interface ThresholdReachedEvent {
  workspaceId: string;
  spendLevel: SpendLevel;
  threshold: number;
  currentSpend: number;
  monthlyBudget: number;
  percentageUsed: number;
  message: string;
  timestamp: string;
}

/** Redis cache TTL for spend cap status: 60 seconds */
const SPEND_CAP_CACHE_TTL = 60;

/**
 * SpendCapService - Threshold Detection & Spend Level
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 *
 * Provides threshold detection, spend level calculation,
 * Redis caching, and notification triggering for spend caps.
 */
@Injectable()
export class SpendCapService {
  private readonly logger = new Logger(SpendCapService.name);

  constructor(
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepo: Repository<WorkspaceSettings>,
    private readonly usageService: UsageService,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get complete spend cap status for a workspace.
   * Uses Redis caching with 60s TTL.
   */
  async getSpendCapStatus(workspaceId: string): Promise<SpendCapStatus> {
    // Try Redis cache first
    const cacheKey = `workspace:${workspaceId}:spend_cap_status`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read spend cap cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Cache miss - compute from DB
    const settings = await this.workspaceSettingsRepo.findOne({
      where: { workspaceId },
    });

    if (!settings || !settings.spendCapEnabled || !settings.monthlyLimitUsd || settings.monthlyLimitUsd <= 0) {
      const status: SpendCapStatus = {
        workspaceId,
        spendCapEnabled: false,
        monthlyBudget: settings?.monthlyLimitUsd || 0,
        currentSpend: 0,
        percentageUsed: 0,
        spendLevel: SpendLevel.NORMAL,
        isDowngraded: false,
        isPaused: false,
        forcePremiumOverride: settings?.forcePremiumOverride || false,
        autoDowngradePaused: settings?.autoDowngradePaused || false,
        remainingBudget: settings?.monthlyLimitUsd || 0,
        projectedMonthlySpend: 0,
      };
      // Cache the result
      await this.cacheStatus(cacheKey, status);
      return status;
    }

    const currentSpend = await this.usageService.getCurrentMonthSpend(workspaceId);
    const monthlyBudget = settings.monthlyLimitUsd;
    const percentageUsed = (currentSpend / monthlyBudget) * 100;
    const spendLevel = this.getSpendLevel(percentageUsed, settings);

    const isDowngraded =
      (spendLevel === SpendLevel.DOWNGRADE || spendLevel === SpendLevel.CRITICAL) &&
      !settings.autoDowngradePaused &&
      !settings.forcePremiumOverride;

    const isPaused = spendLevel === SpendLevel.HARD_CAP;

    const status: SpendCapStatus = {
      workspaceId,
      spendCapEnabled: true,
      monthlyBudget,
      currentSpend,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      spendLevel,
      isDowngraded,
      isPaused,
      forcePremiumOverride: settings.forcePremiumOverride,
      autoDowngradePaused: settings.autoDowngradePaused,
      remainingBudget: Math.max(0, monthlyBudget - currentSpend),
      projectedMonthlySpend: this.getProjectedMonthlySpend(currentSpend),
    };

    // Cache the result
    await this.cacheStatus(cacheKey, status);

    return status;
  }

  /**
   * Pure function: Determines spend level from percentage and thresholds.
   */
  getSpendLevel(percentageUsed: number, settings: WorkspaceSettings): SpendLevel {
    const warningPct = (settings.warningThreshold ?? 0.70) * 100;
    const downgradePct = (settings.downgradeThreshold ?? 0.85) * 100;
    const criticalPct = (settings.criticalThreshold ?? 0.95) * 100;
    const hardCapPct = (settings.hardCapThreshold ?? 1.00) * 100;

    if (percentageUsed >= hardCapPct) {
      return SpendLevel.HARD_CAP;
    }
    if (percentageUsed >= criticalPct) {
      return SpendLevel.CRITICAL;
    }
    if (percentageUsed >= downgradePct) {
      return SpendLevel.DOWNGRADE;
    }
    if (percentageUsed >= warningPct) {
      return SpendLevel.WARNING;
    }
    return SpendLevel.NORMAL;
  }

  /**
   * Returns true if routing should use cheaper models.
   */
  async shouldDowngradeRouting(workspaceId: string): Promise<boolean> {
    const status = await this.getSpendCapStatus(workspaceId);
    if (!status.spendCapEnabled) return false;
    if (status.forcePremiumOverride || status.autoDowngradePaused) return false;
    return status.spendLevel === SpendLevel.DOWNGRADE || status.spendLevel === SpendLevel.CRITICAL;
  }

  /**
   * Returns true if AI requests should be blocked (hard cap).
   * Hard cap is absolute - even forcePremiumOverride cannot bypass it.
   */
  async shouldBlockRequest(workspaceId: string): Promise<boolean> {
    const status = await this.getSpendCapStatus(workspaceId);
    if (!status.spendCapEnabled) return false;
    return status.spendLevel === SpendLevel.HARD_CAP;
  }

  /**
   * Returns downgrade model mappings for a workspace.
   */
  async getDowngradeRules(
    workspaceId: string,
  ): Promise<Record<string, { from: string; to: string }>> {
    const settings = await this.workspaceSettingsRepo.findOne({
      where: { workspaceId },
    });
    return settings?.downgradeRules || {};
  }

  /**
   * Extrapolates current month spend based on days elapsed.
   */
  getProjectedMonthlySpend(currentSpend: number): number {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // On the first day, no meaningful extrapolation - return current spend
    if (dayOfMonth <= 1) {
      return currentSpend;
    }

    const dailyAverage = currentSpend / dayOfMonth;
    return Math.round(dailyAverage * daysInMonth * 100) / 100;
  }

  /**
   * Invalidates cached spend cap status for a workspace.
   */
  async invalidateCache(workspaceId: string): Promise<void> {
    const cacheKey = `workspace:${workspaceId}:spend_cap_status`;
    try {
      await this.redisService.del(cacheKey);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate spend cap cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Checks if any threshold was crossed and sends notifications.
   * Uses transaction with row-level locking to prevent duplicate notifications.
   */
  async checkAndNotifyThresholds(workspaceId: string): Promise<void> {
    const status = await this.getSpendCapStatus(workspaceId);
    if (!status.spendCapEnabled) return;
    if (status.spendLevel === SpendLevel.NORMAL) return;

    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"

    // Map spend levels to threshold values and notification types
    const thresholdMap: Array<{
      level: SpendLevel;
      thresholdGetter: (s: WorkspaceSettings) => number;
      eventType: string;
    }> = [
      { level: SpendLevel.WARNING, thresholdGetter: (s) => s.warningThreshold, eventType: 'cost:threshold_warning' },
      { level: SpendLevel.DOWNGRADE, thresholdGetter: (s) => s.downgradeThreshold, eventType: 'cost:threshold_downgrade' },
      { level: SpendLevel.CRITICAL, thresholdGetter: (s) => s.criticalThreshold, eventType: 'cost:threshold_critical' },
      { level: SpendLevel.HARD_CAP, thresholdGetter: (s) => s.hardCapThreshold, eventType: 'cost:threshold_hard_cap' },
    ];

    // Determine which thresholds have been crossed
    const levelOrder = [SpendLevel.NORMAL, SpendLevel.WARNING, SpendLevel.DOWNGRADE, SpendLevel.CRITICAL, SpendLevel.HARD_CAP];
    const currentLevelIndex = levelOrder.indexOf(status.spendLevel);

    for (const entry of thresholdMap) {
      const entryLevelIndex = levelOrder.indexOf(entry.level);
      if (currentLevelIndex < entryLevelIndex) continue; // Not at this level yet

      // Use transaction with row-level locking for deduplication
      // Returns the threshold value if notification should be sent, or null to skip
      const thresholdValue = await this.workspaceSettingsRepo.manager.transaction(
        async (transactionalEntityManager) => {
          const lockedSettings = await transactionalEntityManager
            .createQueryBuilder(WorkspaceSettings, 'ws')
            .where('ws.workspaceId = :workspaceId', { workspaceId })
            .setLock('pessimistic_write')
            .getOne();

          if (!lockedSettings) return null;

          const triggeredAlerts = (lockedSettings.triggeredAlerts as any)?.[currentMonth] || [];
          const triggeredLevels = new Set(triggeredAlerts.map((a: any) => a.level));

          if (triggeredLevels.has(entry.level)) return null;

          const threshold = entry.thresholdGetter(lockedSettings);

          // Mark as triggered
          const newAlert = {
            level: entry.level,
            threshold,
            triggered_at: new Date().toISOString(),
            spend: status.currentSpend,
          };

          const updatedAlerts = {
            ...(lockedSettings.triggeredAlerts || {}),
            [currentMonth]: [...triggeredAlerts, newAlert],
          };

          await transactionalEntityManager.update(
            WorkspaceSettings,
            { workspaceId },
            { triggeredAlerts: updatedAlerts },
          );

          return threshold;
        },
      );

      if (thresholdValue !== null) {
        const threshold = thresholdValue;
        const message = this.getThresholdMessage(entry.level, status.percentageUsed);

        // Emit WebSocket event
        const event: ThresholdReachedEvent = {
          workspaceId,
          spendLevel: entry.level,
          threshold,
          currentSpend: status.currentSpend,
          monthlyBudget: status.monthlyBudget,
          percentageUsed: status.percentageUsed,
          message,
          timestamp: new Date().toISOString(),
        };
        this.eventEmitter.emit('cost:threshold_reached', event);

        // Create in-app notification
        try {
          await this.notificationService.create({
            workspaceId,
            type: 'spend_cap_alert',
            title: `Spend Cap: ${entry.level.toUpperCase()} Level Reached`,
            message,
            metadata: {
              spendLevel: entry.level,
              threshold,
              currentSpend: status.currentSpend,
              monthlyBudget: status.monthlyBudget,
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to create spend cap notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        // Send email notification
        try {
          // Get workspace with members for email recipients
          const settingsWithRelations = await this.workspaceSettingsRepo.findOne({
            where: { workspaceId },
            relations: ['workspace', 'workspace.members', 'workspace.members.user'],
          });

          if (settingsWithRelations?.workspace) {
            const members = settingsWithRelations.workspace.members || [];
            const owners = members.filter((m) => m.role === 'owner');

            for (const owner of owners) {
              if (!owner.user?.email) continue;
              try {
                await this.emailService.sendSpendingAlert(
                  owner.user.email,
                  settingsWithRelations.workspace.name,
                  Math.round(threshold * 100),
                  status.currentSpend,
                  status.monthlyBudget,
                  workspaceId,
                );
              } catch (emailError) {
                this.logger.error(
                  `Failed to send spend cap email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
                );
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to send spend cap email alerts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        this.logger.log(
          `Spend cap threshold ${entry.level} reached for workspace ${workspaceId} at ${status.percentageUsed}%`,
        );
      }
    }
  }

  /**
   * Generate human-readable threshold message
   */
  private getThresholdMessage(level: SpendLevel, percentageUsed: number): string {
    switch (level) {
      case SpendLevel.WARNING:
        return `Spending has reached ${percentageUsed.toFixed(1)}% of your monthly budget. Economy models will be preferred.`;
      case SpendLevel.DOWNGRADE:
        return `Spending has reached ${percentageUsed.toFixed(1)}% of your monthly budget. Models are being automatically downgraded to cheaper alternatives.`;
      case SpendLevel.CRITICAL:
        return `Spending has reached ${percentageUsed.toFixed(1)}% of your monthly budget. Only simple chat operations are allowed.`;
      case SpendLevel.HARD_CAP:
        return `Monthly budget has been exceeded (${percentageUsed.toFixed(1)}%). All AI operations are paused until the budget is increased or the month resets.`;
      default:
        return `Spending is at ${percentageUsed.toFixed(1)}% of your monthly budget.`;
    }
  }

  /**
   * Cache spend cap status in Redis
   */
  private async cacheStatus(cacheKey: string, status: SpendCapStatus): Promise<void> {
    try {
      await this.redisService.set(cacheKey, JSON.stringify(status), SPEND_CAP_CACHE_TTL);
    } catch (error) {
      this.logger.warn(
        `Failed to cache spend cap status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
