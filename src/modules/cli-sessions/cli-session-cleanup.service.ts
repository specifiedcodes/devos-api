import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CliSessionsService } from './cli-sessions.service';

/**
 * CLI Session Cleanup Service
 * Story 8.5: CLI Session History and Replay
 *
 * Runs scheduled cleanup to enforce 30-day retention policy
 */
@Injectable()
export class CliSessionCleanupService {
  private readonly logger = new Logger(CliSessionCleanupService.name);

  constructor(private readonly cliSessionsService: CliSessionsService) {}

  /**
   * Daily cleanup job at 3 AM
   * Deletes CLI sessions older than 30 days
   */
  @Cron('0 3 * * *') // Run at 3:00 AM daily
  async handleCleanup(): Promise<void> {
    this.logger.log('Starting CLI session cleanup job');

    try {
      const deletedCount = await this.cliSessionsService.cleanupOldSessions();
      this.logger.log(`CLI session cleanup completed. Deleted ${deletedCount} sessions.`);
    } catch (error) {
      this.logger.error('CLI session cleanup failed', error);
    }
  }

  /**
   * Manual cleanup trigger (for testing/admin purposes)
   */
  async triggerCleanup(): Promise<number> {
    this.logger.log('Manual CLI session cleanup triggered');
    return this.cliSessionsService.cleanupOldSessions();
  }
}
