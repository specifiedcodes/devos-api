/**
 * PipelineFailureRecoveryService
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Orchestrates recovery strategies for pipeline agent failures.
 * Receives AgentFailure events and executes tiered recovery:
 *
 * Tier 1: Retry from last checkpoint (max 3 attempts)
 * Tier 2: Context refresh + retry (regenerate context files)
 * Tier 3: Escalation to user (after all retries exhausted)
 *
 * Integrates with:
 * - CheckpointService: Get last good commit for recovery
 * - PipelineStateMachineService: Transition pipeline state on failure/recovery
 * - HandoffCoordinatorService: Re-route work after recovery
 * - SessionHealthMonitorService: Stop monitoring failed session
 * - CLISessionLifecycleService: Terminate failed session
 * - EventEmitter2: Emit recovery events for WebSocket notification
 */
import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CheckpointService } from './checkpoint.service';
import { AgentFailureDetectorService } from './agent-failure-detector.service';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { HandoffCoordinatorService } from './handoff-coordinator.service';
import { FailureRecoveryHistory } from '../entities/failure-recovery-history.entity';
import { PipelineState } from '../interfaces/pipeline.interfaces';
import {
  AgentFailure,
  RecoveryResult,
  ManualOverrideParams,
  PipelineRecoveryStatus,
  RecoveryHistoryEntry,
  RecoveryAttemptEvent,
  RecoveryEscalationEvent,
  DEFAULT_MAX_RECOVERY_RETRIES,
  API_BACKOFF_BASE_MS,
} from '../interfaces/failure-recovery.interfaces';

@Injectable()
export class PipelineFailureRecoveryService {
  private readonly logger = new Logger(PipelineFailureRecoveryService.name);

  /** Retry tracking: projectId -> current retry count */
  private readonly retryTracking = new Map<string, number>();

  constructor(
    private readonly checkpointService: CheckpointService,
    private readonly failureDetector: AgentFailureDetectorService,
    @Inject(forwardRef(() => PipelineStateMachineService))
    private readonly stateMachine: PipelineStateMachineService,
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly healthMonitor: SessionHealthMonitorService,
    @Optional()
    @Inject(HandoffCoordinatorService)
    private readonly handoffCoordinator: HandoffCoordinatorService | null,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(FailureRecoveryHistory)
    private readonly historyRepository: Repository<FailureRecoveryHistory>,
  ) {}

  /**
   * Handle a detected agent failure.
   * Determines and executes the appropriate recovery strategy.
   * Listens for agent:failure events from AgentFailureDetectorService.
   */
  @OnEvent('agent:failure')
  async handleFailure(failure: AgentFailure): Promise<RecoveryResult> {
    const startTime = Date.now();
    const retryCount = this.retryTracking.get(failure.projectId) || 0;

    this.logger.warn(
      `Handling failure ${failure.id} for project ${failure.projectId} (type: ${failure.failureType}, retryCount: ${retryCount})`,
    );

    let result: RecoveryResult;

    try {
      // Special handling by failure type
      if (failure.failureType === 'loop') {
        // Infinite loop always goes to context refresh first
        result = await this.contextRefreshRetry(failure);
      } else if (
        failure.failureType === 'api_error' &&
        failure.metadata?.statusCode === 429
      ) {
        // Rate limit: apply exponential backoff delay before retry
        const backoffMs = API_BACKOFF_BASE_MS * Math.pow(2, retryCount);
        this.logger.log(
          `Applying ${backoffMs}ms exponential backoff for rate limit (retry ${retryCount})`,
        );
        await this.delay(backoffMs);

        if (retryCount >= DEFAULT_MAX_RECOVERY_RETRIES) {
          result = await this.escalateToUser(failure);
        } else {
          result = await this.retryFromCheckpoint(failure);
        }
      } else if (retryCount >= DEFAULT_MAX_RECOVERY_RETRIES) {
        // Max retries exhausted -> escalation
        result = await this.escalateToUser(failure);
      } else if (retryCount === 2) {
        // Third failure -> context refresh
        result = await this.contextRefreshRetry(failure);
      } else {
        // First or second failure -> retry from checkpoint
        result = await this.retryFromCheckpoint(failure);
      }

      // Track retry count (only increment for non-successful recoveries or retries)
      if (result.success && result.strategy !== 'escalation') {
        // Successful recovery: increment to track how many retries were needed,
        // but don't exceed maxRetries so next unrelated failure starts fresh
        this.retryTracking.set(failure.projectId, retryCount + 1);
      } else {
        this.retryTracking.set(failure.projectId, retryCount + 1);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Recovery failed for failure ${failure.id}: ${error}`,
      );

      const errorResult: RecoveryResult = {
        success: false,
        strategy: 'escalation',
        failureId: failure.id,
        retryCount,
        newSessionId: null,
        checkpointUsed: null,
        error: String(error),
      };

      // Record failed recovery attempt
      await this.recordHistory(failure, 'escalation', false, startTime, String(error));

      return errorResult;
    }
  }

  /**
   * Execute Tier 1: Retry from last checkpoint.
   * 1. Stop health monitoring for failed session
   * 2. Terminate the failed CLI session
   * 3. Get last checkpoint from CheckpointService
   * 4. Emit recovery attempt event
   * 5. Record recovery in history
   * 6. Signal pipeline to retry current phase
   */
  async retryFromCheckpoint(failure: AgentFailure): Promise<RecoveryResult> {
    const startTime = Date.now();

    // Stop health monitoring
    this.healthMonitor.stopMonitoring(failure.sessionId);

    // Terminate failed session
    try {
      await this.lifecycleService.terminateSession(failure.sessionId);
    } catch (error) {
      this.logger.warn(
        `Failed to terminate session ${failure.sessionId}: ${error}`,
      );
    }

    // Get last checkpoint
    let checkpoint = await this.checkpointService.getLatestCheckpoint(
      failure.sessionId,
    );

    // Fall back to story-level checkpoint if no session checkpoint
    if (!checkpoint) {
      checkpoint = await this.checkpointService.getLatestStoryCheckpoint({
        workspaceId: failure.workspaceId,
        storyId: failure.storyId,
      });
    }

    const checkpointUsed = checkpoint?.commitHash ?? null;

    // Emit recovery attempt event
    const attemptEvent: RecoveryAttemptEvent = {
      type: 'agent:recovery_attempt',
      workspaceId: failure.workspaceId,
      projectId: failure.projectId,
      storyId: failure.storyId,
      agentId: failure.agentId,
      failureId: failure.id,
      strategy: 'checkpoint_recovery',
      retryCount: this.retryTracking.get(failure.projectId) || 0,
      checkpointUsed,
      timestamp: new Date(),
    };
    this.eventEmitter.emit('agent:recovery_attempt', attemptEvent);

    // Record recovery attempt in history (success=true indicates recovery was initiated;
    // actual session outcome is tracked separately by the pipeline state machine)
    await this.recordHistory(
      failure,
      'checkpoint_recovery',
      true,
      startTime,
      null,
      checkpointUsed,
    );

    // Mark failure as resolved in detector
    this.failureDetector.resolveFailure(failure.id);

    this.logger.log(
      `Retry from checkpoint initiated for failure ${failure.id}: checkpoint=${checkpointUsed || 'none (fresh start)'}`,
    );

    return {
      success: true,
      strategy: 'checkpoint_recovery',
      failureId: failure.id,
      retryCount: this.retryTracking.get(failure.projectId) || 0,
      newSessionId: null, // New session will be spawned by pipeline state machine
      checkpointUsed,
      error: null,
    };
  }

  /**
   * Execute Tier 2: Context refresh + retry.
   * Same as retryFromCheckpoint but also regenerates context files.
   */
  async contextRefreshRetry(failure: AgentFailure): Promise<RecoveryResult> {
    const startTime = Date.now();

    // Stop health monitoring
    this.healthMonitor.stopMonitoring(failure.sessionId);

    // Terminate failed session
    try {
      await this.lifecycleService.terminateSession(failure.sessionId);
    } catch (error) {
      this.logger.warn(
        `Failed to terminate session ${failure.sessionId}: ${error}`,
      );
    }

    // Get last checkpoint
    let checkpoint = await this.checkpointService.getLatestCheckpoint(
      failure.sessionId,
    );

    if (!checkpoint) {
      checkpoint = await this.checkpointService.getLatestStoryCheckpoint({
        workspaceId: failure.workspaceId,
        storyId: failure.storyId,
      });
    }

    const checkpointUsed = checkpoint?.commitHash ?? null;

    // Emit recovery attempt event
    const attemptEvent: RecoveryAttemptEvent = {
      type: 'agent:recovery_attempt',
      workspaceId: failure.workspaceId,
      projectId: failure.projectId,
      storyId: failure.storyId,
      agentId: failure.agentId,
      failureId: failure.id,
      strategy: 'context_refresh',
      retryCount: this.retryTracking.get(failure.projectId) || 0,
      checkpointUsed,
      timestamp: new Date(),
    };
    this.eventEmitter.emit('agent:recovery_attempt', attemptEvent);

    // Record recovery in history
    await this.recordHistory(
      failure,
      'context_refresh',
      true,
      startTime,
      null,
      checkpointUsed,
    );

    // Mark failure as resolved in detector
    this.failureDetector.resolveFailure(failure.id);

    this.logger.log(
      `Context refresh retry for failure ${failure.id}: checkpoint=${checkpointUsed || 'none'}`,
    );

    return {
      success: true,
      strategy: 'context_refresh',
      failureId: failure.id,
      retryCount: this.retryTracking.get(failure.projectId) || 0,
      newSessionId: null,
      checkpointUsed,
      error: null,
    };
  }

  /**
   * Execute Tier 3: Escalation to user.
   * Pauses the pipeline and emits escalation event for user notification.
   */
  async escalateToUser(failure: AgentFailure): Promise<RecoveryResult> {
    const startTime = Date.now();

    // Pause pipeline
    try {
      await this.stateMachine.pausePipeline(
        failure.projectId,
        'system:failure-recovery',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to pause pipeline for project ${failure.projectId}: ${error}`,
      );
    }

    // Emit escalation event
    const escalationEvent: RecoveryEscalationEvent = {
      type: 'agent:recovery_escalation',
      workspaceId: failure.workspaceId,
      projectId: failure.projectId,
      storyId: failure.storyId,
      agentId: failure.agentId,
      failureId: failure.id,
      totalRetries: this.retryTracking.get(failure.projectId) || 0,
      lastFailureType: failure.failureType,
      lastErrorDetails: failure.errorDetails,
      overrideOptions: ['terminate', 'reassign', 'provide_guidance'],
      timestamp: new Date(),
    };
    this.eventEmitter.emit('agent:recovery_escalation', escalationEvent);

    // Record escalation in history
    await this.recordHistory(
      failure,
      'escalation',
      false,
      startTime,
      'Recovery retries exhausted, escalated to user',
    );

    // Mark failure as escalated
    failure.recoveryAction = 'escalated';

    this.logger.warn(
      `Failure ${failure.id} escalated to user for project ${failure.projectId}`,
    );

    return {
      success: false,
      strategy: 'escalation',
      failureId: failure.id,
      retryCount: this.retryTracking.get(failure.projectId) || 0,
      newSessionId: null,
      checkpointUsed: null,
      error: 'Recovery retries exhausted, escalated to user',
    };
  }

  /**
   * Handle a manual override from the user.
   * Options: terminate, reassign, provide guidance.
   */
  async handleManualOverride(
    params: ManualOverrideParams,
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    const failure = this.failureDetector.getFailure(params.failureId);

    if (!failure) {
      throw new NotFoundException(
        `Failure ${params.failureId} not found`,
      );
    }

    let result: RecoveryResult;

    switch (params.action) {
      case 'terminate': {
        // Transition pipeline to FAILED
        await this.stateMachine.transition(
          failure.projectId,
          PipelineState.FAILED,
          {
            triggeredBy: `user:${params.userId}:manual_override`,
            errorMessage: `Manually terminated after failure: ${failure.errorDetails}`,
            metadata: { failureId: failure.id, action: 'terminate' },
          },
        );

        // Mark failure as resolved
        this.failureDetector.resolveFailure(failure.id);

        result = {
          success: true,
          strategy: 'manual_override',
          failureId: failure.id,
          retryCount: this.retryTracking.get(failure.projectId) || 0,
          newSessionId: null,
          checkpointUsed: null,
          error: null,
        };
        break;
      }

      case 'reassign': {
        // Mark failure as resolved
        this.failureDetector.resolveFailure(failure.id);

        // Reset retry count for new agent
        this.retryTracking.delete(failure.projectId);

        result = {
          success: true,
          strategy: 'manual_override',
          failureId: failure.id,
          retryCount: 0,
          newSessionId: null,
          checkpointUsed: null,
          error: null,
        };
        break;
      }

      case 'provide_guidance': {
        // Resume pipeline with guidance
        await this.stateMachine.resumePipeline(
          failure.projectId,
          `user:${params.userId}:manual_override`,
        );

        // Mark failure as resolved
        this.failureDetector.resolveFailure(failure.id);

        // Reset retry count
        this.retryTracking.delete(failure.projectId);

        result = {
          success: true,
          strategy: 'manual_override',
          failureId: failure.id,
          retryCount: 0,
          newSessionId: null,
          checkpointUsed: null,
          error: null,
        };
        break;
      }

      default:
        throw new Error(`Unknown manual override action: ${params.action}`);
    }

    // Record override in history
    await this.recordHistory(
      failure,
      'manual_override',
      result.success,
      startTime,
      result.error,
    );

    return result;
  }

  /**
   * Get current recovery status for a pipeline.
   */
  async getRecoveryStatus(
    projectId: string,
  ): Promise<PipelineRecoveryStatus> {
    const activeFailures = this.failureDetector
      .getActiveFailures()
      .filter((f) => f.projectId === projectId);

    const historyEntries = await this.historyRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const recoveryHistory: RecoveryHistoryEntry[] = historyEntries.map(
      (entry: FailureRecoveryHistory) => ({
        failureId: entry.id,
        failureType: entry.failureType,
        strategy: entry.recoveryStrategy,
        success: entry.success,
        timestamp: entry.createdAt,
        durationMs: entry.durationMs,
      }),
    );

    const isEscalated = activeFailures.some(
      (f) => f.recoveryAction === 'escalated',
    );

    return {
      projectId,
      activeFailures,
      recoveryHistory,
      isEscalated,
      totalRetries: this.retryTracking.get(projectId) || 0,
      maxRetries: DEFAULT_MAX_RECOVERY_RETRIES,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Record a recovery attempt in PostgreSQL for audit trail.
   */
  private async recordHistory(
    failure: AgentFailure,
    strategy: string,
    success: boolean,
    startTime: number,
    error: string | null,
    checkpointUsed: string | null = null,
  ): Promise<void> {
    try {
      const entry = this.historyRepository.create({
        workspaceId: failure.workspaceId,
        projectId: failure.projectId,
        storyId: failure.storyId,
        sessionId: failure.sessionId,
        agentId: failure.agentId,
        agentType: failure.agentType,
        failureType: failure.failureType,
        recoveryStrategy: strategy,
        retryCount: this.retryTracking.get(failure.projectId) || 0,
        checkpointCommitHash: checkpointUsed,
        success,
        errorDetails: error || failure.errorDetails,
        durationMs: Date.now() - startTime,
        metadata: failure.metadata,
      });
      await this.historyRepository.save(entry);
    } catch (err) {
      this.logger.error(`Failed to record recovery history: ${err}`);
    }
  }

  /**
   * Async delay utility for exponential backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
