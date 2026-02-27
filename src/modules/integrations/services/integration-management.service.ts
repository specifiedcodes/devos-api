/**
 * IntegrationManagementService
 * Story 21-7: Integration Management UI (AC1)
 *
 * Aggregates the connection status of all integration providers into a unified response.
 * Provides a single endpoint for the frontend to query all integration statuses,
 * recent activity, and health information.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '../../../database/entities/integration-connection.entity';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { LinearSyncItem } from '../../../database/entities/linear-sync-item.entity';
import { JiraSyncItem } from '../../../database/entities/jira-sync-item.entity';
import { RedisService } from '../../redis/redis.service';

// ==================== Enums ====================

export enum IntegrationType {
  SLACK = 'slack',
  DISCORD = 'discord',
  LINEAR = 'linear',
  JIRA = 'jira',
  GITHUB = 'github',
  RAILWAY = 'railway',
  VERCEL = 'vercel',
  SUPABASE = 'supabase',
  WEBHOOKS = 'webhooks',
}

export enum IntegrationCategory {
  ALL = 'all',
  COMMUNICATION = 'communication',
  PROJECT_MANAGEMENT = 'project_management',
  CODE = 'code',
  DEPLOYMENT = 'deployment',
  DATABASE = 'database',
  CUSTOM = 'custom',
}

// ==================== Interfaces ====================

export interface UnifiedIntegrationStatus {
  type: IntegrationType;
  name: string;
  description: string;
  category: IntegrationCategory;
  connected: boolean;
  status: 'active' | 'error' | 'disconnected' | 'expired' | 'coming-soon';
  accountLabel?: string;
  connectedAt?: string;
  connectedBy?: string;
  lastActivityAt?: string;
  errorCount?: number;
  lastError?: string;
  syncStats?: {
    total: number;
    synced: number;
    pending: number;
    conflict: number;
    error: number;
  };
  configUrl: string;
  available: boolean;
}

// ==================== Constants ====================

const CACHE_KEY_PREFIX = 'integration-mgmt:statuses:';
const CACHE_TTL = 60; // 60 seconds

const CATEGORY_MAP: Record<IntegrationCategory, IntegrationType[]> = {
  [IntegrationCategory.ALL]: Object.values(IntegrationType),
  [IntegrationCategory.COMMUNICATION]: [IntegrationType.SLACK, IntegrationType.DISCORD],
  [IntegrationCategory.PROJECT_MANAGEMENT]: [IntegrationType.LINEAR, IntegrationType.JIRA],
  [IntegrationCategory.CODE]: [IntegrationType.GITHUB],
  [IntegrationCategory.DEPLOYMENT]: [IntegrationType.RAILWAY, IntegrationType.VERCEL],
  [IntegrationCategory.DATABASE]: [IntegrationType.SUPABASE],
  [IntegrationCategory.CUSTOM]: [IntegrationType.WEBHOOKS],
};

const INTEGRATION_METADATA: Record<IntegrationType, { name: string; description: string; category: IntegrationCategory }> = {
  [IntegrationType.SLACK]: {
    name: 'Slack',
    description: 'Send notifications and interactive actions to Slack channels.',
    category: IntegrationCategory.COMMUNICATION,
  },
  [IntegrationType.DISCORD]: {
    name: 'Discord',
    description: 'Send notifications to Discord channels via webhooks.',
    category: IntegrationCategory.COMMUNICATION,
  },
  [IntegrationType.LINEAR]: {
    name: 'Linear',
    description: 'Two-way sync between DevOS stories and Linear issues.',
    category: IntegrationCategory.PROJECT_MANAGEMENT,
  },
  [IntegrationType.JIRA]: {
    name: 'Jira',
    description: 'Two-way sync of issues and projects with Jira.',
    category: IntegrationCategory.PROJECT_MANAGEMENT,
  },
  [IntegrationType.GITHUB]: {
    name: 'GitHub',
    description: 'Connect repositories, manage branches, and create pull requests.',
    category: IntegrationCategory.CODE,
  },
  [IntegrationType.RAILWAY]: {
    name: 'Railway',
    description: 'Deploy and manage applications on Railway.',
    category: IntegrationCategory.DEPLOYMENT,
  },
  [IntegrationType.VERCEL]: {
    name: 'Vercel',
    description: 'Deploy frontend applications to Vercel.',
    category: IntegrationCategory.DEPLOYMENT,
  },
  [IntegrationType.SUPABASE]: {
    name: 'Supabase',
    description: 'Provision and manage Supabase databases.',
    category: IntegrationCategory.DATABASE,
  },
  [IntegrationType.WEBHOOKS]: {
    name: 'Webhooks',
    description: 'Send custom webhook notifications to any endpoint.',
    category: IntegrationCategory.CUSTOM,
  },
};

@Injectable()
export class IntegrationManagementService {
  private readonly logger = new Logger(IntegrationManagementService.name);

  constructor(
    @InjectRepository(IntegrationConnection)
    private readonly integrationConnectionRepo: Repository<IntegrationConnection>,
    @InjectRepository(SlackIntegration)
    private readonly slackRepo: Repository<SlackIntegration>,
    @InjectRepository(DiscordIntegration)
    private readonly discordRepo: Repository<DiscordIntegration>,
    @InjectRepository(LinearIntegration)
    private readonly linearRepo: Repository<LinearIntegration>,
    @InjectRepository(JiraIntegration)
    private readonly jiraRepo: Repository<JiraIntegration>,
    @InjectRepository(LinearSyncItem)
    private readonly linearSyncItemRepo: Repository<LinearSyncItem>,
    @InjectRepository(JiraSyncItem)
    private readonly jiraSyncItemRepo: Repository<JiraSyncItem>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get aggregated status of all integrations for a workspace.
   * Results are cached in Redis for 60 seconds.
   */
  async getAllIntegrationStatuses(
    workspaceId: string,
    category?: IntegrationCategory,
  ): Promise<UnifiedIntegrationStatus[]> {
    // Try cache first
    const cacheKey = `${CACHE_KEY_PREFIX}${workspaceId}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const allStatuses: UnifiedIntegrationStatus[] = JSON.parse(cached);
        return this.filterByCategory(allStatuses, category);
      }
    } catch (err) {
      this.logger.warn('Failed to read integration status cache', err);
    }

    // Fetch all statuses in parallel with 5s timeout
    const statuses = await this.fetchAllStatuses(workspaceId);

    // Cache the result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(statuses), CACHE_TTL);
    } catch (err) {
      this.logger.warn('Failed to write integration status cache', err);
    }

    return this.filterByCategory(statuses, category);
  }

  /**
   * Get detailed status for a single integration type.
   */
  async getIntegrationStatus(
    workspaceId: string,
    type: IntegrationType,
  ): Promise<UnifiedIntegrationStatus> {
    const allStatuses = await this.getAllIntegrationStatuses(workspaceId);
    const status = allStatuses.find((s) => s.type === type);
    if (!status) {
      return this.createDefaultStatus(type);
    }
    return status;
  }

  /**
   * Get summary counts: total available, connected, errored.
   */
  async getIntegrationSummary(
    workspaceId: string,
  ): Promise<{ total: number; connected: number; errored: number; disconnected: number }> {
    const statuses = await this.getAllIntegrationStatuses(workspaceId);
    return {
      total: statuses.filter((s) => s.available).length,
      connected: statuses.filter((s) => s.connected).length,
      errored: statuses.filter((s) => s.status === 'error').length,
      disconnected: statuses.filter((s) => s.status === 'disconnected' && s.available).length,
    };
  }

  /**
   * Get recent integration activity across all providers.
   */
  async getRecentActivity(
    workspaceId: string,
    limit?: number,
  ): Promise<Array<{ type: IntegrationType; event: string; timestamp: string; details?: string }>> {
    const effectiveLimit = Math.min(limit || 10, 50);
    const activities: Array<{ type: IntegrationType; event: string; timestamp: string; details?: string }> = [];

    // Gather activity from each integration type
    try {
      const slack = await this.slackRepo.findOne({ where: { workspaceId } });
      if (slack) {
        if (slack.lastMessageAt) {
          activities.push({
            type: IntegrationType.SLACK,
            event: 'message_sent',
            timestamp: slack.lastMessageAt.toISOString(),
            details: `${slack.messageCount} total messages`,
          });
        }
        if (slack.lastErrorAt) {
          activities.push({
            type: IntegrationType.SLACK,
            event: 'error',
            timestamp: slack.lastErrorAt.toISOString(),
            details: slack.lastError || undefined,
          });
        }
        activities.push({
          type: IntegrationType.SLACK,
          event: 'connected',
          timestamp: slack.connectedAt.toISOString(),
          details: `Connected to ${slack.teamName || 'Slack workspace'}`,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to fetch Slack activity', err);
    }

    try {
      const discord = await this.discordRepo.findOne({ where: { workspaceId } });
      if (discord) {
        if (discord.lastMessageAt) {
          activities.push({
            type: IntegrationType.DISCORD,
            event: 'message_sent',
            timestamp: discord.lastMessageAt.toISOString(),
            details: `${discord.messageCount} total messages`,
          });
        }
        if (discord.lastErrorAt) {
          activities.push({
            type: IntegrationType.DISCORD,
            event: 'error',
            timestamp: discord.lastErrorAt.toISOString(),
            details: discord.lastError || undefined,
          });
        }
        activities.push({
          type: IntegrationType.DISCORD,
          event: 'connected',
          timestamp: discord.connectedAt.toISOString(),
          details: `Connected to ${discord.guildName || 'Discord server'}`,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to fetch Discord activity', err);
    }

    try {
      const linear = await this.linearRepo.findOne({ where: { workspaceId } });
      if (linear) {
        if (linear.lastSyncAt) {
          activities.push({
            type: IntegrationType.LINEAR,
            event: 'sync',
            timestamp: linear.lastSyncAt.toISOString(),
            details: `${linear.syncCount} total syncs`,
          });
        }
        if (linear.lastErrorAt) {
          activities.push({
            type: IntegrationType.LINEAR,
            event: 'error',
            timestamp: linear.lastErrorAt.toISOString(),
            details: linear.lastError || undefined,
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to fetch Linear activity', err);
    }

    try {
      const jira = await this.jiraRepo.findOne({ where: { workspaceId } });
      if (jira) {
        if (jira.lastSyncAt) {
          activities.push({
            type: IntegrationType.JIRA,
            event: 'sync',
            timestamp: jira.lastSyncAt.toISOString(),
            details: `${jira.syncCount} total syncs`,
          });
        }
        if (jira.lastErrorAt) {
          activities.push({
            type: IntegrationType.JIRA,
            event: 'error',
            timestamp: jira.lastErrorAt.toISOString(),
            details: jira.lastError || undefined,
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to fetch Jira activity', err);
    }

    try {
      const connections = await this.integrationConnectionRepo.find({
        where: { workspaceId },
      });
      for (const conn of connections) {
        const type = this.mapProviderToType(conn.provider);
        if (type) {
          activities.push({
            type,
            event: 'connected',
            timestamp: conn.connectedAt.toISOString(),
            details: conn.externalUsername ? `Connected as ${conn.externalUsername}` : undefined,
          });
          if (conn.lastUsedAt) {
            activities.push({
              type,
              event: 'last_used',
              timestamp: conn.lastUsedAt.toISOString(),
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to fetch IntegrationConnection activity', err);
    }

    // Sort by timestamp descending, then limit
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return activities.slice(0, effectiveLimit);
  }

  /**
   * Invalidate cached integration statuses for a workspace.
   */
  async invalidateCache(workspaceId: string): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${workspaceId}`;
    try {
      await this.redisService.del(cacheKey);
    } catch (err) {
      this.logger.warn('Failed to invalidate integration status cache', err);
    }
  }

  // ==================== Private Methods ====================

  private filterByCategory(
    statuses: UnifiedIntegrationStatus[],
    category?: IntegrationCategory,
  ): UnifiedIntegrationStatus[] {
    if (!category || category === IntegrationCategory.ALL) {
      return statuses;
    }
    const allowedTypes = CATEGORY_MAP[category] || [];
    return statuses.filter((s) => allowedTypes.includes(s.type));
  }

  private async fetchAllStatuses(workspaceId: string): Promise<UnifiedIntegrationStatus[]> {
    const fetchPromises = Object.values(IntegrationType).map(async (type) => {
      try {
        return await this.fetchStatusForType(workspaceId, type);
      } catch (err) {
        this.logger.warn(`Failed to fetch status for ${type}`, err);
        return this.createErrorStatus(type);
      }
    });

    // Use Promise.allSettled with a 5s timeout
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Integration status aggregation timeout')), 5000),
    );

    try {
      const results = await Promise.race([
        Promise.all(fetchPromises),
        timeoutPromise.then(() => [] as UnifiedIntegrationStatus[]),
      ]);
      return results as UnifiedIntegrationStatus[];
    } catch {
      this.logger.warn('Integration status aggregation timed out, returning partial data');
      // Return default statuses on timeout
      return Object.values(IntegrationType).map((type) => this.createDefaultStatus(type));
    }
  }

  private async fetchStatusForType(
    workspaceId: string,
    type: IntegrationType,
  ): Promise<UnifiedIntegrationStatus> {
    switch (type) {
      case IntegrationType.GITHUB:
      case IntegrationType.RAILWAY:
      case IntegrationType.VERCEL:
      case IntegrationType.SUPABASE:
        return this.fetchIntegrationConnectionStatus(workspaceId, type);
      case IntegrationType.SLACK:
        return this.fetchSlackStatus(workspaceId);
      case IntegrationType.DISCORD:
        return this.fetchDiscordStatus(workspaceId);
      case IntegrationType.LINEAR:
        return this.fetchLinearStatus(workspaceId);
      case IntegrationType.JIRA:
        return this.fetchJiraStatus(workspaceId);
      case IntegrationType.WEBHOOKS:
        return this.createComingSoonStatus(type);
      default:
        return this.createDefaultStatus(type);
    }
  }

  private async fetchIntegrationConnectionStatus(
    workspaceId: string,
    type: IntegrationType,
  ): Promise<UnifiedIntegrationStatus> {
    const providerMap: Record<string, IntegrationProvider> = {
      [IntegrationType.GITHUB]: IntegrationProvider.GITHUB,
      [IntegrationType.RAILWAY]: IntegrationProvider.RAILWAY,
      [IntegrationType.VERCEL]: IntegrationProvider.VERCEL,
      [IntegrationType.SUPABASE]: IntegrationProvider.SUPABASE,
    };

    const provider = providerMap[type];
    if (!provider) {
      return this.createDefaultStatus(type);
    }

    const connection = await this.integrationConnectionRepo.findOne({
      where: { workspaceId, provider },
    });

    const meta = INTEGRATION_METADATA[type];

    if (!connection) {
      return {
        type,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        connected: false,
        status: 'disconnected',
        configUrl: this.getConfigUrl(type),
        available: true,
      };
    }

    const statusMap: Record<string, 'active' | 'error' | 'disconnected' | 'expired'> = {
      [IntegrationStatus.ACTIVE]: 'active',
      [IntegrationStatus.ERROR]: 'error',
      [IntegrationStatus.DISCONNECTED]: 'disconnected',
      [IntegrationStatus.EXPIRED]: 'expired',
    };

    return {
      type,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      connected: connection.status === IntegrationStatus.ACTIVE,
      status: statusMap[connection.status] || 'disconnected',
      accountLabel: connection.externalUsername || undefined,
      connectedAt: connection.connectedAt?.toISOString(),
      connectedBy: connection.userId,
      lastActivityAt: connection.lastUsedAt?.toISOString(),
      configUrl: this.getConfigUrl(type),
      available: true,
    };
  }

  private async fetchSlackStatus(workspaceId: string): Promise<UnifiedIntegrationStatus> {
    const meta = INTEGRATION_METADATA[IntegrationType.SLACK];
    const slack = await this.slackRepo.findOne({ where: { workspaceId } });

    if (!slack) {
      return {
        type: IntegrationType.SLACK,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        connected: false,
        status: 'disconnected',
        configUrl: this.getConfigUrl(IntegrationType.SLACK),
        available: true,
      };
    }

    const isActive = slack.status === 'active';
    const hasErrors = slack.errorCount > 0;

    return {
      type: IntegrationType.SLACK,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      connected: isActive,
      status: hasErrors && isActive ? 'error' : isActive ? 'active' : 'disconnected',
      accountLabel: slack.teamName || undefined,
      connectedAt: slack.connectedAt?.toISOString(),
      connectedBy: slack.connectedBy,
      lastActivityAt: slack.lastMessageAt?.toISOString() || slack.updatedAt?.toISOString(),
      errorCount: slack.errorCount,
      lastError: slack.lastError || undefined,
      configUrl: this.getConfigUrl(IntegrationType.SLACK),
      available: true,
    };
  }

  private async fetchDiscordStatus(workspaceId: string): Promise<UnifiedIntegrationStatus> {
    const meta = INTEGRATION_METADATA[IntegrationType.DISCORD];
    const discord = await this.discordRepo.findOne({ where: { workspaceId } });

    if (!discord) {
      return {
        type: IntegrationType.DISCORD,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        connected: false,
        status: 'disconnected',
        configUrl: this.getConfigUrl(IntegrationType.DISCORD),
        available: true,
      };
    }

    const isActive = discord.status === 'active';
    const hasErrors = discord.errorCount > 0;

    return {
      type: IntegrationType.DISCORD,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      connected: isActive,
      status: hasErrors && isActive ? 'error' : isActive ? 'active' : 'disconnected',
      accountLabel: discord.guildName || discord.name || undefined,
      connectedAt: discord.connectedAt?.toISOString(),
      connectedBy: discord.connectedBy,
      lastActivityAt: discord.lastMessageAt?.toISOString() || discord.updatedAt?.toISOString(),
      errorCount: discord.errorCount,
      lastError: discord.lastError || undefined,
      configUrl: this.getConfigUrl(IntegrationType.DISCORD),
      available: true,
    };
  }

  private async fetchLinearStatus(workspaceId: string): Promise<UnifiedIntegrationStatus> {
    const meta = INTEGRATION_METADATA[IntegrationType.LINEAR];
    const linear = await this.linearRepo.findOne({ where: { workspaceId } });

    if (!linear) {
      return {
        type: IntegrationType.LINEAR,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        connected: false,
        status: 'disconnected',
        configUrl: this.getConfigUrl(IntegrationType.LINEAR),
        available: true,
      };
    }

    // Get sync stats
    let syncStats: UnifiedIntegrationStatus['syncStats'] | undefined;
    try {
      const syncCounts = await this.linearSyncItemRepo
        .createQueryBuilder('item')
        .select('item.syncStatus', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('item.linearIntegrationId = :integrationId', { integrationId: linear.id })
        .groupBy('item.syncStatus')
        .getRawMany();

      const stats = { total: 0, synced: 0, pending: 0, conflict: 0, error: 0 };
      for (const row of syncCounts) {
        const count = parseInt(row.count, 10);
        stats.total += count;
        switch (row.status) {
          case 'synced':
            stats.synced = count;
            break;
          case 'pending':
            stats.pending = count;
            break;
          case 'conflict':
            stats.conflict = count;
            break;
          case 'error':
            stats.error = count;
            break;
        }
      }
      syncStats = stats;
    } catch (err) {
      this.logger.warn('Failed to fetch Linear sync stats', err);
    }

    const isActive = linear.isActive;
    const hasErrors = linear.errorCount > 0;

    return {
      type: IntegrationType.LINEAR,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      connected: isActive,
      status: hasErrors && isActive ? 'error' : isActive ? 'active' : 'disconnected',
      accountLabel: linear.linearTeamName || undefined,
      connectedAt: linear.createdAt?.toISOString(),
      connectedBy: linear.connectedBy,
      lastActivityAt: linear.lastSyncAt?.toISOString() || linear.updatedAt?.toISOString(),
      errorCount: linear.errorCount,
      lastError: linear.lastError || undefined,
      syncStats,
      configUrl: this.getConfigUrl(IntegrationType.LINEAR),
      available: true,
    };
  }

  private async fetchJiraStatus(workspaceId: string): Promise<UnifiedIntegrationStatus> {
    const meta = INTEGRATION_METADATA[IntegrationType.JIRA];
    const jira = await this.jiraRepo.findOne({ where: { workspaceId } });

    if (!jira) {
      return {
        type: IntegrationType.JIRA,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        connected: false,
        status: 'disconnected',
        configUrl: this.getConfigUrl(IntegrationType.JIRA),
        available: true,
      };
    }

    // Check if token is expired
    const isExpired = jira.tokenExpiresAt && new Date(jira.tokenExpiresAt) < new Date();

    // Get sync stats
    let syncStats: UnifiedIntegrationStatus['syncStats'] | undefined;
    try {
      const syncCounts = await this.jiraSyncItemRepo
        .createQueryBuilder('item')
        .select('item.syncStatus', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('item.jiraIntegrationId = :integrationId', { integrationId: jira.id })
        .groupBy('item.syncStatus')
        .getRawMany();

      const stats = { total: 0, synced: 0, pending: 0, conflict: 0, error: 0 };
      for (const row of syncCounts) {
        const count = parseInt(row.count, 10);
        stats.total += count;
        switch (row.status) {
          case 'synced':
            stats.synced = count;
            break;
          case 'pending':
            stats.pending = count;
            break;
          case 'conflict':
            stats.conflict = count;
            break;
          case 'error':
            stats.error = count;
            break;
        }
      }
      syncStats = stats;
    } catch (err) {
      this.logger.warn('Failed to fetch Jira sync stats', err);
    }

    const isActive = jira.isActive;
    const hasErrors = jira.errorCount > 0;

    let status: UnifiedIntegrationStatus['status'];
    if (isExpired) {
      status = 'expired';
    } else if (hasErrors && isActive) {
      status = 'error';
    } else if (isActive) {
      status = 'active';
    } else {
      status = 'disconnected';
    }

    return {
      type: IntegrationType.JIRA,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      connected: isActive && !isExpired,
      status,
      accountLabel: jira.jiraProjectName || jira.jiraProjectKey || undefined,
      connectedAt: jira.createdAt?.toISOString(),
      connectedBy: jira.connectedBy,
      lastActivityAt: jira.lastSyncAt?.toISOString() || jira.updatedAt?.toISOString(),
      errorCount: jira.errorCount,
      lastError: jira.lastError || undefined,
      syncStats,
      configUrl: this.getConfigUrl(IntegrationType.JIRA),
      available: true,
    };
  }

  private createDefaultStatus(type: IntegrationType): UnifiedIntegrationStatus {
    const meta = INTEGRATION_METADATA[type];
    return {
      type,
      name: meta?.name || type,
      description: meta?.description || '',
      category: meta?.category || IntegrationCategory.CUSTOM,
      connected: false,
      status: 'disconnected',
      configUrl: this.getConfigUrl(type),
      available: type !== IntegrationType.WEBHOOKS,
    };
  }

  private createErrorStatus(type: IntegrationType): UnifiedIntegrationStatus {
    const meta = INTEGRATION_METADATA[type];
    return {
      type,
      name: meta?.name || type,
      description: meta?.description || '',
      category: meta?.category || IntegrationCategory.CUSTOM,
      connected: false,
      status: 'error',
      configUrl: this.getConfigUrl(type),
      available: type !== IntegrationType.WEBHOOKS,
    };
  }

  private createComingSoonStatus(type: IntegrationType): UnifiedIntegrationStatus {
    const meta = INTEGRATION_METADATA[type];
    return {
      type,
      name: meta?.name || type,
      description: meta?.description || '',
      category: meta?.category || IntegrationCategory.CUSTOM,
      connected: false,
      status: 'coming-soon',
      configUrl: this.getConfigUrl(type),
      available: false,
    };
  }

  private getConfigUrl(type: IntegrationType): string {
    switch (type) {
      case IntegrationType.SLACK:
        return 'integrations/slack';
      case IntegrationType.DISCORD:
        return 'integrations/discord';
      case IntegrationType.LINEAR:
        return 'integrations/linear';
      case IntegrationType.JIRA:
        return 'integrations/jira';
      case IntegrationType.GITHUB:
        return 'integrations/github';
      case IntegrationType.RAILWAY:
        return 'integrations/railway';
      case IntegrationType.VERCEL:
        return 'integrations/vercel';
      case IntegrationType.SUPABASE:
        return 'integrations/supabase';
      case IntegrationType.WEBHOOKS:
        return 'integrations/webhooks';
      default:
        return 'integrations';
    }
  }

  private mapProviderToType(provider: IntegrationProvider): IntegrationType | null {
    switch (provider) {
      case IntegrationProvider.GITHUB:
        return IntegrationType.GITHUB;
      case IntegrationProvider.RAILWAY:
        return IntegrationType.RAILWAY;
      case IntegrationProvider.VERCEL:
        return IntegrationType.VERCEL;
      case IntegrationProvider.SUPABASE:
        return IntegrationType.SUPABASE;
      default:
        return null;
    }
  }
}
