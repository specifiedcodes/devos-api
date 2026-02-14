/**
 * NotificationBatchProcessor
 * Story 10.5: Notification Triggers
 *
 * BullMQ processor for flushing batched notifications.
 * Runs on a schedule (every 15 minutes by default).
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationDispatchService } from '../services/notification-dispatch.service';

/**
 * Queue name for notification batch processing
 */
export const NOTIFICATION_BATCH_QUEUE = 'notification-batch';

/**
 * Job names
 */
export const BATCH_FLUSH_JOB = 'flush';

@Processor(NOTIFICATION_BATCH_QUEUE)
export class NotificationBatchProcessor {
  private readonly logger = new Logger(NotificationBatchProcessor.name);

  constructor(
    private readonly batchService: NotificationBatchService,
    private readonly dispatchService: NotificationDispatchService,
  ) {}

  /**
   * Process batch flush job
   * Called periodically to flush all pending notification batches
   */
  @Process(BATCH_FLUSH_JOB)
  async handleFlush(job: Job): Promise<void> {
    this.logger.log('Starting notification batch flush');

    try {
      // Get all users with pending batches
      const userIds = await this.batchService.getAllPendingUserIds();

      if (userIds.length === 0) {
        this.logger.debug('No pending notification batches to flush');
        return;
      }

      this.logger.log(`Flushing batches for ${userIds.length} users`);

      let successCount = 0;
      let errorCount = 0;

      for (const userId of userIds) {
        try {
          await this.flushUserBatch(userId);
          successCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Failed to flush batch for user ${userId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      this.logger.log(
        `Batch flush complete: ${successCount} successful, ${errorCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        'Batch flush job failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Re-throw to mark job as failed
    }
  }

  /**
   * Flush batch for a single user
   */
  private async flushUserBatch(userId: string): Promise<void> {
    const notifications = await this.batchService.flushBatch(userId);

    if (notifications.length === 0) {
      return;
    }

    this.logger.debug(`Flushing ${notifications.length} notifications for user ${userId}`);

    // Group notifications by workspace to maintain workspace isolation
    const byWorkspace = new Map<string, typeof notifications>();
    for (const notification of notifications) {
      const workspaceId = notification.workspaceId || 'default';
      const existing = byWorkspace.get(workspaceId) || [];
      existing.push(notification);
      byWorkspace.set(workspaceId, existing);
    }

    // Send batched notifications for each workspace
    for (const [workspaceId, workspaceNotifications] of byWorkspace) {
      await this.dispatchService.sendBatchedNotifications(userId, workspaceId, workspaceNotifications);
    }
  }
}
