/**
 * SlackMessageProcessor
 * Story 16.4: Slack Notification Integration (AC7)
 *
 * BullMQ processor for async Slack message delivery with retry logic.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SlackNotificationService } from '../services/slack-notification.service';
import { NotificationEvent } from '../events/notification.events';

export const SLACK_NOTIFICATIONS_QUEUE = 'slack-notifications';

@Processor(SLACK_NOTIFICATIONS_QUEUE)
export class SlackMessageProcessor {
  private readonly logger = new Logger(SlackMessageProcessor.name);

  constructor(
    private readonly slackService: SlackNotificationService,
  ) {}

  /**
   * Process a Slack notification send job.
   * Throws on failure to trigger BullMQ retry with exponential backoff.
   */
  @Process('send-notification')
  async handleSendNotification(
    job: Job<{
      workspaceId: string;
      notification: NotificationEvent;
      attempt: number;
    }>,
  ): Promise<void> {
    const { workspaceId, notification, attempt } = job.data;

    this.logger.debug(
      `Processing Slack notification for workspace ${workspaceId}, attempt ${attempt}`,
    );

    const result = await this.slackService.sendNotification(workspaceId, notification);

    if (!result.sent) {
      // If we haven't reached max attempts, throw to trigger retry
      if (attempt < 3) {
        throw new Error(result.error || 'Slack send failed');
      }

      // Max attempts reached - log and complete (don't throw)
      this.logger.warn(
        `Slack notification failed after ${attempt} attempts for workspace ${workspaceId}: ${result.error}`,
      );
    }
  }
}
