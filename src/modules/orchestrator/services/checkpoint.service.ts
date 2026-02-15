/**
 * CheckpointService
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tracks execution checkpoints (git commits) for agent sessions.
 * Enables recovery from the last known good state rather than
 * restarting from scratch.
 *
 * Checkpoints are stored in Redis with the session ID as key.
 * When a session commits code and tests pass, a checkpoint is recorded.
 * On failure recovery, the session can be restarted from the last checkpoint.
 */
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/redis.service';
import {
  CreateCheckpointParams,
  Checkpoint,
  CHECKPOINT_TTL,
} from '../interfaces/failure-recovery.interfaces';

/** Redis key prefix for session checkpoints (sorted set with timestamp score) */
const CHECKPOINTS_PREFIX = 'pipeline:checkpoints:';

/** Redis key prefix for cross-session story checkpoints (latest checkpoint JSON) */
const STORY_CHECKPOINTS_PREFIX = 'pipeline:story-checkpoints:';

@Injectable()
export class CheckpointService {
  private readonly logger = new Logger(CheckpointService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Record a checkpoint (successful commit with passing tests).
   * Called by agent executors after a successful commit.
   */
  async createCheckpoint(params: CreateCheckpointParams): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      sessionId: params.sessionId,
      agentId: params.agentId,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      storyId: params.storyId,
      commitHash: params.commitHash,
      branch: params.branch,
      filesModified: params.filesModified,
      testsPassed: params.testsPassed,
      description: params.description,
      createdAt: new Date(),
    };

    const sessionKey = `${CHECKPOINTS_PREFIX}${params.sessionId}`;
    const storyKey = `${STORY_CHECKPOINTS_PREFIX}${params.workspaceId}:${params.storyId}`;
    const score = checkpoint.createdAt.getTime();
    const json = JSON.stringify(checkpoint);

    // Add to session sorted set (score = timestamp)
    await this.redisService.zadd(sessionKey, score, json);

    // Set TTL on the sorted set key
    await this.redisService.expire(sessionKey, CHECKPOINT_TTL);

    // Update cross-session story checkpoint reference
    await this.redisService.set(storyKey, json, CHECKPOINT_TTL);

    this.logger.log(
      `Checkpoint created for session ${params.sessionId}: ${params.commitHash} (${params.description})`,
    );

    return checkpoint;
  }

  /**
   * Get the latest checkpoint for a session.
   * Used by recovery to determine where to resume.
   */
  async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | null> {
    const key = `${CHECKPOINTS_PREFIX}${sessionId}`;

    // Get all members and take the last one (highest score = most recent)
    const members = await this.redisService.zrangebyscore(
      key,
      '-inf',
      '+inf',
    );

    if (!members || members.length === 0) {
      return null;
    }

    // Last entry is the most recent (sorted by score ascending)
    const latest = members[members.length - 1];
    try {
      const checkpoint = JSON.parse(latest) as Checkpoint;
      checkpoint.createdAt = new Date(checkpoint.createdAt);
      return checkpoint;
    } catch (error) {
      this.logger.error(
        `Failed to parse checkpoint for session ${sessionId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all checkpoints for a session (ordered by timestamp DESC).
   */
  async getSessionCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const key = `${CHECKPOINTS_PREFIX}${sessionId}`;

    const members = await this.redisService.zrangebyscore(
      key,
      '-inf',
      '+inf',
    );

    if (!members || members.length === 0) {
      return [];
    }

    // Parse and reverse to get DESC order (newest first)
    // Use spread to avoid mutating the original array in-place
    const checkpoints: Checkpoint[] = [];
    for (const member of [...members].reverse()) {
      try {
        const checkpoint = JSON.parse(member) as Checkpoint;
        checkpoint.createdAt = new Date(checkpoint.createdAt);
        checkpoints.push(checkpoint);
      } catch {
        this.logger.warn(`Failed to parse checkpoint entry in session ${sessionId}`);
      }
    }

    return checkpoints;
  }

  /**
   * Get the latest checkpoint for a story across all sessions.
   * Used when a new session is started for the same story after failure.
   */
  async getLatestStoryCheckpoint(params: {
    workspaceId: string;
    storyId: string;
  }): Promise<Checkpoint | null> {
    const key = `${STORY_CHECKPOINTS_PREFIX}${params.workspaceId}:${params.storyId}`;
    const raw = await this.redisService.get(key);

    if (!raw) {
      return null;
    }

    try {
      const checkpoint = JSON.parse(raw) as Checkpoint;
      checkpoint.createdAt = new Date(checkpoint.createdAt);
      return checkpoint;
    } catch (error) {
      this.logger.error(
        `Failed to parse story checkpoint for ${params.workspaceId}:${params.storyId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Delete checkpoints for a completed session (cleanup).
   * Note: story-level key is overwritten by new sessions, not deleted.
   */
  async deleteSessionCheckpoints(sessionId: string): Promise<void> {
    const key = `${CHECKPOINTS_PREFIX}${sessionId}`;
    await this.redisService.del(key);

    this.logger.log(`Deleted checkpoints for session ${sessionId}`);
  }
}
