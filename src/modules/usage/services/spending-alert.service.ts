import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { UsageService } from './usage.service';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class SpendingAlertService {
  private readonly logger = new Logger(SpendingAlertService.name);

  constructor(
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepo: Repository<WorkspaceSettings>,
    private readonly usageService: UsageService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Check spending alerts for all workspaces with limits enabled
   * Called by scheduled job every 5 minutes
   */
  async checkSpendingAlerts(): Promise<void> {
    this.logger.log('Starting spending alerts check...');

    try {
      // Get all workspaces with limits enabled
      const workspacesWithLimits = await this.workspaceSettingsRepo.find({
        where: { limitEnabled: true },
        relations: ['workspace', 'workspace.members', 'workspace.members.user'],
      });

      this.logger.log(
        `Found ${workspacesWithLimits.length} workspaces with spending limits enabled`,
      );

      for (const settings of workspacesWithLimits) {
        try {
          await this.checkWorkspaceLimit(settings);
        } catch (error) {
          this.logger.error(
            `Failed to check spending limit for workspace ${settings.workspaceId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      this.logger.log(
        `Checked ${workspacesWithLimits.length} workspaces for spending alerts`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to check spending alerts: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Check spending limit for a single workspace
   */
  private async checkWorkspaceLimit(
    settings: WorkspaceSettings,
  ): Promise<void> {
    const { workspaceId, monthlyLimitUsd, alertThresholds } = settings;

    if (!monthlyLimitUsd || monthlyLimitUsd <= 0) {
      return;
    }

    // Get current month spend
    const currentMonthSpend =
      await this.usageService.getCurrentMonthSpend(workspaceId);

    const percentageUsed = (currentMonthSpend / monthlyLimitUsd) * 100;

    // Get current month key for triggered_alerts
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-01"
    const triggeredAlerts =
      (settings.triggeredAlerts as any)?.[currentMonth] || [];
    const triggeredThresholds = new Set(
      triggeredAlerts.map((a: any) => a.threshold),
    );

    // Check each threshold
    if (!alertThresholds || alertThresholds.length === 0) {
      return;
    }

    for (const threshold of alertThresholds) {
      if (
        percentageUsed >= threshold &&
        !triggeredThresholds.has(threshold)
      ) {
        await this.sendAlert(
          settings,
          threshold,
          currentMonthSpend,
          monthlyLimitUsd,
        );

        // Mark as triggered
        const newAlert = {
          threshold,
          triggered_at: new Date().toISOString(),
          spend: currentMonthSpend,
        };

        const updatedAlerts = {
          ...(settings.triggeredAlerts || {}),
          [currentMonth]: [...triggeredAlerts, newAlert],
        };

        await this.workspaceSettingsRepo.update(
          { workspaceId },
          { triggeredAlerts: updatedAlerts },
        );

        this.logger.log(
          `Alert triggered at ${threshold}% for workspace ${workspaceId}`,
        );
      }
    }
  }

  /**
   * Send alert via email and in-app notification
   */
  private async sendAlert(
    settings: WorkspaceSettings,
    threshold: number,
    currentSpend: number,
    limit: number,
  ): Promise<void> {
    const workspace = settings.workspace;
    if (!workspace) {
      this.logger.warn(
        `Workspace not loaded for settings ${settings.workspaceId}`,
      );
      return;
    }

    this.logger.log(
      `Sending ${threshold}% alert for workspace ${workspace.id} (spend: $${currentSpend.toFixed(
        2,
      )} / $${limit.toFixed(2)})`,
    );

    // Get workspace owners
    const members = workspace.members || [];
    const owners = members.filter((m) => m.role === 'owner');

    if (owners.length === 0) {
      this.logger.warn(
        `No owners found for workspace ${workspace.id}, skipping alerts`,
      );
      return;
    }

    // Create in-app notifications
    for (const owner of owners) {
      if (!owner.user) continue;

      try {
        await this.notificationService.create({
          workspaceId: workspace.id,
          userId: owner.user.id,
          type: 'spending_alert',
          title: `Spending Alert: ${threshold}% Budget Used`,
          message: `Your workspace has used ${threshold}% of the monthly budget ($${currentSpend.toFixed(
            2,
          )} of $${limit.toFixed(2)})`,
          metadata: { threshold, currentSpend, limit },
        });
      } catch (error) {
        this.logger.error(
          `Failed to create notification for user ${owner.user.id}`,
        );
      }
    }

    // Send email notifications
    for (const owner of owners) {
      if (!owner.user?.email) continue;

      try {
        await this.emailService.sendSpendingAlert(
          owner.user.email,
          workspace.name,
          threshold,
          currentSpend,
          limit,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send email to ${owner.user.email}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }
  }

  /**
   * Reset monthly alerts (called on 1st of every month)
   */
  async resetMonthlyAlerts(): Promise<void> {
    this.logger.log('Resetting monthly spending alerts...');

    try {
      const allSettings = await this.workspaceSettingsRepo.find({
        where: { limitEnabled: true },
      });

      for (const settings of allSettings) {
        // Keep historical data, just clear current month
        // The checkWorkspaceLimit will handle new month automatically
        this.logger.debug(
          `Alerts for workspace ${settings.workspaceId} will reset naturally with new month`,
        );
      }

      this.logger.log('Monthly alert reset complete');
    } catch (error) {
      this.logger.error(
        `Failed to reset monthly alerts: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
