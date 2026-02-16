/**
 * EmailMessageProcessor
 * Story 16.6: Production Email Service (AC7)
 *
 * BullMQ processor for async email delivery with retry logic.
 * Follows Slack/Discord processor patterns.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EmailNotificationService, EMAIL_NOTIFICATIONS_QUEUE } from '../services/email-notification.service';
import { EmailTemplate } from '../services/email-template.service';
import { NotificationEvent } from '../../notifications/events/notification.events';

@Processor(EMAIL_NOTIFICATIONS_QUEUE)
export class EmailMessageProcessor {
  private readonly logger = new Logger(EmailMessageProcessor.name);

  constructor(
    private readonly emailService: EmailNotificationService,
  ) {}

  /**
   * Process a notification email send job.
   * Throws on failure to trigger BullMQ retry with exponential backoff.
   */
  @Process('send-notification')
  async handleSendNotification(
    job: Job<{
      workspaceId: string;
      notification: NotificationEvent;
      recipientEmail: string;
      attempt: number;
    }>,
  ): Promise<void> {
    const { workspaceId, notification, recipientEmail, attempt } = job.data;

    this.logger.debug(
      `Processing email notification for workspace ${workspaceId} to ${recipientEmail}, attempt ${attempt}`,
    );

    const result = await this.emailService.sendNotification(workspaceId, notification, recipientEmail);

    if (!result.sent) {
      // If we haven't reached max attempts, throw to trigger retry
      if (attempt < 3) {
        throw new Error(result.error || 'Email send failed');
      }

      // Max attempts reached - log and complete (don't throw)
      this.logger.warn(
        `Email notification failed after ${attempt} attempts for workspace ${workspaceId}: ${result.error}`,
      );
    }
  }

  /**
   * Process a transactional email send job.
   * Used for welcome, password reset, etc.
   */
  @Process('send-transactional')
  async handleSendTransactional(
    job: Job<{
      to: string;
      template: EmailTemplate;
      data: Record<string, any>;
      attempt: number;
    }>,
  ): Promise<void> {
    const { to, template, data, attempt } = job.data;

    this.logger.debug(
      `Processing transactional email to ${to}, template ${template}, attempt ${attempt}`,
    );

    const result = await this.emailService.sendTransactional(to, template, data);

    if (!result.sent) {
      if (attempt < 3) {
        throw new Error(result.error || 'Transactional email send failed');
      }

      this.logger.warn(
        `Transactional email failed after ${attempt} attempts to ${to}: ${result.error}`,
      );
    }
  }

  /**
   * Process a bulk email send job.
   * Each recipient is a separate job for isolation.
   */
  @Process('send-bulk')
  async handleSendBulk(
    job: Job<{
      workspaceId: string;
      recipientEmail: string;
      template: EmailTemplate;
      data: Record<string, any>;
      attempt: number;
    }>,
  ): Promise<void> {
    const { workspaceId, recipientEmail, template, data, attempt } = job.data;

    this.logger.debug(
      `Processing bulk email for workspace ${workspaceId} to ${recipientEmail}, attempt ${attempt}`,
    );

    const result = await this.emailService.sendTransactional(recipientEmail, template, data);

    if (!result.sent) {
      if (attempt < 3) {
        throw new Error(result.error || 'Bulk email send failed');
      }

      this.logger.warn(
        `Bulk email failed after ${attempt} attempts for workspace ${workspaceId} to ${recipientEmail}: ${result.error}`,
      );
    }
  }
}
