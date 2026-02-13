import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentsService } from './agents.service';
import { Agent, AgentStatus } from '../../database/entities/agent.entity';
import { ContextRecoveryService } from './context-recovery.service';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';

export interface StallDetectionResult {
  detected: number;
  recovered: number;
  failed: number;
}

export interface ZombieCleanupResult {
  zombiesFound: number;
  cleaned: number;
  errors: number;
}

export interface HealthCheckResult {
  healthy: number;
  stalled: number;
  failed: number;
  recovering: number;
}

export interface RecoveryStatusResult {
  agentId: string;
  retryCount: number;
  maxRetries: number;
  isRecovering: boolean;
}

export interface InfiniteLoopCheckResult {
  detected: boolean;
  action?: string;
  count?: number;
}

/**
 * FailureRecoveryService
 * Story 5.10: Agent Failure Detection & Recovery
 *
 * Monitors agent health, detects stalled/zombie agents,
 * performs automatic recovery with retry tracking,
 * and detects infinite loop patterns.
 */
@Injectable()
export class FailureRecoveryService {
  private readonly logger = new Logger(FailureRecoveryService.name);

  // Configuration constants
  private readonly HEARTBEAT_TIMEOUT_MINUTES = 5;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes in ms
  private readonly ZOMBIE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
  private readonly ACTION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes in ms
  private readonly INFINITE_LOOP_THRESHOLD = 10;

  // In-memory tracking state
  private readonly retryTracker: Map<string, number> = new Map();
  private readonly actionHistory: Map<string, Array<{ action: string; timestamp: Date }>> = new Map();

  constructor(
    private readonly agentsService: AgentsService,
    private readonly contextRecovery: ContextRecoveryService,
    private readonly agentQueueService: AgentQueueService,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {}

  /**
   * Detect stalled agents (no heartbeat for 5+ minutes)
   * Runs every minute via cron
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async detectStalledAgents(): Promise<StallDetectionResult> {
    this.logger.debug('Checking for stalled agents...');

    const cutoffTime = new Date(Date.now() - this.STALL_TIMEOUT_MS);

    // Query agents with status RUNNING or INITIALIZING where heartbeat is stale.
    // For agents with no heartbeat (NULL), only flag them if created before cutoff
    // to give newly-created agents a grace period to initialize.
    const stalledAgents = await this.agentRepository
      .createQueryBuilder('agent')
      .where('agent.status IN (:...statuses)', {
        statuses: [AgentStatus.RUNNING, AgentStatus.INITIALIZING],
      })
      .andWhere(
        '((agent.last_heartbeat IS NOT NULL AND agent.last_heartbeat < :cutoffTime) OR (agent.last_heartbeat IS NULL AND agent.created_at < :cutoffTime))',
        { cutoffTime },
      )
      .getMany();

    const result: StallDetectionResult = {
      detected: stalledAgents.length,
      recovered: 0,
      failed: 0,
    };

    for (const agent of stalledAgents) {
      const timeSinceHeartbeat = agent.lastHeartbeat
        ? Date.now() - agent.lastHeartbeat.getTime()
        : null;

      this.logger.warn(
        `failure.stalled.detected - Agent ${agent.id} (workspace: ${agent.workspaceId}, type: ${agent.type}) stalled. ` +
          `Time since last heartbeat: ${timeSinceHeartbeat ? Math.round(timeSinceHeartbeat / 1000) + 's' : 'never'}`,
      );

      const recovered = await this.recoverAgent(agent.id, agent.workspaceId);
      if (recovered) {
        result.recovered++;
      } else {
        result.failed++;
      }
    }

    if (stalledAgents.length > 0) {
      this.logger.log(
        `Stall check complete: ${result.detected} detected, ${result.recovered} recovered, ${result.failed} failed`,
      );
    }

    return result;
  }

  /**
   * Attempt to recover a failed/stalled agent
   * Returns true if recovery was queued, false if permanently failed or error
   */
  async recoverAgent(agentId: string, workspaceId: string): Promise<boolean> {
    this.logger.log(
      `failure.recovery.attempted - Attempting to recover agent ${agentId}`,
    );

    try {
      // Step 1: Check retry count
      const currentRetries = this.retryTracker.get(agentId) || 0;
      if (currentRetries >= this.MAX_RETRY_ATTEMPTS) {
        await this.markPermanentlyFailed(
          agentId,
          workspaceId,
          'Maximum recovery attempts exhausted',
        );
        return false;
      }

      // Step 2: Increment retry count
      this.retryTracker.set(agentId, currentRetries + 1);

      // Step 3: Recover context from three-tier system
      const context = await this.contextRecovery.recoverContext(agentId);

      if (!context) {
        this.logger.warn(
          `No context found for agent ${agentId}, attempting recovery without context`,
        );
      }

      // Step 4: Update agent status to INITIALIZING
      // Use direct repository update to bypass state machine validation,
      // since recovery requires RUNNING->INITIALIZING which is not a normal lifecycle transition
      await this.agentRepository.update(
        { id: agentId },
        {
          status: AgentStatus.INITIALIZING,
          errorMessage: null as any,
          lastHeartbeat: new Date(),
        },
      );

      // Step 5: Queue spawn job to re-spawn the agent
      await this.agentQueueService.addJob({
        workspaceId,
        userId: 'system',
        jobType: AgentJobType.SPAWN_AGENT,
        data: {
          agentId,
          recoveredContext: context,
        },
      });

      this.logger.log(
        `failure.recovery.succeeded - Agent ${agentId} recovery queued (attempt ${currentRetries + 1}/${this.MAX_RETRY_ATTEMPTS})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `failure.recovery.failed - Failed to recover agent ${agentId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Mark an agent as permanently failed after max retries
   */
  async markPermanentlyFailed(
    agentId: string,
    workspaceId: string,
    reason: string,
  ): Promise<void> {
    const retryCount = this.retryTracker.get(agentId) || 0;
    const message = `Permanently failed after ${retryCount} retry attempts: ${reason}`;

    this.logger.error(
      `failure.permanently_failed - Agent ${agentId}: ${message}`,
    );

    await this.agentsService.markFailed(agentId, workspaceId, message);

    // Clear tracking state
    this.retryTracker.delete(agentId);
    this.actionHistory.delete(agentId);
  }

  /**
   * Clean up zombie agents (stalled for >24 hours)
   * Runs daily at 2 AM via cron
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupZombieAgents(): Promise<ZombieCleanupResult> {
    this.logger.log('failure.zombie.cleanup - Starting zombie agent cleanup...');

    const cutoffTime = new Date(Date.now() - this.ZOMBIE_TIMEOUT_MS);

    // Query agents with status RUNNING or INITIALIZING where heartbeat is >24 hours old.
    // For agents with no heartbeat (NULL), use created_at as the reference timestamp.
    const zombieAgents = await this.agentRepository
      .createQueryBuilder('agent')
      .where('agent.status IN (:...statuses)', {
        statuses: [AgentStatus.RUNNING, AgentStatus.INITIALIZING],
      })
      .andWhere(
        '((agent.last_heartbeat IS NOT NULL AND agent.last_heartbeat < :cutoffTime) OR (agent.last_heartbeat IS NULL AND agent.created_at < :cutoffTime))',
        { cutoffTime },
      )
      .getMany();

    const result: ZombieCleanupResult = {
      zombiesFound: zombieAgents.length,
      cleaned: 0,
      errors: 0,
    };

    for (const agent of zombieAgents) {
      try {
        // Mark as terminated directly (bypass state machine for zombies)
        await this.agentRepository.update(
          { id: agent.id },
          {
            status: AgentStatus.TERMINATED,
            completedAt: new Date(),
            errorMessage:
              'Zombie agent cleanup: no heartbeat for >24 hours',
          },
        );

        // Clean up context across all tiers
        await this.contextRecovery.deleteContext(
          agent.id,
          agent.workspaceId,
        );

        // Clear tracking state
        this.retryTracker.delete(agent.id);
        this.actionHistory.delete(agent.id);

        result.cleaned++;
      } catch (error: any) {
        this.logger.error(
          `Failed to clean up zombie agent ${agent.id}: ${error.message}`,
        );
        result.errors++;
      }
    }

    this.logger.log(
      `failure.zombie.cleanup - Complete: ${result.zombiesFound} found, ${result.cleaned} cleaned, ${result.errors} errors`,
    );

    return result;
  }

  /**
   * Record an agent action for infinite loop detection.
   * Auto-prunes entries older than the action window.
   */
  recordAgentAction(agentId: string, action: string): void {
    const now = new Date();
    const windowCutoff = new Date(Date.now() - this.ACTION_WINDOW_MS);

    let actions = this.actionHistory.get(agentId) || [];

    // Add the new action
    actions.push({ action, timestamp: now });

    // Prune entries older than the window
    actions = actions.filter((entry) => entry.timestamp > windowCutoff);

    this.actionHistory.set(agentId, actions);
  }

  /**
   * Check if an agent is stuck in an infinite loop.
   * Analyzes the action history sliding window for repeated patterns.
   */
  checkForInfiniteLoop(agentId: string): InfiniteLoopCheckResult {
    const actions = this.actionHistory.get(agentId) || [];
    const windowCutoff = new Date(Date.now() - this.ACTION_WINDOW_MS);

    // Only consider actions within the window
    const recentActions = actions.filter(
      (entry) => entry.timestamp > windowCutoff,
    );

    // Count occurrences of each unique action
    const actionCounts = new Map<string, number>();
    for (const entry of recentActions) {
      const count = (actionCounts.get(entry.action) || 0) + 1;
      actionCounts.set(entry.action, count);
    }

    // Check if any action exceeds the threshold
    for (const [action, count] of actionCounts) {
      if (count >= this.INFINITE_LOOP_THRESHOLD) {
        this.logger.warn(
          `Infinite loop detected for agent ${agentId}: action "${action}" repeated ${count} times`,
        );
        return { detected: true, action, count };
      }
    }

    return { detected: false };
  }

  /**
   * Clear all tracked actions for an agent.
   * Called on agent termination/completion.
   */
  clearActionHistory(agentId: string): void {
    this.actionHistory.delete(agentId);
  }

  /**
   * Health check for all agents in a workspace.
   * Categorizes agents by health status.
   */
  async healthCheck(workspaceId: string): Promise<HealthCheckResult> {
    const now = Date.now();
    const stallCutoff = new Date(now - this.STALL_TIMEOUT_MS);

    // Query all agents for this workspace
    const agents = await this.agentRepository.find({
      where: { workspaceId },
    });

    const result: HealthCheckResult = {
      healthy: 0,
      stalled: 0,
      failed: 0,
      recovering: 0,
    };

    for (const agent of agents) {
      // Count recovering agents (present in retry tracker)
      if (this.retryTracker.has(agent.id)) {
        result.recovering++;
        continue;
      }

      if (agent.status === AgentStatus.FAILED) {
        result.failed++;
      } else if (agent.status === AgentStatus.RUNNING) {
        if (
          agent.lastHeartbeat &&
          agent.lastHeartbeat > stallCutoff
        ) {
          result.healthy++;
        } else {
          result.stalled++;
        }
      } else if (agent.status === AgentStatus.INITIALIZING) {
        // INITIALIZING agents may not have sent a heartbeat yet;
        // only count as stalled if they have a stale heartbeat
        if (agent.lastHeartbeat && agent.lastHeartbeat <= stallCutoff) {
          result.stalled++;
        } else {
          result.healthy++;
        }
      }
    }

    return result;
  }

  /**
   * Reset the retry counter for an agent.
   * Should be called when an agent successfully resumes operation
   * after recovery (e.g., when a healthy heartbeat is received).
   */
  resetRetryCount(agentId: string): void {
    if (this.retryTracker.has(agentId)) {
      this.logger.log(`Retry counter reset for agent ${agentId}`);
      this.retryTracker.delete(agentId);
    }
  }

  /**
   * Get recovery status for a specific agent.
   * Returns retry count and max retries.
   */
  getRecoveryStatus(agentId: string): RecoveryStatusResult {
    const retryCount = this.retryTracker.get(agentId) || 0;

    return {
      agentId,
      retryCount,
      maxRetries: this.MAX_RETRY_ATTEMPTS,
      isRecovering: retryCount > 0,
    };
  }
}
