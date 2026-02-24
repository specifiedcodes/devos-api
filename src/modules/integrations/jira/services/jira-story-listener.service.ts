/**
 * JiraStoryListenerService
 * Story 21.6: Jira Two-Way Sync (AC8)
 *
 * Service that listens for DevOS story changes and triggers outbound sync to Jira.
 * Uses NestJS EventEmitter to listen for story entity changes.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OnEvent } from '@nestjs/event-emitter';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';

export interface StoryChangedEvent {
  workspaceId: string;
  storyId: string;
  changeType: 'created' | 'updated' | 'status_changed';
}

@Injectable()
export class JiraStoryListenerService implements OnModuleInit {
  private readonly logger = new Logger(JiraStoryListenerService.name);

  constructor(
    @InjectRepository(JiraIntegration)
    private readonly integrationRepo: Repository<JiraIntegration>,
    @InjectQueue('jira-sync')
    private readonly syncQueue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('JiraStoryListenerService initialized');
  }

  /**
   * Listen for story.changed events from the EventEmitter.
   */
  @OnEvent('story.changed')
  async handleStoryChanged(payload: StoryChangedEvent): Promise<void> {
    try {
      await this.onStoryChanged(payload.workspaceId, payload.storyId, payload.changeType);
    } catch (error) {
      // Graceful error handling - don't let event listener failures propagate
      this.logger.error(
        `Failed to handle story change for story ${payload.storyId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'JiraStoryListener',
      );
    }
  }

  /**
   * Called when a DevOS story is created or updated.
   * Checks if workspace has active Jira integration and queues sync.
   */
  async onStoryChanged(
    workspaceId: string,
    storyId: string,
    changeType: 'created' | 'updated' | 'status_changed',
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId, isActive: true },
    });

    if (!integration) return;
    if (integration.syncDirection === 'jira_to_devos') return;

    await this.syncQueue.add(
      'sync-story',
      {
        type: 'devos_to_jira' as const,
        workspaceId,
        storyId,
      },
      {
        jobId: `devos-to-jira:${storyId}:${Date.now()}`,
        delay: 2000, // 2-second debounce to batch rapid changes
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(
      `Queued Jira sync for story ${storyId} (${changeType})`,
      'JiraStoryListener',
    );
  }
}
