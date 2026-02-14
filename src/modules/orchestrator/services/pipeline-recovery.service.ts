/**
 * PipelineRecoveryService
 * Story 11.1: Orchestrator State Machine Core
 *
 * Recovers active pipeline states on service startup.
 * Scans Redis for active pipelines, reconciles with PostgreSQL,
 * marks stale pipelines as failed, and cleans up orphaned locks.
 */
import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineStateStore } from './pipeline-state-store.service';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import {
  PipelineState,
  PipelineContext,
  PipelineRecoveryResult,
  TERMINAL_STATES,
} from '../interfaces/pipeline.interfaces';

/** Maximum age for an active pipeline before it's considered stale (2 hours) */
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class PipelineRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(PipelineRecoveryService.name);

  constructor(
    private readonly stateStore: PipelineStateStore,
    @Inject(forwardRef(() => PipelineStateMachineService))
    private readonly stateMachine: PipelineStateMachineService,
    @InjectRepository(PipelineStateHistory)
    private readonly historyRepository: Repository<PipelineStateHistory>,
  ) {}

  /**
   * Called automatically on module initialization.
   * Runs recovery scan for active pipelines.
   */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.recoverActivePipelines();
      this.logger.log(
        `Pipeline recovery complete: ${result.recovered} recovered, ${result.stale} stale, ${result.total} total`,
      );
    } catch (error) {
      this.logger.error('Pipeline recovery failed on startup', error);
      // Don't throw - service should still start even if recovery fails
    }
  }

  /**
   * Scan Redis for active pipeline states and reconcile with database.
   *
   * Recovery logic:
   * 1. Scan all pipeline:state:* keys in Redis
   * 2. For each non-terminal pipeline:
   *    - If stateEnteredAt < 2 hours ago: recover (keep state)
   *    - If stateEnteredAt >= 2 hours ago: mark as FAILED
   * 3. Force-release any orphaned pipeline:lock:* keys
   * 4. Compare Redis state with latest PostgreSQL history entry
   * 5. If mismatch: PostgreSQL is source of truth, update Redis
   */
  async recoverActivePipelines(): Promise<PipelineRecoveryResult> {
    let recovered = 0;
    let stale = 0;
    let total = 0;

    // Step 1: Scan all pipeline state keys
    const pipelineKeys = await this.stateStore.listAllPipelineKeys();

    for (const key of pipelineKeys) {
      const projectId = this.stateStore.extractProjectId(key);
      const context = await this.stateStore.getState(projectId);

      if (!context) continue;

      // Skip terminal states
      if (TERMINAL_STATES.includes(context.currentState)) {
        continue;
      }

      total++;

      // Check staleness
      const stateAge = Date.now() - new Date(context.stateEnteredAt).getTime();
      const isStale = stateAge >= STALE_THRESHOLD_MS;

      if (isStale) {
        // Mark as FAILED
        this.logger.warn(
          `Pipeline ${projectId} is stale (${Math.round(stateAge / 60000)} minutes old), marking as FAILED`,
        );
        try {
          await this.stateMachine.transition(projectId, PipelineState.FAILED, {
            triggeredBy: 'system:recovery',
            errorMessage: 'stale_recovery',
            metadata: {
              recoveryAction: 'stale_failed',
              originalState: context.currentState,
              stateAge: stateAge,
            },
          });
          stale++;
        } catch (error) {
          this.logger.error(
            `Failed to mark stale pipeline ${projectId} as FAILED`,
            error,
          );
        }
      } else {
        // Reconcile with PostgreSQL
        await this.reconcileWithDatabase(context);
        recovered++;
        this.logger.log(
          `Pipeline ${projectId} recovered (state: ${context.currentState})`,
        );
      }
    }

    // Step 3: Force-release orphaned locks
    await this.releaseOrphanedLocks();

    return { recovered, stale, total };
  }

  /**
   * Compare Redis state with the latest PostgreSQL history entry.
   * If they don't match, PostgreSQL is the source of truth.
   */
  private async reconcileWithDatabase(
    context: PipelineContext,
  ): Promise<void> {
    try {
      const latestHistory = await this.historyRepository.findOne({
        where: { projectId: context.projectId },
        order: { createdAt: 'DESC' },
      });

      if (
        latestHistory &&
        latestHistory.newState !== context.currentState
      ) {
        this.logger.warn(
          `State mismatch for pipeline ${context.projectId}: Redis=${context.currentState}, DB=${latestHistory.newState}. Using DB as source of truth.`,
        );

        // Update Redis to match PostgreSQL
        context.currentState = latestHistory.newState as PipelineState;
        context.updatedAt = new Date();
        await this.stateStore.setState(context);
      }
    } catch (error) {
      this.logger.error(
        `Failed to reconcile pipeline ${context.projectId} with database`,
        error,
      );
    }
  }

  /**
   * Find and force-release any orphaned lock keys.
   * An orphaned lock is one that exists without a corresponding active pipeline,
   * or belongs to a pipeline in a terminal state.
   */
  private async releaseOrphanedLocks(): Promise<void> {
    const lockKeys = await this.stateStore.listAllLockKeys();

    for (const lockKey of lockKeys) {
      const projectId = this.stateStore.extractProjectIdFromLock(lockKey);
      const context = await this.stateStore.getState(projectId);

      // Release lock if no pipeline exists or pipeline is in terminal state
      if (!context || TERMINAL_STATES.includes(context.currentState)) {
        this.logger.warn(
          `Releasing orphaned lock for project ${projectId}`,
        );
        await this.stateStore.forceReleaseLock(projectId);
      }
    }
  }
}
