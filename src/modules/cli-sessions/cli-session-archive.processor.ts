import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CliSessionArchiveService } from './cli-session-archive.service';

/**
 * CLI Session Archive Processor
 * Story 16.3: CLI Session Archive Storage (AC4)
 *
 * BullMQ processor for CLI session archive jobs.
 * Processes three job types:
 * - archive-pending: Batch archive all pending sessions
 * - archive-single: Archive a specific session by ID
 * - cleanup-expired: Delete expired archived sessions
 */
@Processor('cli-session-archive')
export class CliSessionArchiveProcessor {
  private readonly logger = new Logger(CliSessionArchiveProcessor.name);

  constructor(
    private readonly archiveService: CliSessionArchiveService,
  ) {}

  @Process('archive-pending')
  async handleArchivePending(job: Job): Promise<any> {
    this.logger.log('Processing archive-pending job');
    const result = await this.archiveService.archivePendingSessions();
    this.logger.log(
      `Archive batch: ${result.archived} archived, ${result.failed} failed, ${result.skipped} skipped`,
    );
    return result;
  }

  @Process('archive-single')
  async handleArchiveSingle(job: Job<{ sessionId: string }>): Promise<any> {
    const { sessionId } = job.data;
    this.logger.log(`Processing archive-single job for session ${sessionId}`);

    const session = await this.archiveService.getSessionById(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found, skipping archive`);
      return { skipped: true, reason: 'Session not found' };
    }

    await this.archiveService.archiveSession(session);
    return { archived: true, sessionId };
  }

  @Process('cleanup-expired')
  async handleCleanupExpired(job: Job): Promise<any> {
    this.logger.log('Processing cleanup-expired job');
    const result = await this.archiveService.cleanupExpiredArchives();
    this.logger.log(
      `Expired cleanup: ${result.deleted} deleted, ${result.failed} failed`,
    );
    return result;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job ${job.name} (${job.id}) failed: ${error.message}`,
      error.stack,
    );
  }
}
