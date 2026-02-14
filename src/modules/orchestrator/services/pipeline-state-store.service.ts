/**
 * PipelineStateStore Service
 * Story 11.1: Orchestrator State Machine Core
 *
 * Redis-based persistence layer for pipeline state contexts.
 * Provides distributed locking, fast state reads, and key management.
 */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  PipelineContext,
  PipelineState,
  TERMINAL_STATES,
} from '../interfaces/pipeline.interfaces';

/** Redis key prefixes */
const STATE_PREFIX = 'pipeline:state:';
const LOCK_PREFIX = 'pipeline:lock:';

/** TTL constants */
const ACTIVE_PIPELINE_TTL = 60 * 60 * 24 * 30; // 30 days for active pipelines (effectively no expiry)
const TERMINAL_PIPELINE_TTL = 60 * 60 * 24 * 7; // 7 days for completed/failed pipelines
const DEFAULT_LOCK_TTL = 30; // 30 seconds lock TTL

@Injectable()
export class PipelineStateStore {
  private readonly logger = new Logger(PipelineStateStore.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get the current pipeline context for a project.
   * @returns PipelineContext or null if no pipeline is active.
   */
  async getState(projectId: string): Promise<PipelineContext | null> {
    const key = `${STATE_PREFIX}${projectId}`;
    const raw = await this.redisService.get(key);

    if (!raw) {
      return null;
    }

    try {
      const context = JSON.parse(raw) as PipelineContext;
      // Restore Date objects from JSON strings
      context.stateEnteredAt = new Date(context.stateEnteredAt);
      context.createdAt = new Date(context.createdAt);
      context.updatedAt = new Date(context.updatedAt);
      return context;
    } catch (error) {
      this.logger.error(
        `Failed to parse pipeline state for project ${projectId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Store or update the pipeline context in Redis.
   * Terminal states (COMPLETE, FAILED) get a 7-day TTL; active states get 30-day TTL.
   */
  async setState(context: PipelineContext): Promise<void> {
    const key = `${STATE_PREFIX}${context.projectId}`;
    const ttl = TERMINAL_STATES.includes(context.currentState)
      ? TERMINAL_PIPELINE_TTL
      : ACTIVE_PIPELINE_TTL;

    const json = JSON.stringify(context);
    await this.redisService.set(key, json, ttl);
  }

  /**
   * Acquire a distributed lock for a project's pipeline.
   * Uses atomic SET NX EX via RedisService.setnx() to prevent race conditions.
   * Returns true if lock was acquired, false otherwise.
   *
   * @param projectId - Project to lock
   * @param ttlMs - Lock TTL in milliseconds (default: 30000ms)
   */
  async acquireLock(
    projectId: string,
    ttlMs: number = DEFAULT_LOCK_TTL * 1000,
  ): Promise<boolean> {
    const key = `${LOCK_PREFIX}${projectId}`;
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    const result = await this.redisService.setnx(key, 'locked', ttlSeconds);
    return result === 'OK';
  }

  /**
   * Release a distributed lock for a project's pipeline.
   */
  async releaseLock(projectId: string): Promise<void> {
    const key = `${LOCK_PREFIX}${projectId}`;
    await this.redisService.del(key);
  }

  /**
   * Force-release a lock (for crash recovery).
   */
  async forceReleaseLock(projectId: string): Promise<void> {
    await this.releaseLock(projectId);
    this.logger.warn(`Force-released lock for project ${projectId}`);
  }

  /**
   * List all active (non-terminal) pipelines for a workspace.
   */
  async listActivePipelines(
    workspaceId: string,
  ): Promise<PipelineContext[]> {
    const keys = await this.redisService.scanKeys(`${STATE_PREFIX}*`);
    const results: PipelineContext[] = [];

    for (const key of keys) {
      const raw = await this.redisService.get(key);
      if (!raw) continue;

      try {
        const context = JSON.parse(raw) as PipelineContext;
        // Filter: match workspace and exclude terminal states
        if (
          context.workspaceId === workspaceId &&
          !TERMINAL_STATES.includes(context.currentState)
        ) {
          context.stateEnteredAt = new Date(context.stateEnteredAt);
          context.createdAt = new Date(context.createdAt);
          context.updatedAt = new Date(context.updatedAt);
          results.push(context);
        }
      } catch {
        this.logger.warn(`Failed to parse pipeline state from key ${key}`);
      }
    }

    return results;
  }

  /**
   * List all pipeline keys in Redis (for recovery scanning).
   */
  async listAllPipelineKeys(): Promise<string[]> {
    return this.redisService.scanKeys(`${STATE_PREFIX}*`);
  }

  /**
   * List all lock keys in Redis (for orphaned lock detection).
   */
  async listAllLockKeys(): Promise<string[]> {
    return this.redisService.scanKeys(`${LOCK_PREFIX}*`);
  }

  /**
   * Extract projectId from a pipeline state Redis key.
   */
  extractProjectId(key: string): string {
    return key.replace(STATE_PREFIX, '');
  }

  /**
   * Extract projectId from a pipeline lock Redis key.
   */
  extractProjectIdFromLock(key: string): string {
    return key.replace(LOCK_PREFIX, '');
  }

  /**
   * Remove all Redis keys for a pipeline (state + lock).
   */
  async removePipeline(projectId: string): Promise<void> {
    await this.redisService.del(
      `${STATE_PREFIX}${projectId}`,
      `${LOCK_PREFIX}${projectId}`,
    );
  }
}
