/**
 * JiraSyncProcessor
 * Story 21.6: Jira Two-Way Sync (AC7)
 *
 * BullMQ processor for handling async Jira sync operations,
 * ensuring reliable delivery with retry and error tracking.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraSyncJob } from '../dto/jira-integration.dto';

@Processor('jira-sync')
export class JiraSyncProcessor {
  private readonly logger = new Logger(JiraSyncProcessor.name);

  constructor(private readonly syncService: JiraSyncService) {}

  @Process('sync-story')
  async handleSyncStory(job: Job<JiraSyncJob>): Promise<unknown> {
    this.logger.log(`Processing sync-story job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  @Process('sync-from-jira')
  async handleSyncFromJira(job: Job<JiraSyncJob>): Promise<unknown> {
    this.logger.log(`Processing sync-from-jira job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  @Process('full-sync')
  async handleFullSync(job: Job<JiraSyncJob>): Promise<unknown> {
    this.logger.log(`Processing full-sync job ${job.id}: type=${job.data.type}`);
    return this.processJob(job);
  }

  private async processJob(job: Job<JiraSyncJob>): Promise<unknown> {
    const { type, workspaceId, storyId, integrationId, jiraIssueId, webhookEvent } = job.data;

    try {
      switch (type) {
        case 'devos_to_jira':
          return await this.syncService.syncStoryToJira(workspaceId, storyId!);
        case 'jira_to_devos':
          return await this.syncService.syncJiraToDevos(
            integrationId!,
            jiraIssueId!,
            webhookEvent || { webhookEvent: 'jira:issue_updated' },
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
