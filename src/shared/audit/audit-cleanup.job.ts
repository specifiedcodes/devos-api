import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from './audit.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditCleanupJob {
  private readonly logger = new Logger(AuditCleanupJob.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCleanup() {
    this.logger.log('Starting audit log cleanup job');

    try {
      const retentionDays = this.configService.get<number>(
        'AUDIT_LOG_RETENTION_DAYS',
        90,
      );

      const deletedCount = await this.auditService.cleanupOldLogs(
        retentionDays,
      );

      this.logger.log(
        `Audit log cleanup completed. Deleted ${deletedCount} logs older than ${retentionDays} days`,
      );
    } catch (error) {
      this.logger.error(
        `Audit log cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
