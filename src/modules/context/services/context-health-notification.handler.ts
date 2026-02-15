/**
 * ContextHealthNotificationHandler
 * Story 12.5: Context Health Indicators UI
 *
 * Listens for `context:health_changed` events and dispatches notifications
 * when context health degrades to critical. Follows the same @OnEvent pattern
 * as NotificationTriggerService from Story 10-5.
 *
 * Notification rules:
 * - Critical: Dispatch push notification immediately with urgency 'high'
 * - Critical persisting > configured delay: Dispatch email notification
 * - Recovery from critical: Clear timer, emit recovery notification
 * - Degraded: Log warning, no notification (informational)
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationRecipientResolver } from '../../notifications/services/notification-recipient.resolver';
import { ContextHealthChangedEvent } from '../interfaces/context-health.interfaces';
import { CONTEXT_HEALTH_CHANGED_EVENT } from './context-health-event.service';

/** Default delay before sending email for sustained critical (minutes) */
const DEFAULT_CRITICAL_ALERT_DELAY_MINUTES = 60;

/** Maximum tracked projects to prevent unbounded memory growth */
const MAX_CRITICAL_TRACKED_PROJECTS = 10_000;

@Injectable()
export class ContextHealthNotificationHandler {
  private readonly logger = new Logger(ContextHealthNotificationHandler.name);

  /**
   * Tracks when each project first entered critical state.
   * Used to determine if email notification should be sent for sustained critical.
   * Bounded to MAX_CRITICAL_TRACKED_PROJECTS to prevent memory leaks.
   */
  private readonly criticalStartTimes = new Map<string, Date>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly notificationDispatchService?: NotificationDispatchService,
    @Optional() private readonly notificationRecipientResolver?: NotificationRecipientResolver,
  ) {}

  /**
   * Handle context health change events.
   * Dispatches notifications based on health transition.
   */
  @OnEvent(CONTEXT_HEALTH_CHANGED_EVENT)
  async handleHealthChanged(event: ContextHealthChangedEvent): Promise<void> {
    try {
      this.logger.log(
        `Context health changed for project ${event.projectId}: ${event.previousHealth} -> ${event.currentHealth}`,
      );

      if (event.currentHealth === 'critical') {
        await this.handleCritical(event);
      } else if (event.previousHealth === 'critical') {
        // Recovery from critical (currentHealth is healthy or degraded)
        this.handleRecovery(event);
      }
      // Degraded transitions are informational - no notification
    } catch (error) {
      this.logger.error(
        `Failed to handle context health change for project ${event.projectId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // -- Private ----------------------------------------------------------------

  /**
   * Handle transition to critical health.
   * Dispatch push notification and track critical start time.
   */
  private async handleCritical(event: ContextHealthChangedEvent): Promise<void> {
    const existingStart = this.criticalStartTimes.get(event.projectId);

    if (!existingStart) {
      // Evict oldest entry if at capacity to prevent unbounded growth
      if (this.criticalStartTimes.size >= MAX_CRITICAL_TRACKED_PROJECTS) {
        const oldestKey = this.criticalStartTimes.keys().next().value;
        if (oldestKey !== undefined) {
          this.criticalStartTimes.delete(oldestKey);
        }
      }
      // First time entering critical
      this.criticalStartTimes.set(event.projectId, new Date());
      await this.dispatchPushNotification(event);
    } else {
      // Already in critical - check if email delay has passed
      const delayMinutes = parseInt(
        this.configService.get<string>(
          'CONTEXT_HEALTH_CRITICAL_ALERT_DELAY_MINUTES',
          String(DEFAULT_CRITICAL_ALERT_DELAY_MINUTES),
        ),
        10,
      );
      const elapsedMs = Date.now() - existingStart.getTime();
      const delayMs = delayMinutes * 60 * 1000;

      if (elapsedMs >= delayMs) {
        await this.dispatchEmailNotification(event, existingStart.toISOString());
      }
    }
  }

  /**
   * Handle recovery from critical health.
   * Clear critical timer.
   */
  private handleRecovery(event: ContextHealthChangedEvent): void {
    this.criticalStartTimes.delete(event.projectId);
    this.logger.log(
      `Context health recovered for project ${event.projectId}: ${event.previousHealth} -> ${event.currentHealth}`,
    );
  }

  /**
   * Dispatch push notification for critical health.
   */
  private async dispatchPushNotification(
    event: ContextHealthChangedEvent,
  ): Promise<void> {
    if (!this.notificationDispatchService || !this.notificationRecipientResolver) {
      this.logger.warn(
        'NotificationDispatchService or NotificationRecipientResolver not available, skipping push notification',
      );
      return;
    }

    try {
      const recipients = await this.notificationRecipientResolver.forWorkspace(
        event.workspaceId,
      );

      if (recipients.length === 0) {
        this.logger.debug(
          `No recipients for context health notification in workspace ${event.workspaceId}`,
        );
        return;
      }

      await this.notificationDispatchService.dispatch({
        type: 'context_critical',
        payload: {
          projectId: event.projectId,
          workspaceId: event.workspaceId,
          issues: event.issues,
          previousHealth: event.previousHealth,
          currentHealth: event.currentHealth,
          timestamp: event.timestamp,
        },
        recipients,
        urgency: 'high',
        batchable: false,
      });

      this.logger.log(
        `Dispatched critical context health push notification for project ${event.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dispatch push notification for project ${event.projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Dispatch email notification for sustained critical health.
   */
  private async dispatchEmailNotification(
    event: ContextHealthChangedEvent,
    criticalSince: string,
  ): Promise<void> {
    if (!this.notificationDispatchService || !this.notificationRecipientResolver) {
      this.logger.warn(
        'NotificationDispatchService or NotificationRecipientResolver not available, skipping email notification',
      );
      return;
    }

    try {
      const recipients = await this.notificationRecipientResolver.forWorkspace(
        event.workspaceId,
      );

      if (recipients.length === 0) {
        return;
      }

      await this.notificationDispatchService.dispatch({
        type: 'context_critical',
        payload: {
          projectId: event.projectId,
          workspaceId: event.workspaceId,
          issues: event.issues,
          criticalSince,
          sustained: true,
          timestamp: event.timestamp,
        },
        recipients,
        urgency: 'high',
        batchable: false,
      });

      this.logger.log(
        `Dispatched sustained critical context health email notification for project ${event.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dispatch email notification for project ${event.projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
