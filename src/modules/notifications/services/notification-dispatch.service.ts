/**
 * NotificationDispatchService
 * Story 10.5: Notification Triggers
 * Story 10.6: Configurable Notification Preferences
 * Story 16.4: Slack Notification Integration
 *
 * Dispatches notifications to push, in-app, and Slack channels.
 * Routes urgent notifications immediately, queues batchable ones.
 * Respects user preferences for notification types and quiet hours.
 */

import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { NotificationBatchService } from './notification-batch.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { QuietHoursService } from './quiet-hours.service';
import { SlackNotificationService } from './slack-notification.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { PushNotificationPayloadDto, NotificationUrgency } from '../../push/push.dto';
import { NotificationEvent, NotificationRecipient, NotificationType } from '../events/notification.events';
import { CRITICAL_NOTIFICATION_TYPES } from '../../../database/entities/notification-preferences.entity';

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly pushService: PushNotificationService,
    private readonly inAppService: NotificationService,
    private readonly batchService: NotificationBatchService,
    private readonly templateService: NotificationTemplateService,
    @Optional() @Inject(forwardRef(() => NotificationPreferencesService))
    private readonly preferencesService?: NotificationPreferencesService,
    @Optional() @Inject(forwardRef(() => QuietHoursService))
    private readonly quietHoursService?: QuietHoursService,
    @Optional() @Inject(forwardRef(() => SlackNotificationService))
    private readonly slackService?: SlackNotificationService,
  ) {}

  /**
   * Dispatch notification to all recipients via push and in-app channels
   * Story 10.6: Respects user preferences and quiet hours
   */
  async dispatch(notification: NotificationEvent): Promise<void> {
    this.logger.log(
      `Dispatching ${notification.type} to ${notification.recipients.length} recipients`,
    );

    // Filter recipients based on preferences
    const filteredRecipients = await this.filterRecipientsByPreferences(
      notification.recipients,
      notification.type,
    );

    if (filteredRecipients.length === 0) {
      this.logger.debug(`No recipients after preference filtering for ${notification.type}`);
      return;
    }

    // Create filtered notification event
    const filteredNotification: NotificationEvent = {
      ...notification,
      recipients: filteredRecipients,
    };

    // Create in-app notifications for filtered recipients
    await this.createInAppNotifications(filteredNotification);

    // Handle push notifications based on urgency and quiet hours
    if (this.batchService.isImmediateNotification(filteredNotification)) {
      // Send push immediately for urgent notifications
      await this.sendImmediatePushWithQuietHours(filteredNotification);
    } else {
      // Queue for batched delivery
      await this.batchService.queueNotification(filteredNotification);
    }

    // Story 16.4: Slack notification delivery (fault-isolated)
    await this.dispatchToSlack(filteredNotification);
  }

  /**
   * Dispatch notification to Slack for all unique workspace IDs.
   * Story 16.4: Never lets Slack failures block main dispatch flow.
   */
  private async dispatchToSlack(notification: NotificationEvent): Promise<void> {
    if (!this.slackService) return;

    // Get unique workspace IDs from recipients
    const workspaceIds = [...new Set(notification.recipients.map(r => r.workspaceId))];

    for (const workspaceId of workspaceIds) {
      try {
        await this.slackService.sendNotification(workspaceId, notification);
      } catch (error) {
        this.logger.error(
          `Failed to send Slack notification to workspace ${workspaceId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Never let Slack failures block main dispatch
      }
    }
  }

  /**
   * Filter recipients based on their notification preferences
   * Story 10.6: Notification Type Toggles
   */
  private async filterRecipientsByPreferences(
    recipients: NotificationRecipient[],
    type: NotificationType,
  ): Promise<NotificationRecipient[]> {
    // If preferences service not available, return all recipients
    if (!this.preferencesService) {
      return recipients;
    }

    // Critical notifications bypass preference checks
    if (this.isCriticalNotification(type)) {
      return recipients;
    }

    const filteredRecipients: NotificationRecipient[] = [];

    for (const recipient of recipients) {
      try {
        const isEnabled = await this.preferencesService.isTypeEnabled(
          recipient.userId,
          recipient.workspaceId,
          type,
        );

        if (isEnabled) {
          filteredRecipients.push(recipient);
        } else {
          this.logger.debug(
            `Notification ${type} disabled for user ${recipient.userId}`,
          );
        }
      } catch (error) {
        // If preference check fails, include the recipient (fail open)
        this.logger.warn(
          `Failed to check preferences for user ${recipient.userId}, including anyway`,
        );
        filteredRecipients.push(recipient);
      }
    }

    return filteredRecipients;
  }

  /**
   * Check if notification type is critical (cannot be disabled)
   */
  private isCriticalNotification(type: NotificationType): boolean {
    return CRITICAL_NOTIFICATION_TYPES.includes(type as any);
  }

  /**
   * Send immediate push notifications respecting quiet hours
   * Story 10.6: Do Not Disturb Mode
   */
  private async sendImmediatePushWithQuietHours(
    notification: NotificationEvent,
  ): Promise<void> {
    if (!this.pushService.isEnabled()) {
      this.logger.debug('Push notifications disabled, skipping immediate push');
      return;
    }

    for (const recipient of notification.recipients) {
      try {
        await this.sendPushToUserWithQuietHours(recipient, notification);
      } catch (error) {
        this.logger.error(
          `Failed to send push to user ${recipient.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue with other recipients
      }
    }
  }

  /**
   * Send push to user, checking quiet hours
   */
  private async sendPushToUserWithQuietHours(
    recipient: NotificationRecipient,
    notification: NotificationEvent,
  ): Promise<void> {
    // If quiet hours service is available, check quiet hours
    if (this.quietHoursService && this.preferencesService) {
      try {
        const prefs = await this.preferencesService.getPreferences(
          recipient.userId,
          recipient.workspaceId,
        );

        const inQuietHours = await this.quietHoursService.isInQuietHours(
          recipient.userId,
          prefs,
        );

        if (inQuietHours) {
          const isCritical = this.isCriticalNotification(notification.type);
          const shouldBypass = this.quietHoursService.shouldBypassQuietHours(
            notification.type,
            prefs.quietHours?.exceptCritical ?? true,
          );

          if (!isCritical && !shouldBypass) {
            // Queue for later delivery
            await this.quietHoursService.queueForLater(recipient, notification);
            this.logger.debug(
              `Queued notification for user ${recipient.userId} during quiet hours`,
            );
            return;
          }

          // Critical notification, send anyway
          this.logger.debug(
            `Sending critical notification ${notification.type} during quiet hours for user ${recipient.userId}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check quiet hours for user ${recipient.userId}, sending anyway`,
        );
      }
    }

    // Send the push notification
    await this.sendPushToUser(recipient, notification);
  }

  /**
   * Create in-app notification records for all recipients
   */
  private async createInAppNotifications(notification: NotificationEvent): Promise<void> {
    const title = this.templateService.generateTitle(notification.type, notification.payload);
    const body = this.templateService.generateBody(notification.type, notification.payload);

    for (const recipient of notification.recipients) {
      try {
        await this.inAppService.create({
          userId: recipient.userId,
          workspaceId: recipient.workspaceId,
          type: notification.type,
          title,
          message: body,
          metadata: {
            ...notification.payload,
            deepLink: this.templateService.generateDeepLink(
              notification.type,
              notification.payload,
            ),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to create in-app notification for user ${recipient.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue with other recipients
      }
    }
  }

  /**
   * Send push notifications immediately to all recipients
   */
  private async sendImmediatePush(notification: NotificationEvent): Promise<void> {
    if (!this.pushService.isEnabled()) {
      this.logger.debug('Push notifications disabled, skipping immediate push');
      return;
    }

    for (const recipient of notification.recipients) {
      try {
        await this.sendPushToUser(recipient, notification);
      } catch (error) {
        this.logger.error(
          `Failed to send push to user ${recipient.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue with other recipients
      }
    }
  }

  /**
   * Send push notification to a single user
   */
  async sendPushToUser(
    recipient: NotificationRecipient,
    notification: NotificationEvent,
  ): Promise<void> {
    const payload = this.buildPushPayload(notification);
    await this.pushService.sendToUser(recipient.userId, payload);
  }

  /**
   * Build push notification payload from notification event
   */
  private buildPushPayload(notification: NotificationEvent): PushNotificationPayloadDto {
    const title = this.templateService.generateTitle(notification.type, notification.payload);
    const body = this.templateService.generateBody(notification.type, notification.payload);
    const url = this.templateService.generateDeepLink(notification.type, notification.payload);
    const icon = this.templateService.getIcon(notification.type, notification.payload);
    const actions = this.templateService.getActions(notification.type);

    return {
      id: uuidv4(),
      title,
      body,
      url,
      icon,
      type: notification.type,
      tag: `${notification.type}-${Date.now()}`,
      actions,
      timestamp: Date.now(),
      urgency: this.mapUrgency(notification.urgency),
    };
  }

  /**
   * Map notification urgency to push urgency enum
   */
  private mapUrgency(urgency: string): NotificationUrgency {
    switch (urgency) {
      case 'very-low':
        return NotificationUrgency.VERY_LOW;
      case 'low':
        return NotificationUrgency.LOW;
      case 'high':
        return NotificationUrgency.HIGH;
      default:
        return NotificationUrgency.NORMAL;
    }
  }

  /**
   * Send batched notifications (called by batch processor)
   */
  async sendBatchedNotifications(
    userId: string,
    workspaceId: string,
    notifications: Array<{ type: string; payload: Record<string, any>; timestamp?: number; workspaceId?: string }>,
  ): Promise<void> {
    if (!this.pushService.isEnabled()) {
      this.logger.debug('Push notifications disabled, skipping batch');
      return;
    }

    // Ensure all notifications have timestamps and workspaceId for consolidation
    const notificationsWithContext = notifications.map((n) => ({
      ...n,
      timestamp: n.timestamp || Date.now(),
      workspaceId: n.workspaceId || workspaceId,
      type: n.type as NotificationType,
    }));

    // Consolidate notifications
    const consolidated = this.batchService.consolidateBatch(notificationsWithContext);

    for (const notification of consolidated) {
      try {
        const payload = this.buildBatchPushPayload(notification);
        await this.pushService.sendToUser(userId, payload);
      } catch (error) {
        this.logger.error(
          `Failed to send batched push to user ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Check if a type string is a valid NotificationType
   */
  private isValidNotificationType(type: string): type is NotificationType {
    const validTypes: NotificationType[] = [
      'epic_completed',
      'story_completed',
      'deployment_success',
      'deployment_failed',
      'agent_error',
      'agent_message',
      'context_degraded',
      'context_critical',
    ];
    return validTypes.includes(type as NotificationType);
  }

  /**
   * Build push payload for batched/consolidated notifications
   */
  private buildBatchPushPayload(
    notification: { type: string; payload: Record<string, any> },
  ): PushNotificationPayloadDto {
    // Handle batch types (consolidated notifications)
    if (notification.type.endsWith('_batch')) {
      return {
        id: uuidv4(),
        title: notification.payload.message || 'Multiple updates',
        body: `${notification.payload.count} notifications`,
        url: '/',
        type: notification.type,
        tag: `batch-${Date.now()}`,
        timestamp: Date.now(),
        urgency: NotificationUrgency.NORMAL,
      };
    }

    // Regular notification - validate type before using with template service
    if (!this.isValidNotificationType(notification.type)) {
      this.logger.warn(`Unknown notification type: ${notification.type}, using defaults`);
      return {
        id: uuidv4(),
        title: 'Notification',
        body: notification.payload.message || '',
        url: '/',
        type: notification.type,
        tag: `unknown-${Date.now()}`,
        timestamp: Date.now(),
        urgency: NotificationUrgency.NORMAL,
      };
    }

    const validType = notification.type;
    const title = this.templateService.generateTitle(validType, notification.payload);
    const body = this.templateService.generateBody(validType, notification.payload);
    const url = this.templateService.generateDeepLink(validType, notification.payload);

    return {
      id: uuidv4(),
      title,
      body,
      url,
      type: notification.type,
      tag: `${notification.type}-${Date.now()}`,
      timestamp: Date.now(),
      urgency: NotificationUrgency.NORMAL,
    };
  }
}
