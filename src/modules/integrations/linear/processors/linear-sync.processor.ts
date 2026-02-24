/**
 * LinearSyncProcessor
 * Story 21.5: Linear Two-Way Sync (AC7)
 *
 * BullMQ processor for handling async Linear sync operations,
 * ensuring reliable delivery with retry and error tracking.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { LinearSyncService } from '../services/linear-sync.service';
import { LinearSyncJob } from '../dto/linear-integration.dto';

@Processor('linear-sync')
export class LinearSyncProcessor {
  private readonly logger = new Logger(LinearSyncProcessor.name);

  constructor(private readonly syncService: LinearSyncService) {}

  @Process('sync-story')
  async handleSyncStory(job: Job<LinearSyncJob>): Promise<unknown> {
    this.logger.log(`Processing sync-story job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  @Process('sync-from-linear')
  async handleSyncFromLinear(job: Job<LinearSyncJob>): Promise<unknown> {
    this.logger.log(`Processing sync-from-linear job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  @Process('full-sync')
  async handleFullSync(job: Job<LinearSyncJob>): Promise<unknown> {
    this.logger.log(`Processing full-sync job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  private async processJob(job: Job<LinearSyncJob>): Promise<unknown> {
    const { type, workspaceId, storyId, integrationId, linearIssueId, updatedFields } = job.data;

    try {
      switch (type) {
        case 'devos_to_linear':
          return await this.syncService.syncStoryToLinear(workspaceId, storyId!);
        case 'linear_to_devos':
          return await this.syncService.syncLinearToDevos(
            integrationId!,
            linearIssueId!,
            updatedFields || {},
          );
        case 'full_sync':
          return await this.syncService.fullSync(workspaceId);
        default:
          throw new Error(`Unknown sync job type: ${type}`);
      }
    } catch (error) {
      this.logger.error(
        `Sync job ${job.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
