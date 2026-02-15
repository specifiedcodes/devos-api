/**
 * StoryDependencyManager Service
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Manages story dependencies using Redis for fast lookups.
 * Supports:
 * - Adding dependencies between stories
 * - Circular dependency detection
 * - Checking which stories are blocked
 * - Marking stories as complete and unblocking dependents
 * - Building complete dependency graphs
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import {
  StoryDependencyGraph,
  StoryDependencyNode,
  StoryUnblockedEvent,
  CircularDependencyError,
  HANDOFF_DATA_TTL,
} from '../interfaces/handoff.interfaces';

/** Redis key patterns */
const DEPS_PREFIX = 'pipeline:deps:';
const REVERSE_DEPS_PREFIX = 'pipeline:reverse-deps:';
const STORY_STATUS_PREFIX = 'pipeline:story-status:';

@Injectable()
export class StoryDependencyManagerService {
  private readonly logger = new Logger(StoryDependencyManagerService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register a dependency between two stories.
   * Story (storyId) depends on (dependsOnStoryId).
   * Checks for circular dependencies before storing.
   */
  async addDependency(params: {
    workspaceId: string;
    storyId: string;
    dependsOnStoryId: string;
  }): Promise<void> {
    const { workspaceId, storyId, dependsOnStoryId } = params;

    // Check for circular dependency
    const isCircular = await this.wouldCreateCircle(
      workspaceId,
      storyId,
      dependsOnStoryId,
    );
    if (isCircular) {
      throw new CircularDependencyError(storyId, dependsOnStoryId);
    }

    // Load existing dependencies
    const depsKey = `${DEPS_PREFIX}${workspaceId}:${storyId}`;
    const existing = await this.getDependencies(workspaceId, storyId);

    // Add new dependency if not already present
    if (!existing.includes(dependsOnStoryId)) {
      existing.push(dependsOnStoryId);
    }

    // Store updated dependencies
    await this.redisService.set(
      depsKey,
      JSON.stringify(existing),
      HANDOFF_DATA_TTL,
    );

    // Maintain reverse dependency index for efficient lookup
    const reverseDepsKey = `${REVERSE_DEPS_PREFIX}${workspaceId}:${dependsOnStoryId}`;
    const existingReverse = await this.getReverseDependencies(
      workspaceId,
      dependsOnStoryId,
    );
    if (!existingReverse.includes(storyId)) {
      existingReverse.push(storyId);
    }
    await this.redisService.set(
      reverseDepsKey,
      JSON.stringify(existingReverse),
      HANDOFF_DATA_TTL,
    );

    this.logger.debug(
      `Added dependency: ${storyId} depends on ${dependsOnStoryId} (workspace: ${workspaceId})`,
    );
  }

  /**
   * Check if a story has unresolved dependencies.
   * Returns list of blocking story IDs (incomplete dependencies).
   */
  async getBlockingStories(params: {
    workspaceId: string;
    storyId: string;
  }): Promise<string[]> {
    const { workspaceId, storyId } = params;
    const dependencies = await this.getDependencies(workspaceId, storyId);

    const blocking: string[] = [];
    for (const depStoryId of dependencies) {
      const isComplete = await this.isStoryComplete(workspaceId, depStoryId);
      if (!isComplete) {
        blocking.push(depStoryId);
      }
    }

    return blocking;
  }

  /**
   * Mark a story as complete and unblock dependent stories.
   * Emits events for each newly unblocked story.
   * Returns list of newly unblocked story IDs.
   */
  async markStoryComplete(params: {
    workspaceId: string;
    storyId: string;
  }): Promise<string[]> {
    const { workspaceId, storyId } = params;

    // Mark story as complete in Redis
    const statusKey = `${STORY_STATUS_PREFIX}${workspaceId}:${storyId}`;
    await this.redisService.set(statusKey, 'complete', HANDOFF_DATA_TTL);

    this.logger.debug(
      `Marked story ${storyId} as complete (workspace: ${workspaceId})`,
    );

    // Find all stories that depend on this one
    const dependentStories = await this.findDependentStories(
      workspaceId,
      storyId,
    );

    const newlyUnblocked: string[] = [];

    // Check each dependent: is it now fully unblocked?
    for (const depStoryId of dependentStories) {
      const blocking = await this.getBlockingStories({
        workspaceId,
        storyId: depStoryId,
      });

      if (blocking.length === 0) {
        newlyUnblocked.push(depStoryId);

        // Emit unblocked event
        const event: StoryUnblockedEvent = {
          type: 'orchestrator:story_unblocked',
          workspaceId,
          storyId: depStoryId,
          previouslyBlockedBy: [storyId],
          timestamp: new Date(),
        };
        this.eventEmitter.emit('orchestrator:story_unblocked', event);
      }
    }

    if (newlyUnblocked.length > 0) {
      this.logger.log(
        `Story ${storyId} completion unblocked: ${newlyUnblocked.join(', ')}`,
      );
    }

    return newlyUnblocked;
  }

  /**
   * Get all dependencies for a workspace as a dependency graph.
   */
  async getDependencyGraph(
    workspaceId: string,
  ): Promise<StoryDependencyGraph> {
    const stories = new Map<string, StoryDependencyNode>();
    const blockedStories: string[] = [];
    const unblockedStories: string[] = [];

    // Scan for all dependency keys in this workspace
    const depsKeys = await this.redisService.scanKeys(
      `${DEPS_PREFIX}${workspaceId}:*`,
    );

    for (const key of depsKeys) {
      const storyId = key.replace(`${DEPS_PREFIX}${workspaceId}:`, '');
      const dependencies = await this.getDependencies(workspaceId, storyId);
      const blocking = await this.getBlockingStories({
        workspaceId,
        storyId,
      });
      const isComplete = await this.isStoryComplete(workspaceId, storyId);

      const node: StoryDependencyNode = {
        storyId,
        dependsOn: dependencies,
        blockedBy: blocking,
        status: isComplete
          ? 'complete'
          : blocking.length > 0
            ? 'pending'
            : 'in-progress',
      };

      stories.set(storyId, node);

      if (blocking.length > 0) {
        blockedStories.push(storyId);
      } else if (!isComplete) {
        unblockedStories.push(storyId);
      }
    }

    return {
      stories,
      blockedStories,
      unblockedStories,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Get the dependency array for a story from Redis.
   */
  private async getDependencies(
    workspaceId: string,
    storyId: string,
  ): Promise<string[]> {
    const key = `${DEPS_PREFIX}${workspaceId}:${storyId}`;
    const raw = await this.redisService.get(key);
    if (!raw) return [];

    try {
      return JSON.parse(raw) as string[];
    } catch {
      this.logger.warn(
        `Failed to parse dependencies for ${storyId} in workspace ${workspaceId}`,
      );
      return [];
    }
  }

  /**
   * Check if a story is marked as complete.
   */
  private async isStoryComplete(
    workspaceId: string,
    storyId: string,
  ): Promise<boolean> {
    const key = `${STORY_STATUS_PREFIX}${workspaceId}:${storyId}`;
    const status = await this.redisService.get(key);
    return status === 'complete';
  }

  /**
   * Find all stories that depend on the given storyId.
   * Uses the reverse dependency index for O(1) lookup instead of full scan.
   * Falls back to scan if reverse index is missing (backward compatible).
   */
  private async findDependentStories(
    workspaceId: string,
    storyId: string,
  ): Promise<string[]> {
    // Try reverse index first (O(1) lookup)
    const reverseResult = await this.getReverseDependencies(
      workspaceId,
      storyId,
    );
    if (reverseResult.length > 0) {
      return reverseResult;
    }

    // Fallback to scan if reverse index is not populated
    const depsKeys = await this.redisService.scanKeys(
      `${DEPS_PREFIX}${workspaceId}:*`,
    );

    const dependents: string[] = [];

    for (const key of depsKeys) {
      const depStoryId = key.replace(`${DEPS_PREFIX}${workspaceId}:`, '');
      const raw = await this.redisService.get(key);
      if (!raw) continue;

      try {
        const deps = JSON.parse(raw) as string[];
        if (deps.includes(storyId)) {
          dependents.push(depStoryId);
        }
      } catch {
        continue;
      }
    }

    return dependents;
  }

  /**
   * Get the reverse dependency array for a story from Redis.
   * Returns stories that depend ON the given storyId.
   */
  private async getReverseDependencies(
    workspaceId: string,
    storyId: string,
  ): Promise<string[]> {
    const key = `${REVERSE_DEPS_PREFIX}${workspaceId}:${storyId}`;
    const raw = await this.redisService.get(key);
    if (!raw) return [];

    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Check if adding a dependency would create a circular reference.
   * Uses BFS to traverse the dependency graph from dependsOnStoryId.
   * If we reach storyId during traversal, it's circular.
   */
  private async wouldCreateCircle(
    workspaceId: string,
    storyId: string,
    dependsOnStoryId: string,
  ): Promise<boolean> {
    // If storyId depends on dependsOnStoryId, check if dependsOnStoryId
    // (transitively) depends on storyId
    const visited = new Set<string>();
    const queue = [dependsOnStoryId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === storyId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get dependencies of the current node
      const deps = await this.getDependencies(workspaceId, current);
      queue.push(...deps);
    }

    return false;
  }
}
