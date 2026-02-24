/**
 * JiraSyncService
 * Story 21.6: Jira Two-Way Sync (AC4)
 *
 * Core service managing bidirectional synchronization between DevOS stories
 * and Jira issues, including conflict detection, resolution, and Jira workflow transition handling.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem, JiraSyncStatus } from '../../../../database/entities/jira-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';
import { JiraApiClientService } from './jira-api-client.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraIssue, JiraWebhookEvent } from '../dto/jira-integration.dto';

const LOCK_TTL_MS = 30000; // 30 seconds

@Injectable()
export class JiraSyncService {
  private readonly logger = new Logger(JiraSyncService.name);

  constructor(
    @InjectRepository(JiraIntegration)
    private readonly integrationRepo: Repository<JiraIntegration>,
    @InjectRepository(JiraSyncItem)
    private readonly syncItemRepo: Repository<JiraSyncItem>,
    @InjectRepository(Story)
    private readonly storyRepo: Repository<Story>,
    private readonly apiClient: JiraApiClientService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Sync a DevOS story to Jira (create or update).
   */
  async syncStoryToJira(
    workspaceId: string,
    storyId: string,
  ): Promise<JiraSyncItem> {
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Jira integration found');
    }

    // Check sync direction
    if (integration.syncDirection === 'jira_to_devos') {
      this.logger.log('Skipping DevOS->Jira sync: direction is jira_to_devos only');
      const existing = await this.syncItemRepo.findOne({
        where: { jiraIntegrationId: integration.id, devosStoryId: storyId },
      });
      if (existing) return existing;
      throw new NotFoundException('Sync item not found and direction does not allow creation');
    }

    // Acquire distributed lock
    const lockKey = `jira-sync-lock:${storyId}`;
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
        where: { jiraIntegrationId: integration.id, devosStoryId: storyId },
      });

      if (!syncItem) {
        // Create new Jira issue
        const description = this.convertToAdf(story.description || '');
        const issue = await this.apiClient.createIssue(integration, {
          projectKey: integration.jiraProjectKey,
          issueType: integration.issueType,
          summary: story.title,
          description: JSON.stringify(description),
        });

        // Transition to correct status if needed
        const targetStatus = integration.statusMapping[story.status];
        if (targetStatus) {
          const transition = await this.findTransitionForStatus(integration, issue.key, targetStatus);
          if (transition) {
            await this.apiClient.transitionIssue(integration, issue.key, transition.transitionId);
          }
        }

        syncItem = this.syncItemRepo.create({
          jiraIntegrationId: integration.id,
          devosStoryId: storyId,
          jiraIssueKey: issue.key,
          jiraIssueId: issue.id,
          jiraIssueType: integration.issueType,
          lastSyncedAt: new Date(),
          lastDevosUpdateAt: new Date(),
          syncStatus: JiraSyncStatus.SYNCED,
          syncDirectionLast: 'devos_to_jira',
        });

        syncItem = await this.syncItemRepo.save(syncItem);
      } else {
        // Update existing Jira issue
        try {
          const description = this.convertToAdf(story.description || '');
          await this.apiClient.updateIssue(integration, syncItem.jiraIssueKey, {
            summary: story.title,
            description: JSON.stringify(description),
          });

          // Handle status change via workflow transitions
          const targetStatus = integration.statusMapping[story.status];
          if (targetStatus) {
            const transition = await this.findTransitionForStatus(
              integration,
              syncItem.jiraIssueKey,
              targetStatus,
            );
            if (transition) {
              await this.apiClient.transitionIssue(
                integration,
                syncItem.jiraIssueKey,
                transition.transitionId,
              );
            } else {
              this.logger.warn(
                `No transition found for status "${targetStatus}" on issue ${syncItem.jiraIssueKey} - marking as conflict`,
              );
              syncItem.syncStatus = JiraSyncStatus.CONFLICT;
              syncItem.conflictDetails = {
                devosValue: { status: story.status },
                jiraValue: { targetStatus },
                conflictedFields: ['status'],
                detectedAt: new Date().toISOString(),
              };
              await this.syncItemRepo.save(syncItem);
              return syncItem;
            }
          }

          syncItem.lastSyncedAt = new Date();
          syncItem.lastDevosUpdateAt = new Date();
          syncItem.syncStatus = JiraSyncStatus.SYNCED;
          syncItem.syncDirectionLast = 'devos_to_jira';
          syncItem.errorMessage = null;

          syncItem = await this.syncItemRepo.save(syncItem);
        } catch (error) {
          syncItem.syncStatus = JiraSyncStatus.ERROR;
          syncItem.errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.syncItemRepo.save(syncItem);
          throw error;
        }
      }

      // Update integration sync stats
      await this.integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        syncCount: () => 'sync_count + 1',
      } as Partial<JiraIntegration>);

      return syncItem;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Sync a Jira issue update back to DevOS.
   */
  async syncJiraToDevos(
    integrationId: string,
    jiraIssueId: string,
    webhookEvent: JiraWebhookEvent,
  ): Promise<JiraSyncItem> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Jira integration found');
    }

    // Check sync direction
    if (integration.syncDirection === 'devos_to_jira') {
      this.logger.log('Skipping Jira->DevOS sync: direction is devos_to_jira only');
      const existing = await this.syncItemRepo.findOne({
        where: { jiraIntegrationId: integrationId, jiraIssueId },
      });
      if (existing) return existing;
      throw new NotFoundException('Sync item not found and direction does not allow creation');
    }

    const lockKey = `jira-sync-lock:${jiraIssueId}`;
    const lockAcquired = await this.acquireLock(lockKey);
    if (!lockAcquired) {
      throw new Error('Sync lock unavailable, retry later');
    }

    try {
      let syncItem = await this.syncItemRepo.findOne({
        where: { jiraIntegrationId: integrationId, jiraIssueId },
      });

      if (!syncItem) {
        // Only create DevOS story for bidirectional sync
        if (integration.syncDirection !== 'bidirectional' && integration.syncDirection !== 'jira_to_devos') {
          throw new NotFoundException('No sync item found for this Jira issue');
        }

        this.logger.log(`No sync item found for Jira issue ${jiraIssueId}, skipping`);
        throw new NotFoundException('No sync item found for this Jira issue');
      }

      // Check for conflict: both sides changed since last sync
      if (
        syncItem.lastDevosUpdateAt &&
        syncItem.lastSyncedAt &&
        syncItem.lastDevosUpdateAt > syncItem.lastSyncedAt
      ) {
        syncItem.syncStatus = JiraSyncStatus.CONFLICT;
        syncItem.conflictDetails = {
          devosValue: { lastUpdate: syncItem.lastDevosUpdateAt?.toISOString() },
          jiraValue: (webhookEvent.issue?.fields || {}) as Record<string, unknown>,
          conflictedFields: webhookEvent.changelog?.items.map((i) => i.field) || ['unknown'],
          detectedAt: new Date().toISOString(),
        };
        syncItem.lastJiraUpdateAt = new Date();
        await this.syncItemRepo.save(syncItem);
        return syncItem;
      }

      // Reverse-map Jira fields to DevOS
      const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
      if (!story) {
        throw new NotFoundException('Linked DevOS story not found');
      }

      const issue = webhookEvent.issue;
      if (issue) {
        // Map Jira status back to DevOS status
        if (issue.fields.status) {
          const devosStatus = this.mapJiraStatusToDevos(
            issue.fields.status.name,
            integration.statusMapping,
          );
          if (devosStatus) {
            story.status = devosStatus as import('../../../../database/entities/story.entity').StoryStatus;
          }
        }

        if (issue.fields.summary) {
          story.title = issue.fields.summary;
        }

        if (issue.fields.description !== undefined) {
          story.description = this.convertFromAdf(
            issue.fields.description as Record<string, unknown>,
          );
        }
      }

      await this.storyRepo.save(story);

      syncItem.lastSyncedAt = new Date();
      syncItem.lastJiraUpdateAt = new Date();
      syncItem.syncStatus = JiraSyncStatus.SYNCED;
      syncItem.syncDirectionLast = 'jira_to_devos';
      syncItem.errorMessage = null;

      syncItem = await this.syncItemRepo.save(syncItem);

      // Update integration sync stats
      await this.integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        syncCount: () => 'sync_count + 1',
      } as Partial<JiraIntegration>);

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
    options?: { status?: JiraSyncStatus; page?: number; limit?: number },
  ): Promise<{ items: JiraSyncItem[]; total: number }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { items: [], total: 0 };
    }

    const page = options?.page || 1;
    const limit = options?.limit || 20;

    const queryBuilder = this.syncItemRepo
      .createQueryBuilder('syncItem')
      .where('syncItem.jiraIntegrationId = :integrationId', { integrationId: integration.id });

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
    resolution: 'keep_devos' | 'keep_jira',
  ): Promise<JiraSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, jiraIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    if (syncItem.syncStatus !== JiraSyncStatus.CONFLICT) {
      throw new ConflictException('Sync item is not in conflict state');
    }

    if (resolution === 'keep_devos') {
      // Push DevOS values to Jira
      const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
      if (story) {
        const description = this.convertToAdf(story.description || '');
        await this.apiClient.updateIssue(integration, syncItem.jiraIssueKey, {
          summary: story.title,
          description: JSON.stringify(description),
        });

        const targetStatus = integration.statusMapping[story.status];
        if (targetStatus) {
          const transition = await this.findTransitionForStatus(
            integration,
            syncItem.jiraIssueKey,
            targetStatus,
          );
          if (transition) {
            await this.apiClient.transitionIssue(integration, syncItem.jiraIssueKey, transition.transitionId);
          }
        }
      }
    } else {
      // Pull Jira values to DevOS
      const issue = await this.apiClient.getIssue(integration, syncItem.jiraIssueKey);
      if (issue) {
        const story = await this.storyRepo.findOne({ where: { id: syncItem.devosStoryId } });
        if (story) {
          const devosStatus = this.mapJiraStatusToDevos(
            issue.fields.status.name,
            integration.statusMapping,
          );
          if (devosStatus) {
            story.status = devosStatus as import('../../../../database/entities/story.entity').StoryStatus;
          }
          story.title = issue.fields.summary;
          if (issue.fields.description) {
            story.description = this.convertFromAdf(
              issue.fields.description as Record<string, unknown>,
            );
          }
          await this.storyRepo.save(story);
        }
      }
    }

    syncItem.syncStatus = JiraSyncStatus.SYNCED;
    syncItem.conflictDetails = null;
    syncItem.lastSyncedAt = new Date();
    syncItem.syncDirectionLast = resolution === 'keep_devos' ? 'devos_to_jira' : 'jira_to_devos';

    return this.syncItemRepo.save(syncItem);
  }

  /**
   * Retry a failed sync item.
   */
  async retrySyncItem(
    workspaceId: string,
    syncItemId: string,
  ): Promise<JiraSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, jiraIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    return this.syncStoryToJira(workspaceId, syncItem.devosStoryId);
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
      where: { jiraIntegrationId: integration.id, syncStatus: JiraSyncStatus.ERROR },
    });

    let retried = 0;
    let failed = 0;

    for (const item of failedItems) {
      try {
        await this.syncStoryToJira(workspaceId, item.devosStoryId);
        retried++;
      } catch {
        failed++;
      }
    }

    return { retried, failed };
  }

  /**
   * Link an existing DevOS story to an existing Jira issue by key.
   */
  async linkStoryToIssue(
    workspaceId: string,
    storyId: string,
    jiraIssueKey: string,
  ): Promise<JiraSyncItem> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
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
      where: { jiraIntegrationId: integration.id, devosStoryId: storyId },
    });
    if (existing) {
      throw new ConflictException('Story is already linked to a Jira issue');
    }

    // Validate Jira issue exists
    const issue = await this.apiClient.getIssue(integration, jiraIssueKey);
    if (!issue) {
      throw new NotFoundException('Jira issue not found');
    }

    const syncItem = this.syncItemRepo.create({
      jiraIntegrationId: integration.id,
      devosStoryId: storyId,
      jiraIssueKey: issue.key,
      jiraIssueId: issue.id,
      jiraIssueType: issue.fields.issuetype?.name,
      lastSyncedAt: new Date(),
      syncStatus: JiraSyncStatus.SYNCED,
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
      throw new NotFoundException('No Jira integration found');
    }

    const syncItem = await this.syncItemRepo.findOne({
      where: { id: syncItemId, jiraIntegrationId: integration.id },
    });

    if (!syncItem) {
      throw new NotFoundException('Sync item not found');
    }

    await this.syncItemRepo.remove(syncItem);
  }

  /**
   * Full sync: re-sync all already-linked stories with Jira issues.
   */
  async fullSync(
    workspaceId: string,
  ): Promise<{ created: number; updated: number; conflicts: number; errors: number }> {
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId, isActive: true },
    });

    if (!integration) {
      throw new NotFoundException('No active Jira integration found');
    }

    const syncItems = await this.syncItemRepo.find({
      where: { jiraIntegrationId: integration.id },
    });

    let created = 0;
    let updated = 0;
    let conflicts = 0;
    let errors = 0;

    for (const item of syncItems) {
      try {
        const result = await this.syncStoryToJira(workspaceId, item.devosStoryId);
        if (result.syncStatus === JiraSyncStatus.CONFLICT) {
          conflicts++;
        } else {
          updated++;
        }
      } catch {
        errors++;
      }
    }

    await this.integrationRepo.update(integration.id, {
      lastSyncAt: new Date(),
    });

    return { created, updated, conflicts, errors };
  }

  /**
   * Convert plain text to Atlassian Document Format (ADF) JSON.
   */
  convertToAdf(text: string): Record<string, unknown> {
    if (!text) {
      return {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '' }],
          },
        ],
      };
    }

    const lines = text.split('\n');
    const content: Array<Record<string, unknown>> = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang: string | undefined;

    for (const line of lines) {
      if (line.startsWith('```') && !inCodeBlock) {
        // Opening code fence
        inCodeBlock = true;
        codeBlockLines = [];
        codeBlockLang = line.slice(3).trim() || undefined;
      } else if (line.startsWith('```') && inCodeBlock) {
        // Closing code fence
        inCodeBlock = false;
        const attrs: Record<string, unknown> = {};
        if (codeBlockLang) {
          attrs.language = codeBlockLang;
        }
        content.push({
          type: 'codeBlock',
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
          content: codeBlockLines.length > 0
            ? [{ type: 'text', text: codeBlockLines.join('\n') }]
            : [],
        });
        codeBlockLines = [];
        codeBlockLang = undefined;
      } else if (inCodeBlock) {
        codeBlockLines.push(line);
      } else if (line.startsWith('# ')) {
        content.push({
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: line.slice(2) }],
        });
      } else if (line.startsWith('## ')) {
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: line.slice(3) }],
        });
      } else if (line.startsWith('### ')) {
        content.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: line.slice(4) }],
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        content.push({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: line.slice(2) }],
                },
              ],
            },
          ],
        });
      } else {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        });
      }
    }

    // Handle unclosed code block
    if (inCodeBlock && codeBlockLines.length > 0) {
      const attrs: Record<string, unknown> = {};
      if (codeBlockLang) {
        attrs.language = codeBlockLang;
      }
      content.push({
        type: 'codeBlock',
        ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
        content: [{ type: 'text', text: codeBlockLines.join('\n') }],
      });
    }

    return {
      version: 1,
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    };
  }

  /**
   * Convert Atlassian Document Format (ADF) JSON to plain text.
   */
  convertFromAdf(adf: Record<string, unknown>): string {
    if (!adf || !adf.content) return '';

    const extractText = (node: Record<string, unknown>): string => {
      if (!node) return '';

      if (node.type === 'text') {
        return (node.text as string) || '';
      }

      if (node.type === 'heading') {
        const level = (node.attrs as Record<string, unknown>)?.level || 1;
        const prefix = '#'.repeat(level as number) + ' ';
        const children = (node.content as Array<Record<string, unknown>>) || [];
        return prefix + children.map(extractText).join('');
      }

      if (node.type === 'bulletList' || node.type === 'orderedList') {
        const children = (node.content as Array<Record<string, unknown>>) || [];
        return children.map((child) => {
          const text = extractText(child);
          return `- ${text}`;
        }).join('\n');
      }

      if (node.type === 'listItem') {
        const children = (node.content as Array<Record<string, unknown>>) || [];
        return children.map(extractText).join('');
      }

      if (node.type === 'codeBlock') {
        const children = (node.content as Array<Record<string, unknown>>) || [];
        return '```\n' + children.map(extractText).join('') + '\n```';
      }

      // Paragraph and other containers
      const children = (node.content as Array<Record<string, unknown>>) || [];
      return children.map(extractText).join('');
    };

    const topContent = (adf.content as Array<Record<string, unknown>>) || [];
    return topContent.map(extractText).join('\n');
  }

  /**
   * Find the correct Jira workflow transition to reach a target status.
   */
  async findTransitionForStatus(
    integration: JiraIntegration,
    issueIdOrKey: string,
    targetStatusName: string,
  ): Promise<{ transitionId: string; targetStatus: string } | null> {
    const transitions = await this.apiClient.getIssueTransitions(integration, issueIdOrKey);

    const match = transitions.find(
      (t) => t.to.name.toLowerCase() === targetStatusName.toLowerCase(),
    );

    if (match) {
      return { transitionId: match.id, targetStatus: match.to.name };
    }

    return null;
  }

  // --- Private helpers ---

  private mapJiraStatusToDevos(
    jiraStatusName: string,
    statusMapping: Record<string, string>,
  ): string | undefined {
    // Reverse lookup: find DevOS status that maps to this Jira status name
    for (const [devosStatus, jiraName] of Object.entries(statusMapping)) {
      if (jiraName.toLowerCase() === jiraStatusName.toLowerCase()) {
        return devosStatus;
      }
    }
    return undefined;
  }

  private async acquireLock(key: string): Promise<boolean> {
    try {
      const result = await this.redisService.setnx(key, 'locked', LOCK_TTL_MS / 1000);
      return result === 'OK';
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
