import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PermissionAuditService } from '../services/permission-audit.service';

/**
 * Scheduled job to clean up expired permission audit events.
 * Runs daily at 3:00 AM. Retention: 2 years (730 days).
 */
@Injectable()
export class PermissionAuditCleanupJob {
  private readonly logger = new Logger(PermissionAuditCleanupJob.name);

  constructor(private readonly permissionAuditService: PermissionAuditService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    this.logger.log('Starting permission audit cleanup...');
    try {
      const deleted = await this.permissionAuditService.cleanupExpiredEvents();
      this.logger.log(`Permission audit cleanup complete: ${deleted} events removed`);
    } catch (error) {
      this.logger.error(
        `Permission audit cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
