/**
 * ContextHealthService
 * Story 12.5: Context Health Indicators UI
 *
 * Assesses health of all three context tiers plus Graphiti connectivity.
 * Caches results in Redis with configurable TTL for performance.
 *
 * Health determination rules:
 * - Green (healthy): All three tiers valid, Graphiti connected, last refresh < 1 hour
 * - Yellow (degraded): One tier stale or Graphiti disconnected
 * - Red (critical): Multiple tiers invalid/missing, or Tier 1 missing
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { RedisService } from '../../redis/redis.service';
import { MemoryHealthService } from '../../memory/services/memory-health.service';
import {
  ContextHealth,
  TierHealth,
  OverallHealthStatus,
} from '../interfaces/context-health.interfaces';

/** Default staleness thresholds in minutes */
const DEFAULT_TIER1_STALE_MINUTES = 60;
const DEFAULT_TIER2_STALE_MINUTES = 1440; // 24 hours
const DEFAULT_TIER3_STALE_MINUTES = 10080; // 7 days
const DEFAULT_CACHE_TTL_SECONDS = 30;

@Injectable()
export class ContextHealthService {
  private readonly logger = new Logger(ContextHealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Optional() private readonly memoryHealthService?: MemoryHealthService,
  ) {}

  // -- Public API -------------------------------------------------------------

  /**
   * Assess the health of all context sources for a project.
   * Returns cached result if available and forceRefresh is false.
   */
  async assessHealth(
    projectId: string,
    workspaceId: string,
    workspacePath: string,
    forceRefresh = false,
  ): Promise<ContextHealth> {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.getCachedHealth(projectId);
      if (cached) {
        return cached;
      }
    }

    // Run health assessment
    const health = await this.computeHealth(projectId, workspaceId, workspacePath);

    // Cache result
    await this.cacheHealth(projectId, health);

    return health;
  }

  /**
   * Invalidate cached health for a project.
   * Called after context refresh to ensure fresh data.
   */
  async invalidateCache(projectId: string): Promise<void> {
    const key = this.getCacheKey(projectId);
    try {
      await this.redisService.del(key);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate health cache for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -- Private: Health Computation --------------------------------------------

  /**
   * Compute health by validating all tiers and checking Graphiti.
   */
  private async computeHealth(
    projectId: string,
    workspaceId: string,
    workspacePath: string,
  ): Promise<ContextHealth> {
    const tier1StaleMinutes = this.parseIntWithDefault(
      this.configService.get<string>(
        'CONTEXT_HEALTH_TIER1_STALE_MINUTES',
        String(DEFAULT_TIER1_STALE_MINUTES),
      ),
      DEFAULT_TIER1_STALE_MINUTES,
    );
    const tier2StaleMinutes = this.parseIntWithDefault(
      this.configService.get<string>(
        'CONTEXT_HEALTH_TIER2_STALE_MINUTES',
        String(DEFAULT_TIER2_STALE_MINUTES),
      ),
      DEFAULT_TIER2_STALE_MINUTES,
    );
    const tier3StaleMinutes = this.parseIntWithDefault(
      this.configService.get<string>(
        'CONTEXT_HEALTH_TIER3_STALE_MINUTES',
        String(DEFAULT_TIER3_STALE_MINUTES),
      ),
      DEFAULT_TIER3_STALE_MINUTES,
    );

    // Validate all three tiers in parallel
    const [tier1, tier2, tier3] = await Promise.all([
      this.validateTier1(workspacePath, tier1StaleMinutes),
      this.validateTier2(workspacePath, tier2StaleMinutes),
      this.validateTier3(workspacePath, tier3StaleMinutes),
    ]);

    // Check Graphiti connectivity
    let graphitiConnected = false;
    let graphitiEpisodeCount = 0;

    if (this.memoryHealthService) {
      try {
        const memoryHealth = await this.memoryHealthService.getHealth();
        graphitiConnected = memoryHealth.neo4jConnected;
        graphitiEpisodeCount = memoryHealth.totalEpisodes;
      } catch (error) {
        this.logger.warn(
          `Failed to check Graphiti health: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Determine last refresh time from Tier 1 lastModified
    const lastRefreshAt = tier1.lastModified;

    // Build issues array
    const issues = this.buildIssues(tier1, tier2, tier3, graphitiConnected);

    // Determine overall health
    const overallHealth = this.determineOverallHealth(
      tier1,
      tier2,
      tier3,
      graphitiConnected,
      issues,
    );

    return {
      projectId,
      workspaceId,
      tier1,
      tier2,
      tier3,
      graphitiConnected,
      graphitiEpisodeCount,
      lastRecoveryTime: 0,
      recoveryCount: 0,
      lastRefreshAt,
      overallHealth,
      issues,
    };
  }

  // -- Private: Tier Validation -----------------------------------------------

  /**
   * Validate Tier 1: .devoscontext (JSON, minimal state machine).
   */
  private async validateTier1(
    workspacePath: string,
    staleMinutes: number,
  ): Promise<TierHealth> {
    const filePath = path.join(workspacePath, '.devoscontext');
    return this.validateJsonFile(filePath, staleMinutes, 'Tier 1 (.devoscontext)');
  }

  /**
   * Validate Tier 2: DEVOS.md (Markdown).
   */
  private async validateTier2(
    workspacePath: string,
    staleMinutes: number,
  ): Promise<TierHealth> {
    const filePath = path.join(workspacePath, 'DEVOS.md');
    return this.validateFileExists(filePath, staleMinutes, 'Tier 2 (DEVOS.md)');
  }

  /**
   * Validate Tier 3: project-state.yaml (YAML).
   */
  private async validateTier3(
    workspacePath: string,
    staleMinutes: number,
  ): Promise<TierHealth> {
    const filePath = path.join(workspacePath, 'project-state.yaml');
    return this.validateYamlFile(filePath, staleMinutes, 'Tier 3 (project-state.yaml)');
  }

  // -- Private: File Validation Helpers ---------------------------------------

  /**
   * Validate a JSON file: exists, parseable, not stale.
   */
  private async validateJsonFile(
    filePath: string,
    staleMinutes: number,
    tierName: string,
  ): Promise<TierHealth> {
    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const lastModified = stat.mtime.toISOString();
      const sizeBytes = stat.size;
      const stale = this.isStale(stat.mtime, staleMinutes);

      // Try parsing JSON
      try {
        JSON.parse(content);
      } catch {
        return {
          valid: false,
          exists: true,
          lastModified,
          stale,
          sizeBytes,
          error: `${tierName}: Invalid JSON content`,
        };
      }

      return {
        valid: !stale,
        exists: true,
        lastModified,
        stale,
        sizeBytes,
        error: stale ? `${tierName}: File is stale (older than ${staleMinutes} minutes)` : null,
      };
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          valid: false,
          exists: false,
          lastModified: null,
          stale: true,
          sizeBytes: 0,
          error: `${tierName}: File not found`,
        };
      }
      return {
        valid: false,
        exists: false,
        lastModified: null,
        stale: true,
        sizeBytes: 0,
        error: `${tierName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate that a file exists and is not stale.
   */
  private async validateFileExists(
    filePath: string,
    staleMinutes: number,
    tierName: string,
  ): Promise<TierHealth> {
    try {
      const stat = await fs.stat(filePath);
      const lastModified = stat.mtime.toISOString();
      const sizeBytes = stat.size;
      const stale = this.isStale(stat.mtime, staleMinutes);

      return {
        valid: !stale,
        exists: true,
        lastModified,
        stale,
        sizeBytes,
        error: stale ? `${tierName}: File is stale (older than ${staleMinutes} minutes)` : null,
      };
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          valid: false,
          exists: false,
          lastModified: null,
          stale: true,
          sizeBytes: 0,
          error: `${tierName}: File not found`,
        };
      }
      return {
        valid: false,
        exists: false,
        lastModified: null,
        stale: true,
        sizeBytes: 0,
        error: `${tierName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate a YAML file: exists, parseable, not stale.
   */
  private async validateYamlFile(
    filePath: string,
    staleMinutes: number,
    tierName: string,
  ): Promise<TierHealth> {
    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const lastModified = stat.mtime.toISOString();
      const sizeBytes = stat.size;
      const stale = this.isStale(stat.mtime, staleMinutes);

      // Try parsing YAML
      try {
        yaml.load(content);
      } catch {
        return {
          valid: false,
          exists: true,
          lastModified,
          stale,
          sizeBytes,
          error: `${tierName}: Invalid YAML content`,
        };
      }

      return {
        valid: !stale,
        exists: true,
        lastModified,
        stale,
        sizeBytes,
        error: stale ? `${tierName}: File is stale (older than ${staleMinutes} minutes)` : null,
      };
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          valid: false,
          exists: false,
          lastModified: null,
          stale: true,
          sizeBytes: 0,
          error: `${tierName}: File not found`,
        };
      }
      return {
        valid: false,
        exists: false,
        lastModified: null,
        stale: true,
        sizeBytes: 0,
        error: `${tierName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // -- Private: Health Determination ------------------------------------------

  /**
   * Build human-readable issues array from tier health and Graphiti status.
   */
  private buildIssues(
    tier1: TierHealth,
    tier2: TierHealth,
    tier3: TierHealth,
    graphitiConnected: boolean,
  ): string[] {
    const issues: string[] = [];

    if (tier1.error) issues.push(tier1.error);
    if (tier2.error) issues.push(tier2.error);
    if (tier3.error) issues.push(tier3.error);
    if (!graphitiConnected) issues.push('Graphiti/Neo4j is disconnected');

    return issues;
  }

  /**
   * Determine overall health status.
   * - Critical if Tier 1 is missing or 2+ tiers are invalid
   * - Degraded if exactly 1 issue
   * - Healthy if no issues
   */
  private determineOverallHealth(
    tier1: TierHealth,
    tier2: TierHealth,
    tier3: TierHealth,
    graphitiConnected: boolean,
    issues: string[],
  ): OverallHealthStatus {
    // Tier 1 missing is immediately critical (most important tier)
    if (!tier1.exists) {
      return 'critical';
    }

    // Count number of problem areas
    const problemCount = issues.length;

    if (problemCount === 0) {
      return 'healthy';
    }

    if (problemCount >= 2) {
      return 'critical';
    }

    // Exactly 1 issue
    return 'degraded';
  }

  // -- Private: Staleness Check -----------------------------------------------

  /**
   * Check if a file modification time is older than the staleness threshold.
   */
  private isStale(mtime: Date, staleMinutes: number): boolean {
    const now = Date.now();
    const fileAge = now - mtime.getTime();
    const thresholdMs = staleMinutes * 60 * 1000;
    return fileAge > thresholdMs;
  }

  /**
   * Parse an integer from a string value, returning fallback if NaN.
   */
  private parseIntWithDefault(value: string, fallback: number): number {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  // -- Private: Cache ---------------------------------------------------------

  /**
   * Get cache key for a project's health.
   */
  private getCacheKey(projectId: string): string {
    return `context:health:${projectId}`;
  }

  /**
   * Get cached health result.
   */
  private async getCachedHealth(projectId: string): Promise<ContextHealth | null> {
    try {
      const key = this.getCacheKey(projectId);
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read health cache for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  /**
   * Cache health result with configured TTL.
   */
  private async cacheHealth(projectId: string, health: ContextHealth): Promise<void> {
    try {
      const key = this.getCacheKey(projectId);
      const ttl = this.parseIntWithDefault(
        this.configService.get<string>(
          'CONTEXT_HEALTH_CACHE_TTL_SECONDS',
          String(DEFAULT_CACHE_TTL_SECONDS),
        ),
        DEFAULT_CACHE_TTL_SECONDS,
      );
      await this.redisService.set(key, JSON.stringify(health), ttl);
    } catch (error) {
      this.logger.warn(
        `Failed to cache health for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
