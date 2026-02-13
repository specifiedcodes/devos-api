import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent } from '../../database/entities/agent.entity';
import {
  ContextSnapshot as ContextSnapshotEntity,
  ContextTier,
} from '../../database/entities/context-snapshot.entity';
import { RedisService } from '../redis/redis.service';

// Re-export ContextTier so existing consumers keep working
export { ContextTier } from '../../database/entities/context-snapshot.entity';

export interface ContextSnapshot {
  tier: ContextTier;
  timestamp: Date;
  agentId: string;
  context: Record<string, any>;
  size: number;
}

export interface ContextHealthResult {
  tier1Available: boolean;
  tier2Available: boolean;
  tier3Available: boolean;
  tier2SnapshotCount: number;
  tier3FileCount: number;
}

export interface DeleteContextResult {
  tier1Cleaned: boolean;
  tier2Deleted: number;
  tier3Cleaned: boolean;
}

/**
 * ContextRecoveryService
 * Story 5.7: Three-tier Context Recovery System
 *
 * Manages agent context across three tiers:
 * - Tier 1: Active context (Redis, <1MB, immediate access)
 * - Tier 2: Recent context (PostgreSQL, <10MB, fast retrieval)
 * - Tier 3: Archived context (file system, unlimited, slow retrieval)
 */
@Injectable()
export class ContextRecoveryService {
  private readonly logger = new Logger(ContextRecoveryService.name);

  // Tier boundaries
  private readonly TIER_1_MAX_SIZE = 1024 * 1024; // 1MB
  private readonly TIER_2_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly TIER_2_MAX_AGE_HOURS = 24;

  // Redis constants
  private readonly REDIS_KEY_PREFIX = 'agent:context:';
  private readonly TIER_1_TTL = 3600; // 1 hour in seconds

  // File system base directory
  private readonly baseDir: string;

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    @InjectRepository(ContextSnapshotEntity)
    private readonly snapshotRepository: Repository<ContextSnapshotEntity>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.baseDir = this.configService.get<string>(
      'CONTEXT_STORAGE_PATH',
      './data/agent-contexts',
    );
  }

  /**
   * Save agent context snapshot with automatic tier routing.
   *
   * Context <1MB:    Save to Tier 1 (Redis) AND Tier 2 (PostgreSQL)
   * Context 1-10MB:  Save to Tier 2 (PostgreSQL) only
   * Context >10MB:   Save to Tier 3 (file system), metadata-only snapshot in Tier 2
   */
  async saveContext(
    agentId: string,
    context: Record<string, any>,
  ): Promise<void> {
    const serialized = JSON.stringify(context);
    const size = serialized.length;
    const tier = this.determineTier(size);

    this.logger.log(
      `Saving context for agent ${agentId} to ${tier} (size: ${size} bytes)`,
    );

    switch (tier) {
      case ContextTier.TIER_1_ACTIVE:
        // Dual-write: Redis (speed) AND PostgreSQL (durability)
        await this.saveTier1(agentId, context);
        await this.saveTier2(agentId, context);
        break;
      case ContextTier.TIER_2_RECENT:
        await this.saveTier2(agentId, context);
        break;
      case ContextTier.TIER_3_ARCHIVED: {
        // Get next version once for both operations to prevent race condition
        const nextVersion = await this.getNextVersion(agentId);
        await this.saveTier3(agentId, context, nextVersion);
        // Create metadata-only snapshot in Tier 2 for tracking
        await this.saveTier2Metadata(agentId, size, nextVersion);
        break;
      }
    }
  }

  /**
   * Recover agent context with cascading tier lookup.
   *
   * Step 1: Try Tier 1 (Redis) - immediate if available
   * Step 2: Try Tier 2 (PostgreSQL) - if Tier 1 miss, promote result to Tier 1
   * Step 3: Try Tier 3 (file system) - if Tier 2 miss, promote to appropriate tier
   * Returns null only if all three tiers have no context for the agent.
   */
  async recoverContext(
    agentId: string,
  ): Promise<Record<string, any> | null> {
    const startTime = Date.now();
    this.logger.log(`Recovering context for agent ${agentId}`);

    // Try Tier 1 first (fastest)
    let context = await this.recoverTier1(agentId);
    if (context) {
      const latency = Date.now() - startTime;
      this.logger.log(
        `Context recovered from Tier 1 for agent ${agentId} (${latency}ms)`,
      );
      return context;
    }

    // Try Tier 2 (medium speed)
    context = await this.recoverTier2(agentId);
    if (context) {
      const latency = Date.now() - startTime;
      this.logger.log(
        `Context recovered from Tier 2 for agent ${agentId} (${latency}ms)`,
      );
      // Promote to Tier 1 for faster future access
      await this.saveTier1(agentId, context);
      return context;
    }

    // Try Tier 3 (slowest)
    context = await this.recoverTier3(agentId);
    if (context) {
      const latency = Date.now() - startTime;
      this.logger.log(
        `Context recovered from Tier 3 for agent ${agentId} (${latency}ms)`,
      );
      // Promote to appropriate tier based on size
      const size = JSON.stringify(context).length;
      if (size <= this.TIER_1_MAX_SIZE) {
        await this.saveTier1(agentId, context);
      } else if (size <= this.TIER_2_MAX_SIZE) {
        await this.saveTier2(agentId, context);
      }
      return context;
    }

    this.logger.warn(`No context found for agent ${agentId}`);
    return null;
  }

  /**
   * Archive old contexts from Tier 2 to Tier 3.
   *
   * Queries Tier 2 snapshots older than configurable age (default 24 hours),
   * moves context data to Tier 3 file storage, and updates snapshot records.
   */
  async archiveOldContexts(): Promise<number> {
    this.logger.log('Archiving old contexts from Tier 2 to Tier 3');

    const cutoffDate = new Date();
    cutoffDate.setHours(
      cutoffDate.getHours() - this.TIER_2_MAX_AGE_HOURS,
    );

    // Find snapshots in Tier 2 older than cutoff with actual context data
    // Uses database-level NOT NULL filter for efficiency instead of in-memory filtering
    const snapshotsWithData = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.tier = :tier', { tier: ContextTier.TIER_2_RECENT })
      .andWhere('snapshot.created_at < :cutoffDate', { cutoffDate })
      .andWhere('snapshot.context_data IS NOT NULL')
      .getMany();

    let archivedCount = 0;

    for (const snapshot of snapshotsWithData) {
      try {
        // Save context data to Tier 3 file
        const filePath = this.buildFilePath(
          snapshot.workspaceId,
          snapshot.agentId,
          snapshot.version,
        );
        await this.writeContextFile(
          filePath,
          snapshot.agentId,
          snapshot.workspaceId,
          snapshot.version,
          snapshot.contextData!,
          snapshot.sizeBytes,
        );

        // Update snapshot: clear context_data, set tier, store file path
        await this.snapshotRepository.save({
          ...snapshot,
          tier: ContextTier.TIER_3_ARCHIVED,
          contextData: null,
          metadata: {
            ...(snapshot.metadata || {}),
            archivedAt: new Date().toISOString(),
            filePath,
          },
        });

        archivedCount++;
      } catch (error: any) {
        this.logger.error(
          `Failed to archive snapshot ${snapshot.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Archived ${archivedCount} context snapshots`);
    return archivedCount;
  }

  /**
   * Delete context for an agent across all three tiers.
   *
   * Used when agent is terminated or permanently deleted.
   */
  async deleteContext(agentId: string, workspaceId?: string): Promise<DeleteContextResult> {
    this.logger.log(`Deleting all context for agent ${agentId}`);

    const result: DeleteContextResult = {
      tier1Cleaned: false,
      tier2Deleted: 0,
      tier3Cleaned: false,
    };

    // Tier 1: Delete Redis key
    try {
      const key = `${this.REDIS_KEY_PREFIX}${agentId}`;
      await this.redisService.del(key);
      result.tier1Cleaned = true;
    } catch (error: any) {
      this.logger.warn(
        `Failed to delete Tier 1 context for agent ${agentId}: ${error.message}`,
      );
    }

    // Tier 2: Delete all snapshots
    try {
      const deleteResult = await this.snapshotRepository.delete({
        agentId,
      });
      result.tier2Deleted = deleteResult.affected || 0;
    } catch (error: any) {
      this.logger.warn(
        `Failed to delete Tier 2 context for agent ${agentId}: ${error.message}`,
      );
    }

    // Tier 3: Delete file system directory
    try {
      // Look up agent to get workspaceId for directory path, fall back to provided workspaceId
      let resolvedWorkspaceId = workspaceId;
      if (!resolvedWorkspaceId) {
        const agent = await this.agentRepository.findOne({
          where: { id: agentId },
          select: ['id', 'workspaceId'],
        });
        resolvedWorkspaceId = agent?.workspaceId;
      }

      if (resolvedWorkspaceId) {
        const dirPath = path.join(
          this.baseDir,
          resolvedWorkspaceId,
          agentId,
        );
        await fs.rm(dirPath, { recursive: true, force: true });
        result.tier3Cleaned = true;
      } else {
        this.logger.warn(
          `Cannot determine workspaceId for agent ${agentId}, Tier 3 files may be orphaned`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to delete Tier 3 context for agent ${agentId}: ${error.message}`,
      );
    }

    this.logger.log(
      `Context cleanup for agent ${agentId}: Tier1=${result.tier1Cleaned}, Tier2=${result.tier2Deleted} deleted, Tier3=${result.tier3Cleaned}`,
    );
    return result;
  }

  /**
   * Get context health metrics for an agent.
   * Returns which tiers have context available.
   */
  async getContextHealth(agentId: string): Promise<ContextHealthResult> {
    const result: ContextHealthResult = {
      tier1Available: false,
      tier2Available: false,
      tier3Available: false,
      tier2SnapshotCount: 0,
      tier3FileCount: 0,
    };

    // Check Tier 1: Redis key exists
    try {
      const key = `${this.REDIS_KEY_PREFIX}${agentId}`;
      const data = await this.redisService.get(key);
      result.tier1Available = data !== null;
    } catch {
      // Redis unavailable
    }

    // Check Tier 2: Any snapshots for agent
    try {
      const snapshots = await this.snapshotRepository.find({
        where: { agentId },
        select: ['id'],
      });
      result.tier2SnapshotCount = snapshots.length;
      result.tier2Available = snapshots.length > 0;
    } catch {
      // DB error
    }

    // Check Tier 3: Any files for agent
    try {
      const agent = await this.agentRepository.findOne({
        where: { id: agentId },
        select: ['id', 'workspaceId'],
      });

      if (agent) {
        const dirPath = path.join(
          this.baseDir,
          agent.workspaceId,
          agentId,
        );
        const files = await fs.readdir(dirPath);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));
        result.tier3FileCount = jsonFiles.length;
        result.tier3Available = jsonFiles.length > 0;
      }
    } catch {
      // Directory doesn't exist or read error
    }

    return result;
  }

  /**
   * Determine which tier to use based on context size.
   */
  determineTier(size: number): ContextTier {
    if (size <= this.TIER_1_MAX_SIZE) {
      return ContextTier.TIER_1_ACTIVE;
    } else if (size <= this.TIER_2_MAX_SIZE) {
      return ContextTier.TIER_2_RECENT;
    } else {
      return ContextTier.TIER_3_ARCHIVED;
    }
  }

  // ===== Tier 1: Redis Storage (Active Contexts) =====

  /**
   * Save context to Redis with TTL.
   * Graceful degradation: logs warning if Redis is unavailable.
   */
  async saveTier1(
    agentId: string,
    context: Record<string, any>,
  ): Promise<void> {
    try {
      const key = `${this.REDIS_KEY_PREFIX}${agentId}`;
      const serialized = JSON.stringify(context);

      // Validate size
      if (serialized.length > this.TIER_1_MAX_SIZE) {
        this.logger.warn(
          `Context too large for Tier 1 (${serialized.length} bytes), skipping Redis save`,
        );
        return;
      }

      await this.redisService.set(key, serialized, this.TIER_1_TTL);
      this.logger.debug(
        `Tier 1 save: agent ${agentId}, size ${serialized.length} bytes, TTL ${this.TIER_1_TTL}s`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Tier 1 save failed for agent ${agentId}: ${error.message}`,
      );
      // Graceful degradation: don't throw
    }
  }

  /**
   * Recover context from Redis.
   * Returns null if key not found or expired.
   */
  async recoverTier1(
    agentId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const key = `${this.REDIS_KEY_PREFIX}${agentId}`;
      const data = await this.redisService.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as Record<string, any>;
    } catch (error: any) {
      this.logger.warn(
        `Tier 1 recover failed for agent ${agentId}: ${error.message}`,
      );
      return null;
    }
  }

  // ===== Tier 2: PostgreSQL Storage (Recent Contexts) =====

  /**
   * Save context to PostgreSQL as a versioned snapshot.
   * Also updates agent.context column for backward compatibility.
   */
  async saveTier2(
    agentId: string,
    context: Record<string, any>,
  ): Promise<void> {
    const agent = await this.agentRepository.findOne({
      where: { id: agentId },
      select: ['id', 'workspaceId'],
    });

    if (!agent) {
      this.logger.warn(
        `Agent ${agentId} not found, cannot save to Tier 2`,
      );
      return;
    }

    // Get next version number
    const latestSnapshot = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.agent_id = :agentId', { agentId })
      .orderBy('snapshot.version', 'DESC')
      .select('snapshot.version')
      .getOne();

    const nextVersion = latestSnapshot ? latestSnapshot.version + 1 : 1;
    const serialized = JSON.stringify(context);
    const sizeBytes = serialized.length;

    // Create snapshot record
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + this.TIER_2_MAX_AGE_HOURS,
    );

    await this.snapshotRepository.save({
      agentId,
      workspaceId: agent.workspaceId,
      tier: ContextTier.TIER_2_RECENT,
      contextData: context,
      sizeBytes,
      version: nextVersion,
      metadata: null,
      expiresAt,
    });

    // Update agent.context column for backward compatibility
    await this.agentRepository.update(agentId, { context });

    this.logger.debug(
      `Tier 2 save: agent ${agentId}, version ${nextVersion}, size ${sizeBytes} bytes`,
    );
  }

  /**
   * Save metadata-only snapshot to Tier 2 for tracking Tier 3 data.
   */
  private async saveTier2Metadata(
    agentId: string,
    sizeBytes: number,
    precomputedVersion?: number,
  ): Promise<void> {
    const agent = await this.agentRepository.findOne({
      where: { id: agentId },
      select: ['id', 'workspaceId'],
    });

    if (!agent) {
      return;
    }

    // Use precomputed version if provided (prevents race condition with saveTier3)
    const nextVersion = precomputedVersion ?? await this.getNextVersion(agentId);

    await this.snapshotRepository.save({
      agentId,
      workspaceId: agent.workspaceId,
      tier: ContextTier.TIER_3_ARCHIVED,
      contextData: null,
      sizeBytes,
      version: nextVersion,
      metadata: {
        storedInTier3: true,
        filePath: this.buildFilePath(
          agent.workspaceId,
          agentId,
          nextVersion,
        ),
      },
    });
  }

  /**
   * Recover context from PostgreSQL.
   * Returns most recent snapshot with context data, falls back to agent.context.
   */
  async recoverTier2(
    agentId: string,
  ): Promise<Record<string, any> | null> {
    try {
      // Try to find most recent snapshot with actual context data
      const snapshot = await this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.agent_id = :agentId', { agentId })
        .andWhere('snapshot.context_data IS NOT NULL')
        .orderBy('snapshot.version', 'DESC')
        .getOne();

      if (snapshot?.contextData) {
        return snapshot.contextData;
      }

      // Fallback: read from agent.context column (backward compatibility)
      const agent = await this.agentRepository.findOne({
        where: { id: agentId },
        select: ['id', 'context'],
      });

      return agent?.context || null;
    } catch (error: any) {
      this.logger.warn(
        `Tier 2 recover failed for agent ${agentId}: ${error.message}`,
      );
      return null;
    }
  }

  // ===== Tier 3: File System Storage (Archived Contexts) =====

  /**
   * Save context to file system.
   * File path: {baseDir}/{workspaceId}/{agentId}/{version}.json
   */
  async saveTier3(
    agentId: string,
    context: Record<string, any>,
    precomputedVersion?: number,
  ): Promise<void> {
    try {
      const agent = await this.agentRepository.findOne({
        where: { id: agentId },
        select: ['id', 'workspaceId'],
      });

      if (!agent) {
        this.logger.warn(
          `Agent ${agentId} not found, cannot save to Tier 3`,
        );
        return;
      }

      // Use precomputed version if provided (prevents race condition with saveTier2Metadata)
      const version = precomputedVersion ?? await this.getNextVersion(agentId);
      const filePath = this.buildFilePath(
        agent.workspaceId,
        agentId,
        version,
      );
      const serialized = JSON.stringify(context);

      await this.writeContextFile(
        filePath,
        agentId,
        agent.workspaceId,
        version,
        context,
        serialized.length,
      );

      this.logger.debug(
        `Tier 3 save: agent ${agentId}, version ${version}, path ${filePath}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Tier 3 save failed for agent ${agentId}: ${error.message}`,
      );
    }
  }

  /**
   * Recover context from file system.
   * Reads the most recent file for the agent.
   */
  async recoverTier3(
    agentId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const agent = await this.agentRepository.findOne({
        where: { id: agentId },
        select: ['id', 'workspaceId'],
      });

      if (!agent) {
        return null;
      }

      const dirPath = path.join(
        this.baseDir,
        agent.workspaceId,
        agentId,
      );

      let files: string[];
      try {
        files = await fs.readdir(dirPath);
      } catch {
        // Directory doesn't exist
        return null;
      }

      // Filter JSON files and sort by version (descending)
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort((a, b) => {
          const versionA = parseInt(a.replace('.json', ''), 10);
          const versionB = parseInt(b.replace('.json', ''), 10);
          return versionB - versionA;
        });

      if (jsonFiles.length === 0) {
        return null;
      }

      // Read most recent file
      const latestFile = path.join(dirPath, jsonFiles[0]);
      const fileContent = await fs.readFile(latestFile, 'utf-8');
      const parsed = JSON.parse(fileContent);

      // The file contains a wrapper with metadata; extract context data
      const contextData = parsed.contextData || parsed;

      // Validate recovered context is not empty
      if (!contextData || Object.keys(contextData).length === 0) {
        this.logger.warn(`Tier 3 file for agent ${agentId} contains empty context`);
        return null;
      }

      return contextData;
    } catch (error: any) {
      this.logger.warn(
        `Tier 3 recover failed for agent ${agentId}: ${error.message}`,
      );
      return null;
    }
  }

  // ===== Private Helpers =====

  /**
   * Get next version number for an agent's context snapshots.
   * Centralizes version incrementing to prevent race conditions
   * when multiple tier operations need the same version.
   */
  private async getNextVersion(agentId: string): Promise<number> {
    const latestSnapshot = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.agent_id = :agentId', { agentId })
      .orderBy('snapshot.version', 'DESC')
      .select('snapshot.version')
      .getOne();

    return latestSnapshot ? latestSnapshot.version + 1 : 1;
  }

  /**
   * Build file path for Tier 3 storage.
   */
  private buildFilePath(
    workspaceId: string,
    agentId: string,
    version: number,
  ): string {
    return path.join(
      this.baseDir,
      workspaceId,
      agentId,
      `${version}.json`,
    );
  }

  /**
   * Write a context JSON file with metadata header.
   */
  private async writeContextFile(
    filePath: string,
    agentId: string,
    workspaceId: string,
    version: number,
    contextData: Record<string, any>,
    sizeBytes: number,
  ): Promise<void> {
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });

    const fileContent = {
      agentId,
      workspaceId,
      version,
      tier: ContextTier.TIER_3_ARCHIVED,
      timestamp: new Date().toISOString(),
      sizeBytes,
      contextData,
    };

    await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), 'utf-8');
  }
}
