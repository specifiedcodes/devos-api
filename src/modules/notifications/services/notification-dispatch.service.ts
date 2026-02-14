/**
 * NotificationDispatchService
 * Story 10.5: Notification Triggers
 *
 * Dispatches notifications to both push and in-app channels.
 * Routes urgent notifications immediately, queues batchable ones.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { NotificationBatchService } from './notification-batch.service';
import { NotificationTemplateService } from './notification-template.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { PushNotificationPayloadDto, NotificationUrgency } from '../../push/push.dto';
import { NotificationEvent, NotificationRecipient, NotificationType } from '../events/notification.events';

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly pushService: PushNotificationService,
    private readonly inAppService: NotificationService,
    private readonly batchService: NotificationBatchService,
    private readonly templateService: NotificationTemplateService,
  ) {}

  /**
   * Dispatch notification to all recipients via push and in-app channels
   */
  async dispatch(notification: NotificationEvent): Promise<void> {
    this.logger.log(
      `Dispatching ${notification.type} to ${notification.recipients.length} recipients`,
    );

    // Create in-app notifications for all recipients
    await this.createInAppNotifications(notification);

    // Handle push notifications based on urgency
    if (this.batchService.isImmediateNotification(notification)) {
      // Send push immediately for urgent notifications
      await this.sendImmediatePush(notification);
    } else {
      // Queue for batched delivery
      await this.batchService.queueNotification(notification);
    }
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
