/**
 * PriorityQueueService
 * Story 9.8: Agent Response Time Optimization
 *
 * BullMQ-based priority queue with lanes and dynamic priority adjustment.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

/**
 * Priority levels (lower number = higher priority in BullMQ)
 */
export enum PriorityLevel {
  CRITICAL = 1,
  HIGH = 20,
  NORMAL = 50,
  LOW = 80,
  BATCH = 100,
}

/**
 * Request types that map to priorities
 */
export type RequestType =
  | 'system_check'
  | 'direct_chat'
  | 'status_query'
  | 'task_update'
  | 'bulk_report'
  | 'background_task';

/**
 * Agent request structure
 */
export interface AgentRequest {
  id: string;
  type: RequestType;
  workspaceId: string;
  agentId: string;
  userId: string;
  data: any;
  createdAt: Date;
  priority?: PriorityLevel;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  totalPending: number;
  byPriority: Record<string, number>;
  averageWaitTime: number;
  estimatedProcessTime: number;
  processingRate: number;
}

/**
 * Lane statistics
 */
export interface LaneStats {
  pending: number;
  active: number;
  weight: number;
  maxConcurrent: number;
}

/**
 * Priority rules configuration
 */
const PRIORITY_RULES: Record<RequestType, PriorityLevel> = {
  system_check: PriorityLevel.CRITICAL,
  direct_chat: PriorityLevel.HIGH,
  status_query: PriorityLevel.HIGH,
  task_update: PriorityLevel.NORMAL,
  bulk_report: PriorityLevel.LOW,
  background_task: PriorityLevel.BATCH,
};

/**
 * Dynamic priority configuration
 */
const DYNAMIC_PRIORITY_CONFIG = {
  ageBoostPerSecond: 1,
  maxAgeBoost: 30,
  vipBoost: 20,
};

/**
 * Lane configuration
 */
const LANE_CONFIG: Record<string, { weight: number; maxConcurrent: number }> = {
  CRITICAL: { weight: 4, maxConcurrent: 5 },
  HIGH: { weight: 3, maxConcurrent: 10 },
  NORMAL: { weight: 2, maxConcurrent: 15 },
  LOW: { weight: 1, maxConcurrent: 5 },
};

@Injectable()
export class PriorityQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(PriorityQueueService.name);
  private readonly queue: Queue;
  private vipUsers: Set<string> = new Set();
  private readonly QUEUE_NAME = 'agent-requests-priority';

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    // Initialize BullMQ queue with Redis connection
    this.queue = new Queue(this.QUEUE_NAME, {
      connection: {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    });

    this.logger.log(`Priority queue initialized: ${this.QUEUE_NAME}`);
  }

  /**
   * Calculate base priority from request type
   */
  calculatePriority(request: AgentRequest): PriorityLevel {
    return PRIORITY_RULES[request.type] || PriorityLevel.NORMAL;
  }

  /**
   * Apply dynamic priority adjustments based on age and VIP status
   */
  applyDynamicPriority(request: AgentRequest, basePriority: PriorityLevel): number {
    let adjustedPriority = basePriority;

    // Age-based boost (older requests get higher priority)
    const ageSeconds = (Date.now() - new Date(request.createdAt).getTime()) / 1000;
    const ageBoost = Math.min(
      Math.floor(ageSeconds * DYNAMIC_PRIORITY_CONFIG.ageBoostPerSecond),
      DYNAMIC_PRIORITY_CONFIG.maxAgeBoost,
    );
    adjustedPriority -= ageBoost; // Lower number = higher priority

    // VIP user boost
    if (this.vipUsers.has(request.userId)) {
      adjustedPriority -= DYNAMIC_PRIORITY_CONFIG.vipBoost;
    }

    // Ensure priority doesn't go below 1 (highest)
    return Math.max(1, adjustedPriority);
  }

  /**
   * Set list of VIP users for priority boost
   */
  setVipUsers(userIds: string[]): void {
    this.vipUsers = new Set(userIds);
    this.logger.log(`VIP users updated: ${userIds.length} users`);
  }

  /**
   * Enqueue a request with priority
   */
  async enqueue(request: AgentRequest, overridePriority?: PriorityLevel): Promise<string> {
    const basePriority = overridePriority || this.calculatePriority(request);
    const finalPriority = this.applyDynamicPriority(request, basePriority);

    const jobOptions: JobsOptions = {
      priority: finalPriority,
      jobId: `${request.type}:${request.id}`,
      lifo: basePriority === PriorityLevel.CRITICAL, // LIFO for critical
    };

    const job = await this.queue.add(request.type, request, jobOptions);

    this.logger.debug(
      `Enqueued request ${request.id} (type: ${request.type}, priority: ${finalPriority})`,
    );

    // Track metrics
    await this.recordEnqueue(request.type, finalPriority);

    return job.id!;
  }

  /**
   * Requeue a job with new priority
   */
  async requeue(jobId: string, newPriority: PriorityLevel): Promise<void> {
    const jobs = await this.queue.getJobs(['waiting', 'delayed']);
    const job = jobs.find((j) => j.id === jobId);

    if (!job) {
      this.logger.warn(`Job ${jobId} not found for requeue`);
      return;
    }

    // Remove old job and add with new priority
    await job.remove();

    const request = job.data as AgentRequest;
    await this.queue.add(request.type, request, {
      priority: newPriority,
      jobId: `${request.type}:${request.id}:requeued`,
    });

    this.logger.log(`Requeued job ${jobId} with priority ${newPriority}`);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    const counts = await this.queue.getJobCounts();
    const byPriority = await this.getPendingByPriority();

    // Calculate average wait time from recent jobs
    const completedJobs = await this.queue.getJobs(['completed'], 0, 100);
    let totalWaitTime = 0;
    let waitTimeCount = 0;

    for (const job of completedJobs) {
      if (job.processedOn && job.timestamp) {
        totalWaitTime += job.processedOn - job.timestamp;
        waitTimeCount++;
      }
    }

    const averageWaitTime = waitTimeCount > 0 ? totalWaitTime / waitTimeCount : 0;

    // Calculate processing rate (jobs per second)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentCompleted = completedJobs.filter(
      (j) => j.finishedOn && j.finishedOn > oneMinuteAgo,
    ).length;
    const processingRate = recentCompleted / 60;

    // Estimate processing time
    const estimatedProcessTime =
      processingRate > 0 ? (counts.waiting + counts.active) / processingRate : 0;

    return {
      totalPending: counts.waiting + counts.active,
      byPriority,
      averageWaitTime,
      estimatedProcessTime,
      processingRate,
    };
  }

  /**
   * Get count of pending jobs by priority level
   */
  async getPendingByPriority(): Promise<Record<string, number>> {
    const jobs = await this.queue.getJobs(['waiting']);
    const counts: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      NORMAL: 0,
      LOW: 0,
      BATCH: 0,
    };

    for (const job of jobs) {
      const request = job.data as AgentRequest;
      const priority = this.calculatePriority(request);

      if (priority <= PriorityLevel.CRITICAL) {
        counts.CRITICAL++;
      } else if (priority <= PriorityLevel.HIGH) {
        counts.HIGH++;
      } else if (priority <= PriorityLevel.NORMAL) {
        counts.NORMAL++;
      } else if (priority <= PriorityLevel.LOW) {
        counts.LOW++;
      } else {
        counts.BATCH++;
      }
    }

    return counts;
  }

  /**
   * Get statistics for each priority lane
   */
  async getLaneStats(): Promise<Record<string, LaneStats>> {
    const pending = await this.getPendingByPriority();
    const active = await this.queue.getJobCounts();

    const laneStats: Record<string, LaneStats> = {};

    for (const [lane, config] of Object.entries(LANE_CONFIG)) {
      laneStats[lane] = {
        pending: pending[lane] || 0,
        active: 0, // Would need job-level tracking for accurate active counts
        weight: config.weight,
        maxConcurrent: config.maxConcurrent,
      };
    }

    return laneStats;
  }

  /**
   * Record enqueue for metrics
   */
  private async recordEnqueue(type: string, priority: number): Promise<void> {
    try {
      await this.redisService.increment(`queue:enqueue:${type}`, 1);
      await this.redisService.increment('queue:enqueue:total', 1);
    } catch (error: any) {
      this.logger.warn(`Failed to record enqueue metrics: ${error.message}`);
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Priority queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Priority queue resumed');
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.logger.log('Priority queue closed');
  }
}
