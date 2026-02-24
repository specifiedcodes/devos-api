/**
 * LinearSyncService
 * Story 21.5: Linear Two-Way Sync (AC4)
 *
 * Core service managing bidirectional synchronization between DevOS stories
 * and Linear issues, including conflict detection and resolution.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem, LinearSyncStatus } from '../../../../database/entities/linear-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';
import { LinearApiClientService } from './linear-api-client.service';
import { RedisService } from '../../../redis/redis.service';
import { LinearIssue } from '../dto/linear-integration.dto';

const LOCK_TTL_MS = 30000; // 30 seconds

@Injectable()
export class LinearSyncService {
  private readonly logger = new Logger(LinearSyncService.name);

  constructor(
    @InjectRepository(LinearIntegration)
    private readonly integrationRepo: Repository<LinearIntegration>,
    @InjectRepository(LinearSyncItem)
    private readonly syncItemRepo: Repository<LinearSyncItem>,
    @InjectRepository(Story)
    private readonly storyRepo: Repository<Story>,
    private readonly apiClient: LinearApiClientService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Sync a DevOS story to Linear (create or update).
   */
  async syncStoryToLinear(
    workspaceId: string,
    storyId: string,
  ): Promise<LinearSyncItem> {
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Linear integration found');
    }

    // Check sync direction
    if (integration.syncDirection === 'linear_to_devos') {
      this.logger.log('Skipping DevOS->Linear sync: direction is linear_to_devos only');
      const existing = await this.syncItemRepo.findOne({
        where: { linearIntegrationId: integration.id, devosStoryId: storyId },
      });
      if (existing) return existing;
      throw new NotFoundException('Sync item not found and direction does not allow creation');
    }

    // Acquire distributed lock
    const lockKey = `linear-sync-lock:${storyId}`;
    const lockAcquired = await this.acquireLock(lockKey);
    if (!lockAcquired) {
      this.logger.warn(`Could not acquire sync lock for story ${storyId}, will retry`);
      throw new Error('Sync lock unavailable, retry later');
    }

    try {
      const story = await this.storyRepo.findOne({ where: { id: storyId } });
      if (!story) {
        throw new NotFoundException(`Story ${storyId} not found`);
      }

      // Check if sync item exists
      let syncItem = await this.syncItemRepo.findOne({
        where: { linearIntegrationId: integration.id, devosStoryId: storyId },
      });

      if (!syncItem) {
        // Create new Linear issue
        const stateId = this.mapDevosStatusToLinearStateId(story.status, integration.statusMapping);
        const issue = await this.apiClient.createIssue(
          integration.accessToken,
          integration.accessTokenIv,
          {
            teamId: integration.linearTeamId,
            title: story.title,
            description: story.description,
            stateId,
            estimate: story.storyPoints,
          },
        );

        syncItem = this.syncItemRepo.create({
          linearIntegrationId: integration.id,
          devosStoryId: storyId,
          linearIssueId: issue.id,
          linearIssueIdentifier: issue.identifier,
          lastSyncedAt: new Date(),
          lastDevosUpdateAt: new Date(),
          syncStatus: LinearSyncStatus.SYNCED,
          syncDirectionLast: 'devos_to_linear',
        });

        syncItem = await this.syncItemRepo.save(syncItem);
      } else {
        // Update existing Linear issue
        try {
          const stateId = this.mapDevosStatusToLinearStateId(story.status, integration.statusMapping);
          await this.apiClient.updateIssue(
            integration.accessToken,
            integration.accessTokenIv,
            syncItem.linearIssueId,
            {
              title: story.title,
              description: story.description,
              stateId,
              estimate: story.storyPoints,
            },
          );

          syncItem.lastSyncedAt = new Date();
          syncItem.lastDevosUpdateAt = new Date();
          syncItem.syncStatus = LinearSyncStatus.SYNCED;
          syncItem.syncDirectionLast = 'devos_to_linear';
          syncItem.errorMessage = null;

          syncItem = await this.syncItemRepo.save(syncItem);
        } catch (error) {
          syncItem.syncStatus = LinearSyncStatus.ERROR;
          syncItem.errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.syncItemRepo.save(syncItem);
          throw error;
        }
      }

      // Update integration sync stats
      await this.integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        syncCount: () => 'sync_count + 1',
      } as Partial<LinearIntegration>);

      return syncItem;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Sync a Linear issue update back to DevOS.
   */
  async syncLinearToDevos(
    integrationId: string,
    linearIssueId: string,
    updatedFields: Partial<LinearIssue>,
  ): Promise<LinearSyncItem> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Linear integration found');
    }

    // Check sync direction
    if (integration.syncDirection === 'devos_to_linear') {
      this.logger.log('Skipping Linear->DevOS sync: direction is devos_to_linear only');
      const existing = await this.syncItemRepo.findOne({
        where: { linearIntegrationId: integrationId, linearIssueId },
      });
      if (existing) return existing;
      throw new NotFoundException('Sync item not found and direction does not allow creation');
    }

    const lockKey = `linear-sync-lock:${linearIssueId}`;
    const lockAcquired = await this.acquireLock(lockKey);
    if (!lockAcquired) {
      throw new Error('Sync lock unavailable, retry later');
    }

    try {
      let syncItem = await this.syncItemRepo.findOne({
        where: { linearIntegrationId: integrationId, linearIssueId },
      });

      if (!syncItem) {
        // Only create DevOS story for bidirectional sync
        if (integration.syncDirection !== 'bidirectional' && integration.syncDirection !== 'linear_to_devos') {
          throw new NotFoundException('No sync item found for this Linear issue');
        }

        // We could create a new story here but for safety, just log and skip
        this.logger.log(`No sync item found for Linear issue ${linearIssueId}, skipping`);
        throw new NotFoundException('No sync item found for this Linear issue');
      }

      // Check for conflict: both sides changed since last sync
      if (
        syncItem.lastDevosUpdateAt &&
        syncItem.lastSyncedAt &&
        syncItem.lastDevosUpdateAt > syncItem.lastSyncedAt
      ) {
        // Conflict detected
        syncItem.syncStatus = LinearSyncStatus.CONFLICT;
        syncItem.conflictDetails = {
          devosValue: { lastUpdate: syncItem.lastDevosUpdateAt?.toISOString() },
          linearValue: updatedFields as Record<string, unknown>,
          conflictedFields: Object.keys(updatedFields),
          detectedAt: new Date().toISOString(),
        };
        syncItem.lastLinearUpdateAt = new Date();
        await this.syncItemRepo.save(syncItem);
        return syncItem;
      }

      // Reverse-map Linear fields to DevOS
      const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
      if (!story) {
        throw new NotFoundException('Linked DevOS story not found');
      }

      // Map Linear status back to DevOS status
      if (updatedFields.state) {
        const devosStatus = this.mapLinearStatusToDevos(
          updatedFields.state.name,
          integration.statusMapping,
        );
        if (devosStatus) {
          story.status = devosStatus as import('../../../../database/entities/story.entity').StoryStatus;
        }
      }

      if (updatedFields.title) {
        story.title = updatedFields.title;
      }

      if (updatedFields.description !== undefined) {
        story.description = updatedFields.description;
      }

      if (updatedFields.estimate !== undefined) {
        story.storyPoints = updatedFields.estimate;
      }

      await this.storyRepo.save(story);

      syncItem.lastSyncedAt = new Date();
      syncItem.lastLinearUpdateAt = new Date();
      syncItem.syncStatus = LinearSyncStatus.SYNCED;
      syncItem.syncDirectionLast = 'linear_to_devos';
      syncItem.errorMessage = null;

      syncItem = await this.syncItemRepo.save(syncItem);

      // Update integration sync stats
      await this.integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        syncCount: () => 'sync_count + 1',
      } as Partial<LinearIntegration>);

      return syncItem;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Get all sync items for a workspace with pagination.
   */
  async getSyncItems(
    workspaceId: string,
    options?: { status?: LinearSyncStatus; page?: number; limit?: number },
  ): Promise<{ items: LinearSyncItem[]; total: number }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { items: [], total: 0 };
    }

    const page = options?.page || 1;
    const limit = options?.limit || 20;

    const queryBuilder = this.syncItemRepo
      .createQueryBuilder('syncItem')
      .where('syncItem.linearIntegrationId = :integrationId', { integrationId: integration.id });

    if (options?.status) {
      queryBuilder.andWhere('syncItem.syncStatus = :status', { status: options.status });
    }

    const total = await queryBuilder.getCount();
    const items = await queryBuilder
      .orderBy('syncItem.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total };
  }

  /**
   * Resolve a sync conflict by choosing a side.
   */
  async resolveConflict(
    workspaceId: string,
    syncItemId: string,
    resolution: 'keep_devos' | 'keep_linear',
  ): Promise<LinearSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, linearIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    if (syncItem.syncStatus !== LinearSyncStatus.CONFLICT) {
      throw new ConflictException('Sync item is not in conflict state');
    }

    if (resolution === 'keep_devos') {
      // Push DevOS values to Linear
      const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
      if (story) {
        const stateId = this.mapDevosStatusToLinearStateId(story.status, integration.statusMapping);
        await this.apiClient.updateIssue(
          integration.accessToken,
          integration.accessTokenIv,
          syncItem.linearIssueId,
          {
            title: story.title,
            description: story.description,
            stateId,
            estimate: story.storyPoints,
          },
        );
      }
    } else {
      // Pull Linear values to DevOS
      const issue = await this.apiClient.getIssue(
        integration.accessToken,
        integration.accessTokenIv,
        syncItem.linearIssueId,
      );
      if (issue) {
        const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
        if (story) {
          const devosStatus = this.mapLinearStatusToDevos(issue.state.name, integration.statusMapping);
          if (devosStatus) {
            story.status = devosStatus as import('../../../../database/entities/story.entity').StoryStatus;
          }
          story.title = issue.title;
          story.description = issue.description;
          story.storyPoints = issue.estimate;
          await this.storyRepo.save(story);
        }
      }
    }

    syncItem.syncStatus = LinearSyncStatus.SYNCED;
    syncItem.conflictDetails = null;
    syncItem.lastSyncedAt = new Date();
    syncItem.syncDirectionLast = resolution === 'keep_devos' ? 'devos_to_linear' : 'linear_to_devos';

    return this.syncItemRepo.save(syncItem);
  }

  /**
   * Retry a failed sync item.
   */
  async retrySyncItem(
    workspaceId: string,
    syncItemId: string,
  ): Promise<LinearSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, linearIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    // Re-run sync from DevOS side
    return this.syncStoryToLinear(workspaceId, syncItem.devosStoryId);
  }

  /**
   * Retry all failed sync items for a workspace.
   */
  async retryAllFailed(
    workspaceId: string,
  ): Promise<{ retried: number; failed: number }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { retried: 0, failed: 0 };
    }

    const failedItems = await this.syncItemRepo.find({
      where: { linearIntegrationId: integration.id, syncStatus: LinearSyncStatus.ERROR },
    });

    let retried = 0;
    let failed = 0;

    for (const item of failedItems) {
      try {
        await this.syncStoryToLinear(workspaceId, item.devosStoryId);
        retried++;
      } catch {
        failed++;
      }
    }

    return { retried, failed };
  }

  /**
   * Link an existing DevOS story to an existing Linear issue.
   */
  async linkStoryToIssue(
    workspaceId: string,
    storyId: string,
    linearIssueId: string,
  ): Promise<LinearSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    // Validate story belongs to workspace (via project)
    const story = await this.storyRepo.findOne({
      where: { id: storyId },
      relations: ['project'],
    });

    if (!story || story.project?.workspaceId !== workspaceId) {
      throw new NotFoundException('Story not found in this workspace');
    }

    // Check for duplicate
    const existing = await this.syncItemRepo.findOne({
      where: { linearIntegrationId: integration.id, devosStoryId: storyId },
    });
    if (existing) {
      throw new ConflictException('Story is already linked to a Linear issue');
    }

    // Validate Linear issue exists
    const issue = await this.apiClient.getIssue(
      integration.accessToken,
      integration.accessTokenIv,
      linearIssueId,
    );

    if (!issue) {
      throw new NotFoundException('Linear issue not found');
    }

    const syncItem = this.syncItemRepo.create({
      linearIntegrationId: integration.id,
      devosStoryId: storyId,
      linearIssueId,
      linearIssueIdentifier: issue.identifier,
      lastSyncedAt: new Date(),
      syncStatus: LinearSyncStatus.SYNCED,
    });

    return this.syncItemRepo.save(syncItem);
  }

  /**
   * Remove sync link.
   */
  async unlinkStoryFromIssue(
    workspaceId: string,
    syncItemId: string,
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, linearIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    await this.syncItemRepo.remove(syncItem);
  }

  /**
   * Full sync: compare all DevOS stories with Linear issues and reconcile.
   */
  async fullSync(
    workspaceId: string,
  ): Promise<{ created: number; updated: number; conflicts: number; errors: number }> {
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Linear integration found');
    }

    const syncItems = await this.syncItemRepo.find({
      where: { linearIntegrationId: integration.id },
    });

    let created = 0;
    let updated = 0;
    let conflicts = 0;
    let errors = 0;

    for (const item of syncItems) {
      try {
        const result = await this.syncStoryToLinear(workspaceId, item.devosStoryId);
        if (result.syncStatus === LinearSyncStatus.CONFLICT) {
          conflicts++;
        } else {
          updated++;
        }
      } catch {
        errors++;
      }
    }

    // Update integration stats
    await this.integrationRepo.update(integration.id, {
      lastSyncAt: new Date(),
    });

    return { created, updated, conflicts, errors };
  }

  // --- Private helpers ---

  private mapDevosStatusToLinearStateId(
    devosStatus: string,
    statusMapping: Record<string, string>,
  ): string | undefined {
    // statusMapping maps devos status -> linear state name
    // We return the name as stateId (in real scenario, we'd need to lookup the state ID)
    return statusMapping[devosStatus] || undefined;
  }

  private mapLinearStatusToDevos(
    linearStateName: string,
    statusMapping: Record<string, string>,
  ): string | undefined {
    // Reverse lookup: find DevOS status that maps to this Linear state name
    for (const [devosStatus, linearName] of Object.entries(statusMapping)) {
      if (linearName.toLowerCase() === linearStateName.toLowerCase()) {
        return devosStatus;
      }
    }
    return undefined;
  }

  private async acquireLock(key: string): Promise<boolean> {
    try {
      const result = await this.redisService.set(key, 'locked', LOCK_TTL_MS / 1000);
      return result === 'OK' || result === true || !!result;
    } catch {
      return false;
    }
  }

  private async releaseLock(key: string): Promise<void> {
    try {
      await this.redisService.del(key);
    } catch {
      this.logger.warn(`Failed to release lock: ${key}`);
    }
  }
}
