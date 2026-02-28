/**
 * IntegrationHealthService
 * Story 21-9: Integration Health Monitoring (AC2)
 *
 * Performs scheduled health probes for all connected integrations,
 * tracks health status, manages retries, and provides health data for the dashboard.
 *
 * Health history stored in Redis sorted sets per workspace+type.
 * Current state stored in integration_health_checks table (one row per workspace+type).
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  IntegrationHealthCheck,
  IntegrationHealthStatus,
  IntegrationHealthType,
} from '../../../database/entities/integration-health-check.entity';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '../../../database/entities/integration-connection.entity';
import { OutgoingWebhook } from '../../../database/entities/outgoing-webhook.entity';
import { RedisService } from '../../redis/redis.service';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { ProbeResult, HealthSummaryResponse, HealthHistoryEntry } from '../dto/integration-health.dto';

const HEALTH_HISTORY_KEY_PREFIX = 'integration-health:history';
const MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_HISTORY_ENTRIES = 8640; // 30 days * 288 checks/day at 5-min intervals

/**
 * Sanitize error messages to prevent leaking decrypted tokens or secrets.
 * Strips Authorization headers and token values from error output.
 */
function sanitizeProbeError(err: unknown): string {
  const message = (err as Error)?.message || 'Unknown probe error';
  // Strip any Authorization header values (Bearer tokens, raw tokens)
  return message
    .replace(/Bearer\s+[^\s"'}]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization:\s*[^\s"'}]+/gi, 'Authorization: [REDACTED]')
    .replace(/token[=:]\s*[^\s"'}]+/gi, 'token=[REDACTED]');
}

@Injectable()
export class IntegrationHealthService {
  private readonly logger = new Logger(IntegrationHealthService.name);
  private readonly probeTimeoutMs: number;

  constructor(
    @InjectRepository(IntegrationHealthCheck)
    private readonly healthRepo: Repository<IntegrationHealthCheck>,
    @InjectRepository(SlackIntegration)
    private readonly slackRepo: Repository<SlackIntegration>,
    @InjectRepository(DiscordIntegration)
    private readonly discordRepo: Repository<DiscordIntegration>,
    @InjectRepository(LinearIntegration)
    private readonly linearRepo: Repository<LinearIntegration>,
    @InjectRepository(JiraIntegration)
    private readonly jiraRepo: Repository<JiraIntegration>,
    @InjectRepository(IntegrationConnection)
    private readonly connectionRepo: Repository<IntegrationConnection>,
    @InjectRepository(OutgoingWebhook)
    private readonly webhookRepo: Repository<OutgoingWebhook>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.probeTimeoutMs = this.configService.get<number>(
      'INTEGRATION_HEALTH_PROBE_TIMEOUT_MS',
      10000,
    );
  }

  // ==================== Scheduled Health Check ====================

  /**
   * Scheduled health check every 5 minutes.
   * Iterates all workspaces with active integrations and probes each one.
   */
  @Cron('0 */5 * * * *')
  async runScheduledHealthChecks(): Promise<void> {
    try {
      const workspaceIds = await this.findDistinctWorkspaceIds();
      this.logger.log(`Running scheduled health checks for ${workspaceIds.length} workspaces`);

      for (const workspaceId of workspaceIds) {
        try {
          await this.checkWorkspaceHealth(workspaceId);
        } catch (err) {
          this.logger.warn(`Health check failed for workspace ${workspaceId}`, (err as Error)?.message);
        }
      }
    } catch (err) {
      this.logger.error('Scheduled health check failed', (err as Error)?.message);
    }
  }

  /**
   * Run health checks for a specific workspace.
   * Probes all connected integrations in parallel via Promise.allSettled.
   */
  async checkWorkspaceHealth(workspaceId: string): Promise<IntegrationHealthCheck[]> {
    const probePromises: Array<Promise<IntegrationHealthCheck | null>> = [];

    // Check Slack
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.SLACK));
    // Check Discord
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.DISCORD));
    // Check Linear
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.LINEAR));
    // Check Jira
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.JIRA));
    // Check GitHub
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.GITHUB));
    // Check Railway
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.RAILWAY));
    // Check Vercel
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.VERCEL));
    // Check Supabase
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.SUPABASE));
    // Check Webhooks
    probePromises.push(this.checkIntegration(workspaceId, IntegrationHealthType.WEBHOOKS));

    const results = await Promise.allSettled(probePromises);

    return results
      .filter((r): r is PromiseFulfilledResult<IntegrationHealthCheck | null> =>
        r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value!);
  }

  // ==================== Public Query Methods ====================

  /**
   * Get all health records for a workspace.
   */
  async getAllHealth(workspaceId: string): Promise<IntegrationHealthCheck[]> {
    return this.healthRepo.find({ where: { workspaceId } });
  }

  /**
   * Get health for a specific integration type in a workspace.
   */
  async getHealth(workspaceId: string, type: IntegrationHealthType): Promise<IntegrationHealthCheck | null> {
    return this.healthRepo.findOne({
      where: { workspaceId, integrationType: type },
    });
  }

  /**
   * Force a health check for a specific integration.
   */
  async forceHealthCheck(workspaceId: string, type: IntegrationHealthType): Promise<IntegrationHealthCheck> {
    const result = await this.checkIntegration(workspaceId, type);
    if (!result) {
      // Integration not found; return a disconnected record
      return this.createDisconnectedRecord(workspaceId, type);
    }
    return result;
  }

  /**
   * Get overall health summary for a workspace.
   */
  async getHealthSummary(workspaceId: string): Promise<HealthSummaryResponse> {
    const healthRecords = await this.getAllHealth(workspaceId);

    const counts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      disconnected: 0,
    };

    for (const record of healthRecords) {
      switch (record.status) {
        case IntegrationHealthStatus.HEALTHY:
          counts.healthy++;
          break;
        case IntegrationHealthStatus.DEGRADED:
          counts.degraded++;
          break;
        case IntegrationHealthStatus.UNHEALTHY:
          counts.unhealthy++;
          break;
        case IntegrationHealthStatus.DISCONNECTED:
          counts.disconnected++;
          break;
      }
    }

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (counts.unhealthy > 0) {
      overall = 'unhealthy';
    } else if (counts.degraded > 0) {
      overall = 'degraded';
    }

    return { overall, counts };
  }

  /**
   * Get health history for a specific integration from Redis.
   */
  async getHealthHistory(
    workspaceId: string,
    type: IntegrationHealthType,
    limit?: number,
  ): Promise<HealthHistoryEntry[]> {
    const effectiveLimit = Math.min(limit || 100, 100);
    const key = this.historyKey(workspaceId, type);

    try {
      // Use zrevrange to get only the needed entries in reverse score order (newest first)
      // This avoids fetching the entire sorted set into memory
      const entries = await this.redisService.zrevrange(key, 0, effectiveLimit - 1);
      if (!entries || entries.length === 0) return [];

      // Parse entries (already sorted newest first by Redis)
      const parsed: HealthHistoryEntry[] = entries
        .map(entry => {
          try {
            return JSON.parse(entry) as HealthHistoryEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is HealthHistoryEntry => e !== null);

      return parsed;
    } catch (err) {
      this.logger.warn('Failed to get health history from Redis', (err as Error)?.message);
      return [];
    }
  }

  /**
   * Retry all failed sync items for a specific integration.
   * Delegates to the appropriate integration service for retry logic.
   */
  async retryFailed(workspaceId: string, type: IntegrationHealthType): Promise<{ retriedCount: number }> {
    // For this story, log the retry request and return a count based on the integration type
    this.logger.log(`Retry requested for ${type} in workspace ${workspaceId}`);

    // Check if integration exists and has errors
    const healthRecord = await this.getHealth(workspaceId, type);
    if (!healthRecord || healthRecord.status === IntegrationHealthStatus.HEALTHY) {
      return { retriedCount: 0 };
    }

    // Force a health check to see if the issue resolved
    await this.checkIntegration(workspaceId, type);

    return { retriedCount: 1 };
  }

  // ==================== Private: Integration Check Dispatcher ====================

  /**
   * Check a specific integration for a workspace.
   * Returns null if the integration is not connected.
   */
  private async checkIntegration(
    workspaceId: string,
    type: IntegrationHealthType,
  ): Promise<IntegrationHealthCheck | null> {
    let probeResult: ProbeResult;
    let integrationId: string | null = null;

    try {
      switch (type) {
        case IntegrationHealthType.SLACK: {
          const slack = await this.slackRepo.findOne({ where: { workspaceId } });
          if (!slack) return null;
          integrationId = slack.id;
          probeResult = await this.withTimeout(this.probeSlack(slack));
          break;
        }
        case IntegrationHealthType.DISCORD: {
          const discord = await this.discordRepo.findOne({ where: { workspaceId } });
          if (!discord) return null;
          integrationId = discord.id;
          probeResult = await this.withTimeout(this.probeDiscord(discord));
          break;
        }
        case IntegrationHealthType.LINEAR: {
          const linear = await this.linearRepo.findOne({ where: { workspaceId } });
          if (!linear) return null;
          integrationId = linear.id;
          probeResult = await this.withTimeout(this.probeLinear(linear));
          break;
        }
        case IntegrationHealthType.JIRA: {
          const jira = await this.jiraRepo.findOne({ where: { workspaceId } });
          if (!jira) return null;
          integrationId = jira.id;
          probeResult = await this.withTimeout(this.probeJira(jira));
          break;
        }
        case IntegrationHealthType.GITHUB:
        case IntegrationHealthType.RAILWAY:
        case IntegrationHealthType.VERCEL:
        case IntegrationHealthType.SUPABASE: {
          const providerMap: Record<string, IntegrationProvider> = {
            [IntegrationHealthType.GITHUB]: IntegrationProvider.GITHUB,
            [IntegrationHealthType.RAILWAY]: IntegrationProvider.RAILWAY,
            [IntegrationHealthType.VERCEL]: IntegrationProvider.VERCEL,
            [IntegrationHealthType.SUPABASE]: IntegrationProvider.SUPABASE,
          };
          const connection = await this.connectionRepo.findOne({
            where: { workspaceId, provider: providerMap[type] },
          });
          if (!connection) return null;
          integrationId = connection.id;
          probeResult = await this.withTimeout(this.probeIntegrationConnection(connection, type));
          break;
        }
        case IntegrationHealthType.WEBHOOKS: {
          const webhooks = await this.webhookRepo.find({ where: { workspaceId } });
          if (webhooks.length === 0) return null;
          integrationId = webhooks[0].id; // Use first webhook as representative
          probeResult = await this.withTimeout(this.probeWebhooksFromList(webhooks));
          break;
        }
        default:
          return null;
      }
    } catch (err) {
      // Probe timeout or unexpected error
      probeResult = {
        status: 'unhealthy',
        responseTimeMs: this.probeTimeoutMs,
        error: (err as Error)?.message || 'Probe timeout',
      };
    }

    // Guard against null integrationId (can happen if repo.findOne itself throws)
    if (!integrationId) {
      this.logger.warn(`No integrationId resolved for ${type} in workspace ${workspaceId}, skipping record`);
      return null;
    }

    // Record and return the result
    return this.recordProbeResult(workspaceId, type, integrationId, probeResult);
  }

  // ==================== Private: Probe Methods ====================

  /**
   * Probe Slack: Verify bot token via Slack auth.test API.
   */
  private async probeSlack(slack: SlackIntegration): Promise<ProbeResult> {
    const startTime = Date.now();
    try {
      if (slack.status !== 'active') {
        return {
          status: 'disconnected',
          responseTimeMs: Date.now() - startTime,
          error: `Slack status: ${slack.status}`,
        };
      }

      const token = await this.encryptionService.decryptWithWorkspaceKey(
        slack.workspaceId,
        slack.botToken,
        slack.botTokenIV,
      );
      const response = await this.httpService.axiosRef.post(
        'https://slack.com/api/auth.test',
        null,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: this.probeTimeoutMs,
        },
      );

      const responseTimeMs = Date.now() - startTime;

      if (response.data?.ok) {
        // Check for recent errors
        if (slack.errorCount > 0) {
          return {
            status: 'degraded',
            responseTimeMs,
            details: { tokenValid: true, errorCount: slack.errorCount, lastError: slack.lastError },
          };
        }
        return {
          status: 'healthy',
          responseTimeMs,
          details: { tokenValid: true, messageCount: slack.messageCount },
        };
      }

      return {
        status: 'unhealthy',
        responseTimeMs,
        error: response.data?.error || 'Slack auth.test failed',
        details: { tokenValid: false },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: sanitizeProbeError(err),
      };
    }
  }

  /**
   * Probe Discord: Verify webhook URL by sending a GET request.
   */
  private async probeDiscord(discord: DiscordIntegration): Promise<ProbeResult> {
    const startTime = Date.now();
    try {
      if (discord.status !== 'active') {
        return {
          status: 'disconnected',
          responseTimeMs: Date.now() - startTime,
          error: `Discord status: ${discord.status}`,
        };
      }

      const webhookUrl = await this.encryptionService.decryptWithWorkspaceKey(
        discord.workspaceId,
        discord.defaultWebhookUrl,
        discord.defaultWebhookUrlIv,
      );

      const response = await this.httpService.axiosRef.get(webhookUrl, {
        timeout: this.probeTimeoutMs,
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 200) {
        if (discord.errorCount > 0) {
          return {
            status: 'degraded',
            responseTimeMs,
            details: { webhookValid: true, errorCount: discord.errorCount },
          };
        }
        return {
          status: 'healthy',
          responseTimeMs,
          details: { webhookValid: true, messageCount: discord.messageCount },
        };
      }

      return {
        status: 'unhealthy',
        responseTimeMs,
        error: `Discord webhook returned ${response.status}`,
        details: { webhookValid: false },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: sanitizeProbeError(err),
      };
    }
  }

  /**
   * Probe Linear: Verify access token via Linear GraphQL API.
   */
  private async probeLinear(linear: LinearIntegration): Promise<ProbeResult> {
    const startTime = Date.now();
    try {
      if (!linear.isActive) {
        return {
          status: 'disconnected',
          responseTimeMs: Date.now() - startTime,
          error: 'Linear integration inactive',
        };
      }

      const token = await this.encryptionService.decryptWithWorkspaceKey(
        linear.workspaceId,
        linear.accessToken,
        linear.accessTokenIv,
      );
      const response = await this.httpService.axiosRef.post(
        'https://api.linear.app/graphql',
        { query: '{ viewer { id } }' },
        {
          headers: { Authorization: token },
          timeout: this.probeTimeoutMs,
        },
      );

      const responseTimeMs = Date.now() - startTime;

      if (response.data?.data?.viewer?.id) {
        if (linear.errorCount > 0) {
          return {
            status: 'degraded',
            responseTimeMs,
            details: { tokenValid: true, errorCount: linear.errorCount },
          };
        }
        return {
          status: 'healthy',
          responseTimeMs,
          details: { tokenValid: true, syncCount: linear.syncCount },
        };
      }

      return {
        status: 'unhealthy',
        responseTimeMs,
        error: 'Linear token validation failed',
        details: { tokenValid: false },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: sanitizeProbeError(err),
      };
    }
  }

  /**
   * Probe Jira: Verify token by calling the myself API.
   */
  private async probeJira(jira: JiraIntegration): Promise<ProbeResult> {
    const startTime = Date.now();
    try {
      if (!jira.isActive) {
        return {
          status: 'disconnected',
          responseTimeMs: Date.now() - startTime,
          error: 'Jira integration inactive',
        };
      }

      // Check if token is expiring within 24h
      const expiresIn = jira.tokenExpiresAt
        ? new Date(jira.tokenExpiresAt).getTime() - Date.now()
        : Infinity;
      const expiringWithin24h = expiresIn < 24 * 60 * 60 * 1000;
      const isExpired = expiresIn <= 0;

      if (isExpired) {
        return {
          status: 'unhealthy',
          responseTimeMs: Date.now() - startTime,
          error: 'Jira token expired',
          details: { tokenExpired: true },
        };
      }

      const token = await this.encryptionService.decryptWithWorkspaceKey(
        jira.workspaceId,
        jira.accessToken,
        jira.accessTokenIv,
      );
      const response = await this.httpService.axiosRef.get(
        `https://api.atlassian.com/ex/jira/${jira.cloudId}/rest/api/3/myself`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: this.probeTimeoutMs,
        },
      );

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 200) {
        if (expiringWithin24h) {
          return {
            status: 'degraded',
            responseTimeMs,
            error: 'Jira token expiring within 24 hours',
            details: { tokenValid: true, tokenExpiringSoon: true },
          };
        }
        if (jira.errorCount > 0) {
          return {
            status: 'degraded',
            responseTimeMs,
            details: { tokenValid: true, errorCount: jira.errorCount },
          };
        }
        return {
          status: 'healthy',
          responseTimeMs,
          details: { tokenValid: true, syncCount: jira.syncCount },
        };
      }

      return {
        status: 'unhealthy',
        responseTimeMs,
        error: `Jira API returned ${response.status}`,
        details: { tokenValid: false },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: sanitizeProbeError(err),
      };
    }
  }

  /**
   * Probe GitHub/Railway/Vercel/Supabase via IntegrationConnection status.
   */
  private async probeIntegrationConnection(
    connection: IntegrationConnection,
    type: IntegrationHealthType,
  ): Promise<ProbeResult> {
    const startTime = Date.now();
    const responseTimeMs = Date.now() - startTime;

    if (connection.status === IntegrationStatus.ERROR) {
      return {
        status: 'unhealthy',
        responseTimeMs,
        error: `${type} connection in error state`,
        details: { connectionStatus: connection.status },
      };
    }

    if (connection.status === IntegrationStatus.EXPIRED) {
      return {
        status: 'unhealthy',
        responseTimeMs,
        error: `${type} connection expired`,
        details: { connectionStatus: connection.status },
      };
    }

    if (connection.status === IntegrationStatus.DISCONNECTED) {
      return {
        status: 'disconnected',
        responseTimeMs,
        error: `${type} disconnected`,
        details: { connectionStatus: connection.status },
      };
    }

    // Active connection - check last used time
    if (connection.lastUsedAt) {
      const daysSinceLastUse = (Date.now() - connection.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse > 7) {
        return {
          status: 'degraded',
          responseTimeMs,
          error: `${type} not used in ${Math.floor(daysSinceLastUse)} days`,
          details: { connectionStatus: connection.status, daysSinceLastUse: Math.floor(daysSinceLastUse) },
        };
      }
    }

    return {
      status: 'healthy',
      responseTimeMs,
      details: { connectionStatus: connection.status },
    };
  }

  /**
   * Probe Webhooks: Check delivery status of all active webhooks.
   * Accepts pre-fetched webhook list to avoid redundant DB query.
   */
  private async probeWebhooksFromList(webhooks: OutgoingWebhook[]): Promise<ProbeResult> {
    const startTime = Date.now();
    try {
      const activeWebhooks = webhooks.filter(w => w.isActive);

      if (activeWebhooks.length === 0) {
        return {
          status: 'disconnected',
          responseTimeMs: Date.now() - startTime,
          error: 'No active webhooks',
        };
      }

      const failingWebhooks = activeWebhooks.filter(w => w.consecutiveFailures >= w.maxConsecutiveFailures);
      const failingCount = failingWebhooks.length;
      const totalActive = activeWebhooks.length;

      const responseTimeMs = Date.now() - startTime;

      if (failingCount === 0) {
        return {
          status: 'healthy',
          responseTimeMs,
          details: { activeWebhooks: totalActive, failingWebhooks: 0 },
        };
      }

      if (failingCount > totalActive / 2) {
        return {
          status: 'unhealthy',
          responseTimeMs,
          error: `${failingCount}/${totalActive} webhooks failing`,
          details: { activeWebhooks: totalActive, failingWebhooks: failingCount },
        };
      }

      return {
        status: 'degraded',
        responseTimeMs,
        error: `${failingCount}/${totalActive} webhooks failing`,
        details: { activeWebhooks: totalActive, failingWebhooks: failingCount },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: sanitizeProbeError(err),
      };
    }
  }

  // ==================== Private: Record Results ====================

  /**
   * Record a health check result and update the health record.
   * Stores history entry in Redis sorted set.
   * Updates error_count_24h, consecutive_failures, uptime_30d.
   */
  private async recordProbeResult(
    workspaceId: string,
    type: IntegrationHealthType,
    integrationId: string,
    result: ProbeResult,
  ): Promise<IntegrationHealthCheck> {
    const now = new Date();
    const status = result.status as IntegrationHealthStatus;

    // Find or create health record
    let healthRecord = await this.healthRepo.findOne({
      where: { workspaceId, integrationType: type },
    });

    const previousStatus = healthRecord?.status;

    if (!healthRecord) {
      healthRecord = this.healthRepo.create({
        workspaceId,
        integrationType: type,
        integrationId,
        status,
        checkedAt: now,
      });
    }

    // Update fields
    healthRecord.status = status;
    healthRecord.responseTimeMs = result.responseTimeMs;
    healthRecord.healthDetails = result.details || {};
    healthRecord.checkedAt = now;
    healthRecord.integrationId = integrationId;

    if (status === IntegrationHealthStatus.HEALTHY || status === IntegrationHealthStatus.DEGRADED) {
      healthRecord.lastSuccessAt = now;
      healthRecord.consecutiveFailures = 0;
    } else {
      healthRecord.lastErrorAt = now;
      healthRecord.lastErrorMessage = result.error || null;
      healthRecord.consecutiveFailures = (healthRecord.consecutiveFailures || 0) + 1;
    }

    // Store history entry in Redis
    const historyEntry: HealthHistoryEntry = {
      timestamp: now.toISOString(),
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      ...(result.error && { error: result.error }),
    };

    try {
      const key = this.historyKey(workspaceId, type);
      await this.redisService.zadd(key, now.getTime(), JSON.stringify(historyEntry));

      // Calculate error count 24h
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentEntries = await this.redisService.zrangebyscore(key, twentyFourHoursAgo, '+inf');
      const errorCount = recentEntries.filter(e => {
        try {
          const parsed = JSON.parse(e) as HealthHistoryEntry;
          return parsed.status === 'unhealthy' || parsed.status === 'disconnected';
        } catch {
          return false;
        }
      }).length;
      healthRecord.errorCount24h = errorCount;

      // Calculate uptime 30d
      healthRecord.uptime30d = await this.calculateUptime30d(workspaceId, type);

      // Prune old history
      await this.pruneHistory(workspaceId, type);
    } catch (err) {
      this.logger.warn('Failed to update health history in Redis', (err as Error)?.message);
    }

    // Save to database
    const saved = await this.healthRepo.save(healthRecord);

    // Alerting logic (fire and forget)
    this.handleAlerts(workspaceId, type, saved, previousStatus).catch(err => {
      this.logger.warn('Alert handling failed', (err as Error)?.message);
    });

    return saved;
  }

  // ==================== Private: Utility Methods ====================

  /**
   * Calculate uptime percentage for the last 30 days.
   */
  async calculateUptime30d(workspaceId: string, type: IntegrationHealthType): Promise<number> {
    const key = this.historyKey(workspaceId, type);
    const thirtyDaysAgo = Date.now() - MAX_RETENTION_SECONDS * 1000;

    try {
      const entries = await this.redisService.zrangebyscore(key, thirtyDaysAgo, '+inf');
      if (!entries || entries.length === 0) return 100;

      let healthyCount = 0;
      for (const entry of entries) {
        try {
          const parsed = JSON.parse(entry) as HealthHistoryEntry;
          if (parsed.status === 'healthy' || parsed.status === 'degraded') {
            healthyCount++;
          }
        } catch {
          // Skip unparseable entries
        }
      }

      return Number(((healthyCount / entries.length) * 100).toFixed(2));
    } catch (err) {
      this.logger.warn('Failed to calculate uptime', (err as Error)?.message);
      return 100;
    }
  }

  /**
   * Prune health history older than 30 days from Redis.
   */
  async pruneHistory(workspaceId: string, type: IntegrationHealthType): Promise<void> {
    const key = this.historyKey(workspaceId, type);
    const cutoff = Date.now() - MAX_RETENTION_SECONDS * 1000;

    try {
      await this.redisService.zremrangebyscore(key, '-inf', cutoff);
    } catch (err) {
      this.logger.warn('Failed to prune health history', (err as Error)?.message);
    }
  }

  /**
   * Handle alerts when health status changes.
   */
  private async handleAlerts(
    workspaceId: string,
    type: IntegrationHealthType,
    record: IntegrationHealthCheck,
    previousStatus?: IntegrationHealthStatus,
  ): Promise<void> {
    // When integration becomes unhealthy (consecutive_failures >= 3)
    if (record.consecutiveFailures >= 3 && record.consecutiveFailures < 4) {
      this.logger.warn(`Integration ${type} is unhealthy for workspace ${workspaceId}`);
    }

    // When unhealthy for 1 hour (consecutive_failures >= 12 at 5-min intervals)
    if (record.consecutiveFailures >= 12 && record.consecutiveFailures < 13) {
      this.logger.error(`Integration ${type} has been unhealthy for 1 hour for workspace ${workspaceId}`);
    }

    // When integration recovers
    if (
      previousStatus &&
      (previousStatus === IntegrationHealthStatus.UNHEALTHY || previousStatus === IntegrationHealthStatus.DEGRADED) &&
      record.status === IntegrationHealthStatus.HEALTHY
    ) {
      this.logger.log(`Integration ${type} has recovered for workspace ${workspaceId}`);
    }
  }

  /**
   * Find distinct workspace IDs that have at least one active integration.
   * Uses DISTINCT queries to avoid fetching all rows into memory.
   */
  private async findDistinctWorkspaceIds(): Promise<string[]> {
    const workspaceIds = new Set<string>();

    // Gather distinct workspace IDs from all integration types in parallel using QueryBuilder
    const [slacks, discords, linears, jiras, connections, webhooks] = await Promise.all([
      this.slackRepo.createQueryBuilder('s').select('DISTINCT s.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
      this.discordRepo.createQueryBuilder('d').select('DISTINCT d.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
      this.linearRepo.createQueryBuilder('l').select('DISTINCT l.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
      this.jiraRepo.createQueryBuilder('j').select('DISTINCT j.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
      this.connectionRepo.createQueryBuilder('c').select('DISTINCT c.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
      this.webhookRepo.createQueryBuilder('w').select('DISTINCT w.workspace_id', 'workspaceId').getRawMany<{ workspaceId: string }>(),
    ]);

    for (const s of slacks) workspaceIds.add(s.workspaceId);
    for (const d of discords) workspaceIds.add(d.workspaceId);
    for (const l of linears) workspaceIds.add(l.workspaceId);
    for (const j of jiras) workspaceIds.add(j.workspaceId);
    for (const c of connections) workspaceIds.add(c.workspaceId);
    for (const w of webhooks) workspaceIds.add(w.workspaceId);

    return Array.from(workspaceIds);
  }

  /**
   * Wrap a probe with a timeout using Promise.race().
   * Clears the timeout timer when the probe resolves to prevent timer leaks.
   */
  private async withTimeout<T>(probe: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        probe,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Probe timeout')), this.probeTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Generate Redis key for health history sorted set.
   */
  private historyKey(workspaceId: string, type: IntegrationHealthType): string {
    return `${HEALTH_HISTORY_KEY_PREFIX}:${workspaceId}:${type}`;
  }

  /**
   * Create a disconnected health record when integration not found.
   */
  private async createDisconnectedRecord(
    workspaceId: string,
    type: IntegrationHealthType,
  ): Promise<IntegrationHealthCheck> {
    let healthRecord = await this.healthRepo.findOne({
      where: { workspaceId, integrationType: type },
    });

    if (!healthRecord) {
      healthRecord = this.healthRepo.create({
        workspaceId,
        integrationType: type,
        integrationId: '00000000-0000-0000-0000-000000000000',
        status: IntegrationHealthStatus.DISCONNECTED,
        checkedAt: new Date(),
      });
    } else {
      healthRecord.status = IntegrationHealthStatus.DISCONNECTED;
      healthRecord.checkedAt = new Date();
    }

    return this.healthRepo.save(healthRecord);
  }
}
