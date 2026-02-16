/**
 * DiscordMessageProcessor
 * Story 16.5: Discord Notification Integration (AC7)
 *
 * BullMQ processor for async Discord message delivery with retry logic.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { NotificationEvent } from '../events/notification.events';

export const DISCORD_NOTIFICATIONS_QUEUE = 'discord-notifications';

@Processor(DISCORD_NOTIFICATIONS_QUEUE)
export class DiscordMessageProcessor {
  private readonly logger = new Logger(DiscordMessageProcessor.name);

  constructor(
    private readonly discordService: DiscordNotificationService,
  ) {}

  /**
   * Process a Discord notification send job.
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
      `Processing Discord notification for workspace ${workspaceId}, attempt ${attempt}`,
    );

    const result = await this.discordService.sendNotification(workspaceId, notification);

    if (!result.sent) {
      // If we haven't reached max attempts, throw to trigger retry
      if (attempt < 3) {
        throw new Error(result.error || 'Discord send failed');
      }

      // Max attempts reached - log and complete (don't throw)
      this.logger.warn(
        `Discord notification failed after ${attempt} attempts for workspace ${workspaceId}: ${result.error}`,
      );
    }
  }
}
