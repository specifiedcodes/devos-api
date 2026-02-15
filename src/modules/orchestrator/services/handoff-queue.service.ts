/**
 * HandoffQueueService
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Manages the handoff queue when max parallel agents are reached.
 * Uses Redis sorted sets for priority-based queue management.
 * Lower priority score = higher priority (processed first).
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/redis.service';
import {
  HandoffParams,
  QueuedHandoff,
  HANDOFF_CHAIN,
  HANDOFF_DATA_TTL,
} from '../interfaces/handoff.interfaces';

/** Redis sorted set key pattern for handoff queues */
const QUEUE_PREFIX = 'pipeline:handoff-queue:';

@Injectable()
export class HandoffQueueService {
  private readonly logger = new Logger(HandoffQueueService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Enqueue a handoff to be processed when agent capacity is available.
   * Uses a Redis sorted set with priority as score (lower = higher priority).
   * Returns the unique handoff ID.
   */
  async enqueueHandoff(params: {
    workspaceId: string;
    handoff: HandoffParams;
    priority: number;
  }): Promise<string> {
    const { workspaceId, handoff, priority } = params;
    const handoffId = uuidv4();
    const queueKey = `${QUEUE_PREFIX}${workspaceId}`;

    // Determine the next agent type from the handoff chain
    const chainEntry = HANDOFF_CHAIN[handoff.completingAgentType];
    const nextAgentType = chainEntry?.toAgentType || handoff.completingAgentType;

    const queueEntry: QueuedHandoff = {
      id: handoffId,
      storyId: handoff.storyId,
      toAgentType: nextAgentType,
      priority,
      queuedAt: new Date(),
      estimatedWait: 0,
      handoffParams: handoff,
    };

    const member = JSON.stringify(queueEntry);
    await this.redisService.zadd(queueKey, priority, member);

    this.logger.log(
      `Enqueued handoff ${handoffId} for story ${handoff.storyId} with priority ${priority} (workspace: ${workspaceId})`,
    );

    return handoffId;
  }

  /**
   * Process the next queued handoff when an agent slot becomes available.
   * Pops the lowest-score member from the sorted set (highest priority).
   * Uses ZRANGEBYSCORE + ZREM by specific member to avoid race conditions
   * with the previous score-range-based removal approach.
   * Returns the handoff params or null if queue is empty.
   */
  async processNextInQueue(
    workspaceId: string,
  ): Promise<HandoffParams | null> {
    const queueKey = `${QUEUE_PREFIX}${workspaceId}`;

    // Get the lowest-score member (highest priority)
    const members = await this.redisService.zrangebyscore(
      queueKey,
      '-inf',
      '+inf',
    );

    if (!members || members.length === 0) {
      return null;
    }

    // Take the first member (lowest score = highest priority)
    const firstMember = members[0];

    try {
      const queueEntry = JSON.parse(firstMember) as QueuedHandoff;

      // Remove the specific member by value (not by score range)
      // This avoids accidentally removing other entries with the same priority
      await this.redisService.zrem(queueKey, firstMember);

      this.logger.log(
        `Processing queued handoff ${queueEntry.id} for story ${queueEntry.storyId} (workspace: ${workspaceId})`,
      );

      return queueEntry.handoffParams;
    } catch (error) {
      this.logger.error(
        `Failed to parse queued handoff for workspace ${workspaceId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get the current queue depth for a workspace.
   * Uses ZCARD for O(1) cardinality check instead of fetching all members.
   */
  async getQueueDepth(workspaceId: string): Promise<number> {
    const queueKey = `${QUEUE_PREFIX}${workspaceId}`;
    return this.redisService.zcard(queueKey);
  }

  /**
   * Get all queued handoffs for a workspace, sorted by priority.
   */
  async getQueuedHandoffs(workspaceId: string): Promise<QueuedHandoff[]> {
    const queueKey = `${QUEUE_PREFIX}${workspaceId}`;
    const members = await this.redisService.zrangebyscore(
      queueKey,
      '-inf',
      '+inf',
    );

    if (!members || members.length === 0) {
      return [];
    }

    const handoffs: QueuedHandoff[] = [];
    for (const member of members) {
      try {
        const entry = JSON.parse(member) as QueuedHandoff;
        handoffs.push(entry);
      } catch {
        this.logger.warn(
          `Failed to parse queued handoff entry for workspace ${workspaceId}`,
        );
      }
    }

    return handoffs;
  }
}
