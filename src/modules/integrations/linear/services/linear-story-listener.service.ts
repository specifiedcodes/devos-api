/**
 * LinearStoryListenerService
 * Story 21.5: Linear Two-Way Sync (AC8)
 *
 * Service that listens for DevOS story changes and triggers outbound sync to Linear.
 * Uses NestJS EventEmitter to listen for story entity changes.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OnEvent } from '@nestjs/event-emitter';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';

export interface StoryChangedEvent {
  workspaceId: string;
  storyId: string;
  changeType: 'created' | 'updated' | 'status_changed';
}

@Injectable()
export class LinearStoryListenerService implements OnModuleInit {
  private readonly logger = new Logger(LinearStoryListenerService.name);

  constructor(
    @InjectRepository(LinearIntegration)
    private readonly integrationRepo: Repository<LinearIntegration>,
    @InjectQueue('linear-sync')
    private readonly syncQueue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('LinearStoryListenerService initialized');
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
        'LinearStoryListener',
      );
    }
  }

  /**
   * Called when a DevOS story is created or updated.
   * Checks if workspace has active Linear integration and queues sync.
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
    if (integration.syncDirection === 'linear_to_devos') return;

    await this.syncQueue.add(
      'sync-story',
      {
        type: 'devos_to_linear' as const,
        workspaceId,
        storyId,
      },
      {
        jobId: `devos-to-linear:${storyId}:${Date.now()}`,
        delay: 2000, // 2-second debounce to batch rapid changes
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(
      `Queued Linear sync for story ${storyId} (${changeType})`,
      'LinearStoryListener',
    );
  }
}
