/**
 * PipelineStateMachineService
 * Story 11.1: Orchestrator State Machine Core
 * Story 11.8: Multi-Agent Handoff Chain Integration
 *
 * Core state machine driving the BMAD workflow cycle with:
 * - Redis-persisted state (via PipelineStateStore)
 * - PostgreSQL audit history
 * - WebSocket event emission (via EventEmitter2)
 * - Distributed locking for concurrent safety
 * - BullMQ integration for phase job creation
 * - Handoff coordination between agents (Story 11.8)
 *
 * This is a wrapper around the existing OrchestratorService (Story 5.8)
 * that adds durable persistence, crash recovery, and external APIs.
 */
import {
  Injectable,
  Logger,
  Inject,
  Optional,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { PipelineStateStore } from './pipeline-state-store.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import {
  PipelineState,
  PipelineContext,
  PipelineStateEvent,
  VALID_TRANSITIONS,
  InvalidStateTransitionError,
  PipelineLockError,
  TransitionOptions,
} from '../interfaces/pipeline.interfaces';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../../agent-queue/entities/agent-job.entity';
import { HandoffCoordinatorService } from './handoff-coordinator.service';

/** Lock acquisition timeout: 5 seconds with 100ms polling */
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const LOCK_POLL_INTERVAL_MS = 100;
const LOCK_TTL_MS = 30000;

/** Map pipeline phases to next phase */
const PHASE_PROGRESSION: Record<string, PipelineState> = {
  [PipelineState.PLANNING]: PipelineState.IMPLEMENTING,
  [PipelineState.IMPLEMENTING]: PipelineState.QA,
  [PipelineState.QA]: PipelineState.DEPLOYING,
  [PipelineState.DEPLOYING]: PipelineState.COMPLETE,
};

@Injectable()
export class PipelineStateMachineService {
  private readonly logger = new Logger(PipelineStateMachineService.name);

  constructor(
    private readonly stateStore: PipelineStateStore,
    @InjectRepository(PipelineStateHistory)
    private readonly historyRepository: Repository<PipelineStateHistory>,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentQueueService: AgentQueueService,
    @Optional()
    @Inject(HandoffCoordinatorService)
    private readonly handoffCoordinator: HandoffCoordinatorService | null,
  ) {}

  /**
   * Start a new pipeline for a project.
   * Creates initial PipelineContext and transitions IDLE -> PLANNING.
   *
   * @throws ConflictException if a pipeline is already active for the project
   */
  async startPipeline(
    projectId: string,
    workspaceId: string,
    options: {
      triggeredBy: string;
      storyId?: string;
      config?: Record<string, any>;
    },
  ): Promise<{ workflowId: string; state: PipelineState; message: string }> {
    // Check for existing active pipeline
    const existing = await this.stateStore.getState(projectId);
    if (existing && existing.currentState !== PipelineState.COMPLETE && existing.currentState !== PipelineState.FAILED) {
      throw new ConflictException(
        `An active pipeline already exists for project ${projectId} (state: ${existing.currentState})`,
      );
    }

    const workflowId = uuidv4();
    const now = new Date();

    // Create initial context in IDLE state
    const context: PipelineContext = {
      projectId,
      workspaceId,
      workflowId,
      currentState: PipelineState.IDLE,
      previousState: null,
      stateEnteredAt: now,
      activeAgentId: null,
      activeAgentType: null,
      currentStoryId: options.storyId || null,
      retryCount: 0,
      maxRetries: 3,
      metadata: options.config || {},
      createdAt: now,
      updatedAt: now,
    };

    // Store initial state
    await this.stateStore.setState(context);

    // Transition IDLE -> PLANNING
    await this.transition(projectId, PipelineState.PLANNING, {
      triggeredBy: options.triggeredBy,
      storyId: options.storyId || null,
    });

    this.logger.log(
      `Pipeline started for project ${projectId}, workflow ${workflowId}`,
    );

    // Note: pipeline.started event is emitted by emitLifecycleEvent()
    // inside transition() when IDLE -> PLANNING occurs. No duplicate emit here.

    return {
      workflowId,
      state: PipelineState.PLANNING,
      message: 'Pipeline started successfully',
    };
  }

  /**
   * Execute a state transition with full safety:
   * 1. Acquire distributed lock
   * 2. Load current state
   * 3. Validate transition
   * 4. Update Redis state
   * 5. Create PostgreSQL audit record
   * 6. Emit WebSocket event
   * 7. Trigger phase entry hooks (BullMQ jobs)
   * 8. Release lock (in finally)
   */
  async transition(
    projectId: string,
    targetState: PipelineState,
    options: TransitionOptions,
  ): Promise<void> {
    // Acquire lock with retry
    const lockAcquired = await this.acquireLockWithRetry(projectId);
    if (!lockAcquired) {
      throw new PipelineLockError(projectId);
    }

    try {
      // Load current state
      const context = await this.stateStore.getState(projectId);
      if (!context) {
        throw new NotFoundException(
          `No pipeline found for project ${projectId}`,
        );
      }

      const currentState = context.currentState;

      // Validate transition
      const allowedTransitions = VALID_TRANSITIONS[currentState];
      if (!allowedTransitions || !allowedTransitions.includes(targetState)) {
        throw new InvalidStateTransitionError(currentState, targetState);
      }

      // Update context
      const now = new Date();
      context.previousState = currentState;
      context.currentState = targetState;
      context.stateEnteredAt = now;
      context.updatedAt = now;

      if (options.agentId !== undefined) {
        context.activeAgentId = options.agentId || null;
      }
      if (options.storyId !== undefined) {
        context.currentStoryId = options.storyId || null;
      }
      if (options.metadata) {
        context.metadata = { ...context.metadata, ...options.metadata };
      }

      // Store updated state in Redis
      await this.stateStore.setState(context);

      // Create PostgreSQL audit record
      const historyEntry = this.historyRepository.create({
        projectId: context.projectId,
        workspaceId: context.workspaceId,
        workflowId: context.workflowId,
        previousState: currentState,
        newState: targetState,
        triggeredBy: options.triggeredBy,
        agentId: context.activeAgentId,
        storyId: context.currentStoryId,
        metadata: options.metadata || {},
        errorMessage: options.errorMessage || null,
      });
      await this.historyRepository.save(historyEntry);

      // Emit state_changed event
      const event: PipelineStateEvent = {
        type: 'pipeline:state_changed',
        projectId: context.projectId,
        workspaceId: context.workspaceId,
        previousState: currentState,
        newState: targetState,
        agentId: context.activeAgentId,
        storyId: context.currentStoryId,
        timestamp: now,
        metadata: options.metadata,
      };
      this.eventEmitter.emit('pipeline.state_changed', event);

      // Emit specific lifecycle events
      this.emitLifecycleEvent(currentState, targetState, context);

      // Trigger phase entry hooks (BullMQ jobs)
      await this.onStateEnter(targetState, context);

      this.logger.log(
        `Pipeline ${projectId}: ${currentState} -> ${targetState}`,
      );
    } finally {
      await this.stateStore.releaseLock(projectId);
    }
  }

  /**
   * Pause an active pipeline.
   * Stores the current state in metadata so it can be restored on resume.
   *
   * Validation is performed inside the lock (within transition()) to avoid
   * TOCTOU race conditions. The pre-lock read here is only for the response;
   * transition() re-reads and validates under lock.
   */
  async pausePipeline(
    projectId: string,
    triggeredBy: string,
  ): Promise<{ previousState: PipelineState; newState: PipelineState; message: string }> {
    // Pre-flight check (best-effort, real validation happens under lock in transition())
    const context = await this.stateStore.getState(projectId);
    if (!context) {
      throw new NotFoundException(
        `No pipeline found for project ${projectId}`,
      );
    }

    if (context.currentState === PipelineState.PAUSED) {
      throw new ConflictException('Pipeline is already paused');
    }

    // transition() will re-validate under lock. We pass pausedFrom in metadata
    // so we can restore the correct state on resume.
    await this.transition(projectId, PipelineState.PAUSED, {
      triggeredBy,
      metadata: { pausedFrom: context.currentState },
    });

    // Re-read the authoritative state after transition (under lock) completed
    const updatedContext = await this.stateStore.getState(projectId);
    const previousState = updatedContext?.previousState || context.currentState;

    return {
      previousState,
      newState: PipelineState.PAUSED,
      message: 'Pipeline paused successfully',
    };
  }

  /**
   * Resume a paused pipeline.
   * Transitions back to the state before it was paused.
   *
   * Validation is performed inside the lock (within transition()) to avoid
   * TOCTOU race conditions.
   */
  async resumePipeline(
    projectId: string,
    triggeredBy: string,
  ): Promise<{ previousState: PipelineState; newState: PipelineState; message: string }> {
    // Pre-flight check (best-effort, real validation happens under lock in transition())
    const context = await this.stateStore.getState(projectId);
    if (!context) {
      throw new NotFoundException(
        `No pipeline found for project ${projectId}`,
      );
    }

    if (context.currentState !== PipelineState.PAUSED) {
      throw new ConflictException(
        `Pipeline is not paused (current state: ${context.currentState})`,
      );
    }

    // Determine the state to resume to from the authoritative source (metadata)
    const resumeState =
      (context.metadata?.pausedFrom as PipelineState) ||
      context.previousState ||
      PipelineState.PLANNING;

    await this.transition(projectId, resumeState, {
      triggeredBy,
      metadata: { resumedFrom: PipelineState.PAUSED },
    });

    return {
      previousState: PipelineState.PAUSED,
      newState: resumeState,
      message: 'Pipeline resumed successfully',
    };
  }

  /**
   * Get the current pipeline state for a project.
   */
  async getState(projectId: string): Promise<PipelineContext | null> {
    return this.stateStore.getState(projectId);
  }

  /**
   * Get paginated state transition history from PostgreSQL.
   */
  async getHistory(
    projectId: string,
    workspaceId: string,
    options: { limit?: number; offset?: number },
  ): Promise<{ items: PipelineStateHistory[]; total: number }> {
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;

    const [items, total] = await this.historyRepository.findAndCount({
      where: { projectId, workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total };
  }

  /**
   * Called by job processors when a pipeline phase completes successfully.
   * If HandoffCoordinator is available (Story 11.8), enriches metadata
   * with handoff context before transitioning to the next phase.
   * Falls back to basic PHASE_PROGRESSION if HandoffCoordinator is not available.
   */
  async onPhaseComplete(
    projectId: string,
    phase: string,
    result: Record<string, any>,
  ): Promise<void> {
    const nextState = PHASE_PROGRESSION[phase];
    if (!nextState) {
      this.logger.warn(
        `No next state defined for phase ${phase} in project ${projectId}`,
      );
      return;
    }

    // Story 11.8: If handoff coordinator is available, use it
    if (this.handoffCoordinator) {
      try {
        const context = await this.stateStore.getState(projectId);
        if (!context) {
          this.logger.warn(
            `No pipeline context for project ${projectId}, falling back to basic transition`,
          );
          await this.transition(projectId, nextState, {
            triggeredBy: 'system',
            metadata: { phaseResult: result },
          });
          return;
        }

        // Check if this is a QA phase with FAIL/NEEDS_CHANGES verdict
        const isQARejection =
          phase === PipelineState.QA &&
          result.verdict &&
          result.verdict !== 'PASS';

        if (isQARejection) {
          // Route through QA rejection handler
          const iterationCount =
            (context.metadata?.iterationCount || 0) + 1;
          const rejectionResult =
            await this.handoffCoordinator.processQARejection({
              workspaceId: context.workspaceId,
              projectId,
              storyId: context.currentStoryId || '',
              storyTitle: context.metadata?.storyTitle || '',
              qaResult: result,
              iterationCount,
              previousMetadata: context.metadata,
            });

          if (rejectionResult.success) {
            // Transition QA -> IMPLEMENTING with rejection context
            await this.transition(projectId, PipelineState.IMPLEMENTING, {
              triggeredBy: 'system:qa-rejection',
              metadata: {
                phaseResult: result,
                handoffContext: rejectionResult.handoffContext,
                iterationCount,
              },
            });
          } else {
            // Escalation or error - pause pipeline
            await this.transition(projectId, PipelineState.PAUSED, {
              triggeredBy: 'system:escalation',
              metadata: {
                phaseResult: result,
                escalationReason: rejectionResult.error,
                pausedFrom: PipelineState.QA,
              },
            });
          }
          return;
        }

        // Normal handoff flow
        const handoffResult =
          await this.handoffCoordinator.processHandoff({
            workspaceId: context.workspaceId,
            projectId,
            storyId: context.currentStoryId || '',
            storyTitle: context.metadata?.storyTitle || '',
            completingAgentType: context.activeAgentType || '',
            completingAgentId: context.activeAgentId || '',
            phaseResult: result,
            pipelineMetadata: context.metadata,
          });

        if (handoffResult.queued) {
          // Handoff was queued (max agents reached or story blocked)
          // Don't transition - queue will trigger later
          this.logger.log(
            `Handoff for project ${projectId} was queued: ${handoffResult.error}`,
          );
          return;
        }

        // Transition with enriched handoff context
        await this.transition(projectId, nextState, {
          triggeredBy: 'system',
          metadata: {
            phaseResult: result,
            handoffContext: handoffResult.handoffContext,
          },
        });
      } catch (error) {
        this.logger.error(
          `Handoff coordination failed for project ${projectId}, falling back to basic transition`,
          error,
        );
        // Fallback: basic transition without handoff enrichment
        await this.transition(projectId, nextState, {
          triggeredBy: 'system',
          metadata: { phaseResult: result },
        });
      }
    } else {
      // No handoff coordinator: original behavior (backward compatible)
      await this.transition(projectId, nextState, {
        triggeredBy: 'system',
        metadata: { phaseResult: result },
      });
    }
  }

  /**
   * Story 11.8: Called when an agent completes its work and frees a slot.
   * Processes the next queued handoff if available.
   */
  async onAgentSlotFreed(workspaceId: string): Promise<void> {
    if (!this.handoffCoordinator) {
      return;
    }

    try {
      const queuedHandoff =
        await this.handoffCoordinator.processNextInQueue(workspaceId);
      if (queuedHandoff) {
        this.logger.log(
          `Processing queued handoff for workspace ${workspaceId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process queued handoff for workspace ${workspaceId}`,
        error,
      );
    }
  }

  /**
   * Called by job processors when a pipeline phase fails.
   * Handles retry logic (with lock + audit) or transitions to FAILED.
   */
  async onPhaseFailed(
    projectId: string,
    phase: string,
    error: string,
  ): Promise<void> {
    // Acquire lock before reading/modifying state to ensure concurrency safety
    const lockAcquired = await this.acquireLockWithRetry(projectId);
    if (!lockAcquired) {
      this.logger.error(
        `Cannot handle phase failure: failed to acquire lock for project ${projectId}`,
      );
      return;
    }

    try {
      const context = await this.stateStore.getState(projectId);
      if (!context) {
        this.logger.warn(
          `Cannot handle phase failure: no pipeline found for project ${projectId}`,
        );
        return;
      }

      if (context.retryCount < context.maxRetries) {
        // Retry: increment counter and re-enter the same state
        context.retryCount += 1;
        context.updatedAt = new Date();
        await this.stateStore.setState(context);

        // Create audit record for retry attempt
        const historyEntry = this.historyRepository.create({
          projectId: context.projectId,
          workspaceId: context.workspaceId,
          workflowId: context.workflowId,
          previousState: context.currentState,
          newState: context.currentState, // Same state (retry)
          triggeredBy: 'system:retry',
          agentId: context.activeAgentId,
          storyId: context.currentStoryId,
          metadata: {
            retryCount: context.retryCount,
            maxRetries: context.maxRetries,
            failedPhase: phase,
          },
          errorMessage: error,
        });
        await this.historyRepository.save(historyEntry);

        this.logger.log(
          `Pipeline ${projectId}: retrying phase ${phase} (attempt ${context.retryCount}/${context.maxRetries})`,
        );

        // Re-trigger the phase entry hook to create a new BullMQ job
        await this.onStateEnter(context.currentState, context);
      } else {
        // Max retries exceeded - release lock first since transition() will acquire its own
        await this.stateStore.releaseLock(projectId);

        // transition to FAILED (acquires its own lock)
        await this.transition(projectId, PipelineState.FAILED, {
          triggeredBy: 'system',
          errorMessage: error,
          metadata: { failedPhase: phase, retryCount: context.retryCount },
        });
        return; // Lock already released by transition()
      }
    } finally {
      // Release lock if we still hold it (only for the retry path)
      await this.stateStore.releaseLock(projectId);
    }
  }

  /**
   * Acquire a distributed lock with retry loop.
   * Polls every 100ms for up to 5 seconds.
   */
  private async acquireLockWithRetry(
    projectId: string,
  ): Promise<boolean> {
    const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const acquired = await this.stateStore.acquireLock(
        projectId,
        LOCK_TTL_MS,
      );
      if (acquired) return true;

      // Wait before retry
      await new Promise((resolve) =>
        setTimeout(resolve, LOCK_POLL_INTERVAL_MS),
      );
    }

    return false;
  }

  /**
   * Phase entry hooks: Create BullMQ jobs when entering active phases.
   */
  private async onStateEnter(
    state: PipelineState,
    context: PipelineContext,
  ): Promise<void> {
    const phaseAgentMap: Record<string, string> = {
      [PipelineState.PLANNING]: 'planner',
      [PipelineState.IMPLEMENTING]: 'dev',
      [PipelineState.QA]: 'qa',
      [PipelineState.DEPLOYING]: 'devops',
    };

    const agentType = phaseAgentMap[state];
    if (agentType) {
      try {
        await this.agentQueueService.addJob({
          workspaceId: context.workspaceId,
          userId: 'system',
          jobType: AgentJobType.EXECUTE_TASK,
          data: {
            pipelineProjectId: context.projectId,
            pipelineWorkflowId: context.workflowId,
            phase: state,
            storyId: context.currentStoryId,
            agentType,
          },
        });

        this.logger.log(
          `Created ${agentType} job for pipeline ${context.projectId} (phase: ${state})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create job for phase ${state} in pipeline ${context.projectId}`,
          error,
        );
      }
    }

    // Terminal state cleanup
    if (state === PipelineState.COMPLETE) {
      this.logger.log(
        `Pipeline ${context.projectId} completed successfully`,
      );
    }

    if (state === PipelineState.FAILED) {
      this.logger.error(
        `Pipeline ${context.projectId} failed`,
      );
    }
  }

  /**
   * Emit specific lifecycle events based on transition.
   */
  private emitLifecycleEvent(
    previousState: PipelineState,
    newState: PipelineState,
    context: PipelineContext,
  ): void {
    const eventBase = {
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      timestamp: new Date(),
    };

    if (
      previousState === PipelineState.IDLE &&
      (newState === PipelineState.PLANNING ||
        newState === PipelineState.IMPLEMENTING)
    ) {
      this.eventEmitter.emit('pipeline.started', {
        ...eventBase,
        type: 'pipeline:started',
      });
    }

    if (newState === PipelineState.COMPLETE) {
      this.eventEmitter.emit('pipeline.completed', {
        ...eventBase,
        type: 'pipeline:completed',
      });
    }

    if (newState === PipelineState.FAILED) {
      this.eventEmitter.emit('pipeline.failed', {
        ...eventBase,
        type: 'pipeline:failed',
      });
    }

    if (newState === PipelineState.PAUSED) {
      this.eventEmitter.emit('pipeline.paused', {
        ...eventBase,
        type: 'pipeline:paused',
        previousState,
      });
    }

    if (previousState === PipelineState.PAUSED) {
      this.eventEmitter.emit('pipeline.resumed', {
        ...eventBase,
        type: 'pipeline:resumed',
        newState,
      });
    }
  }
}
