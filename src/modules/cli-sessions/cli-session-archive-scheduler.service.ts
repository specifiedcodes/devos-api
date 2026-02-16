import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';

/**
 * CLI Session Archive Scheduler Service
 * Story 16.3: CLI Session Archive Storage (AC5)
 *
 * Sets up recurring BullMQ jobs for:
 * - archive-pending: Batch archive sessions at configurable interval (default: every 5 minutes)
 * - cleanup-expired: Delete expired archives daily at 4 AM
 *
 * Also provides enqueueSessionArchive() for immediate archival on session end.
 */
@Injectable()
export class CliSessionArchiveSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CliSessionArchiveSchedulerService.name);
  private readonly intervalMinutes: number;

  constructor(
    @InjectQueue('cli-session-archive')
    private readonly archiveQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.intervalMinutes = parseInt(
      this.configService.get('CLI_SESSION_ARCHIVE_INTERVAL_MINUTES', '5'),
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.setupRecurringJobs();
  }

  private async setupRecurringJobs(): Promise<void> {
    // Clean existing repeatable jobs to prevent duplicates on restart
    const existingJobs = await this.archiveQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await this.archiveQueue.removeRepeatableByKey(job.key);
    }

    // Archive pending sessions at configurable interval
    const intervalMs = this.intervalMinutes * 60 * 1000;
    await this.archiveQueue.add(
      'archive-pending',
      {},
      {
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log(`Registered archive-pending scheduler (every ${this.intervalMinutes} minutes)`);

    // Cleanup expired archives daily at 4 AM
    await this.archiveQueue.add(
      'cleanup-expired',
      {},
      {
        repeat: { cron: '0 4 * * *' }, // 4:00 AM daily
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log('Registered cleanup-expired scheduler (daily at 4 AM)');
  }

  /**
   * Enqueue a single session for immediate archival (called on session end)
   */
  async enqueueSessionArchive(sessionId: string): Promise<void> {
    await this.archiveQueue.add(
      'archive-single',
      { sessionId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.debug(`Enqueued archive for session ${sessionId}`);
  }
}
