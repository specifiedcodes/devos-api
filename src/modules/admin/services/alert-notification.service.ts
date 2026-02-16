import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AlertRule } from '../../../database/entities/alert-rule.entity';
import { AlertHistory } from '../../../database/entities/alert-history.entity';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';
import { User } from '../../../database/entities/user.entity';

/**
 * AlertNotificationService
 * Story 14.8: Alert Rules & Notifications (AC4)
 *
 * Handles multi-channel delivery of alert notifications.
 * Supports in-app, email, and webhook channels.
 */
@Injectable()
export class AlertNotificationService {
  private readonly logger = new Logger(AlertNotificationService.name);

  constructor(
    @InjectRepository(AlertHistory)
    private readonly alertHistoryRepository: Repository<AlertHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Listen for alert.fired events and dispatch notifications.
   */
  @OnEvent('alert.fired')
  async handleAlertFired(payload: {
    alert: AlertHistory;
    rule: AlertRule;
  }): Promise<void> {
    try {
      await this.sendAlertNotification(payload.alert, payload.rule);
    } catch (error) {
      this.logger.error(
        `Failed to handle alert.fired event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send alert notification via all configured channels.
   */
  async sendAlertNotification(
    alert: AlertHistory,
    rule: AlertRule,
  ): Promise<void> {
    const channels = rule.channels || [];
    const notifiedChannels: string[] = [];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'in_app':
            await this.sendInAppAlert(alert);
            notifiedChannels.push('in_app');
            break;
          case 'email':
            await this.sendEmailAlert(alert, rule);
            notifiedChannels.push('email');
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert, rule);
            notifiedChannels.push('webhook');
            break;
          default:
            this.logger.warn(`Unknown notification channel: ${channel}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send ${channel} alert for "${alert.alertName}": ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other channels on failure
      }
    }

    // Update alert history with notified channels
    if (notifiedChannels.length > 0) {
      await this.alertHistoryRepository.update(
        { id: alert.id },
        { notifiedChannels },
      );
    }
  }

  /**
   * Send in-app notification to all platform admin users.
   */
  async sendInAppAlert(alert: AlertHistory): Promise<void> {
    const admins = await this.userRepository.find({
      where: { isPlatformAdmin: true },
      select: ['id'],
    });

    for (const admin of admins) {
      try {
        await this.notificationService.create({
          workspaceId: 'platform',
          userId: admin.id,
          type: 'alert_fired',
          title: `[${alert.severity.toUpperCase()}] ${alert.alertName}`,
          message: alert.message,
          metadata: {
            alertHistoryId: alert.id,
            alertRuleId: alert.alertRuleId,
            severity: alert.severity,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to create in-app notification for admin ${admin.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `In-app alert sent to ${admins.length} admin(s) for "${alert.alertName}"`,
    );
  }

  /**
   * Send alert email to configured recipients.
   */
  async sendEmailAlert(alert: AlertHistory, rule: AlertRule): Promise<void> {
    const recipients: string[] =
      rule.metadata?.emailRecipients ||
      (this.configService.get<string>('ADMIN_ALERT_EMAIL')
        ? [this.configService.get<string>('ADMIN_ALERT_EMAIL')]
        : []);

    if (recipients.length === 0) {
      this.logger.warn(
        `No email recipients configured for alert "${alert.alertName}"`,
      );
      return;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const dashboardUrl = `${frontendUrl}/dashboard/admin/alerts`;

    const currentValue = alert.context?.currentValue || 'N/A';
    const condition = alert.context?.condition || 'N/A';
    const threshold = alert.context?.threshold || 'N/A';

    for (const email of recipients) {
      try {
        await this.emailService.sendEmail({
          to: email,
          subject: `[DevOS ${alert.severity.toUpperCase()}] ${alert.alertName}`,
          template: 'alert-notification',
          context: {
            alertName: alert.alertName,
            severity: alert.severity,
            message: alert.message,
            condition,
            threshold,
            currentValue,
            dashboardUrl,
            firedAt: alert.firedAt?.toISOString() || new Date().toISOString(),
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send alert email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Alert email sent to ${recipients.length} recipient(s) for "${alert.alertName}"`,
    );
  }

  /**
   * Send webhook alert with Slack-compatible payload.
   */
  async sendWebhookAlert(alert: AlertHistory, rule: AlertRule): Promise<void> {
    const webhookUrl = rule.metadata?.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn(
        `No webhook URL configured for alert rule "${rule.name}"`,
      );
      return;
    }

    const payload = {
      text: `[${alert.severity.toUpperCase()}] ${alert.alertName} - ${alert.message}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'DevOS Alert',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Alert:* ${alert.alertName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Severity:* ${alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Condition:* ${alert.context?.condition || 'N/A'} ${alert.context?.operator || ''} ${alert.context?.threshold || ''}`,
            },
            {
              type: 'mrkdwn',
              text: `*Time:* ${alert.firedAt?.toISOString() || new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const maxRetries = 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          this.logger.log(
            `Webhook alert delivered to ${webhookUrl} for "${alert.alertName}"`,
          );
          return;
        }

        lastError = new Error(
          `Webhook returned ${response.status}: ${response.statusText}`,
        );
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Webhook attempt ${attempt + 1} failed for "${alert.alertName}": ${lastError.message}`,
        );
      }
    }

    throw lastError || new Error('Webhook delivery failed');
  }
}
