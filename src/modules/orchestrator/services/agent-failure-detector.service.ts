/**
 * AgentFailureDetectorService
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Detects agent failures in CLI pipeline sessions by listening to
 * events from SessionHealthMonitorService, CLI process exits,
 * API error patterns, and infinite loop signals.
 *
 * Bridges the gap between:
 * - SessionHealthMonitorService (Story 11.3): emits cli:session:stalled
 * - FailureRecoveryService (Story 5.10): basic agent-level recovery
 * - This service: pipeline-level failure detection with checkpoint awareness
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentFailure,
  FailureMonitoringParams,
  ProcessExitParams,
  ApiErrorParams,
  FileModificationParams,
  FailureType,
  DEFAULT_MAX_SESSION_DURATION_MS,
  API_ERROR_THRESHOLD,
  FILE_MODIFICATION_LOOP_THRESHOLD,
} from '../interfaces/failure-recovery.interfaces';

/**
 * Internal tracking state for a monitored session.
 */
interface MonitoredAgentSession {
  params: FailureMonitoringParams;
  timeoutTimer: ReturnType<typeof setTimeout>;
  apiErrorCount: number;
  fileModCounts: Map<string, number>;
  registeredAt: Date;
}

@Injectable()
export class AgentFailureDetectorService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentFailureDetectorService.name);

  /** Active sessions tracked by sessionId */
  private readonly sessionTracking = new Map<string, MonitoredAgentSession>();

  /** Active failures tracked by failureId */
  private readonly activeFailures = new Map<string, AgentFailure>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Register a CLI session for failure monitoring.
   * Called when PipelineJobHandler starts a new agent execution.
   * Subscribes to session events and initializes tracking state.
   */
  registerSession(params: FailureMonitoringParams): void {
    const maxDuration =
      params.maxDurationMs ?? DEFAULT_MAX_SESSION_DURATION_MS;

    const timeoutTimer = setTimeout(() => {
      this.onSessionTimeout(params.sessionId);
    }, maxDuration);

    const session: MonitoredAgentSession = {
      params,
      timeoutTimer,
      apiErrorCount: 0,
      fileModCounts: new Map(),
      registeredAt: new Date(),
    };

    this.sessionTracking.set(params.sessionId, session);

    this.logger.log(
      `Registered session ${params.sessionId} for failure monitoring (maxDuration: ${maxDuration}ms)`,
    );
  }

  /**
   * Unregister a CLI session from failure monitoring.
   * Called when a session completes (success or handled failure).
   */
  unregisterSession(sessionId: string): void {
    const session = this.sessionTracking.get(sessionId);
    if (!session) return;

    clearTimeout(session.timeoutTimer);
    this.sessionTracking.delete(sessionId);

    this.logger.log(
      `Unregistered session ${sessionId} from failure monitoring`,
    );
  }

  /**
   * Process a CLI process exit event.
   * Determines if exit code indicates a recoverable or fatal failure.
   */
  async handleProcessExit(
    params: ProcessExitParams,
  ): Promise<AgentFailure | null> {
    if (params.exitCode === 0) {
      return null;
    }

    const session = this.sessionTracking.get(params.sessionId);
    if (!session) {
      this.logger.warn(
        `Process exit for unregistered session ${params.sessionId}`,
      );
      // Create a minimal failure for unregistered sessions
      return this.createFailure(
        {
          sessionId: params.sessionId,
          agentId: 'unknown',
          agentType: 'unknown',
          projectId: 'unknown',
          workspaceId: 'unknown',
          storyId: 'unknown',
        },
        'crash',
        `Process exited with code ${params.exitCode}${params.signal ? ` (signal: ${params.signal})` : ''}: ${params.stderr}`,
      );
    }

    return this.createFailure(
      session.params,
      'crash',
      `Process exited with code ${params.exitCode}${params.signal ? ` (signal: ${params.signal})` : ''}: ${params.stderr}`,
    );
  }

  /**
   * Process an API error from the Claude API.
   * Tracks repeated errors (429, 500) and triggers failure after threshold.
   */
  async handleApiError(
    params: ApiErrorParams,
  ): Promise<AgentFailure | null> {
    const session = this.sessionTracking.get(params.sessionId);
    if (!session) return null;

    // Success response resets error count
    if (params.statusCode < 400) {
      session.apiErrorCount = 0;
      return null;
    }

    session.apiErrorCount++;

    if (session.apiErrorCount < API_ERROR_THRESHOLD) {
      return null;
    }

    // Capture the count before resetting
    const errorCount = session.apiErrorCount;

    // Reset count BEFORE creating failure to prevent duplicate failures from
    // concurrent async calls. The recovery service handles exponential backoff
    // for rate limit errors. A fresh burst of errors after recovery will need
    // to accumulate again from 0, which is by design.
    session.apiErrorCount = 0;

    const failure = this.createFailure(
      session.params,
      'api_error',
      `${params.statusCode} error repeated ${errorCount} times: ${params.errorMessage}`,
      { statusCode: params.statusCode },
    );

    return failure;
  }

  /**
   * Process a file modification event for infinite loop detection.
   * Tracks per-file modification counts within a session.
   */
  async handleFileModification(
    params: FileModificationParams,
  ): Promise<AgentFailure | null> {
    const session = this.sessionTracking.get(params.sessionId);
    if (!session) return null;

    // Tests pass: reset count for this file
    if (params.testsPassed) {
      session.fileModCounts.set(params.filePath, 0);
      return null;
    }

    // Increment modification count
    const currentCount =
      (session.fileModCounts.get(params.filePath) || 0) + 1;
    session.fileModCounts.set(params.filePath, currentCount);

    if (currentCount < FILE_MODIFICATION_LOOP_THRESHOLD) {
      return null;
    }

    return this.createFailure(
      session.params,
      'loop',
      `File ${params.filePath} modified ${currentCount} times without passing tests`,
      { filePath: params.filePath, modificationCount: currentCount },
    );
  }

  /**
   * Handle a stalled session event from SessionHealthMonitorService.
   * Can be called directly or via @OnEvent('cli:session:stalled').
   */
  @OnEvent('cli:session:stalled')
  handleSessionStalled(event: {
    sessionId: string;
    lastActivityTimestamp: Date;
    stallDuration: number;
  }): void {
    const session = this.sessionTracking.get(event.sessionId);
    if (!session) return;

    this.createFailure(
      session.params,
      'stuck',
      `Session stalled for ${Math.round(event.stallDuration / 1000)}s (no output since ${event.lastActivityTimestamp.toISOString()})`,
    );
  }

  /**
   * Get all currently detected (unresolved) failures.
   */
  getActiveFailures(): AgentFailure[] {
    return Array.from(this.activeFailures.values()).filter(
      (f) => !f.resolved,
    );
  }

  /**
   * Resolve a failure (mark as handled and remove from active map).
   * Called by PipelineFailureRecoveryService after recovery.
   * Removes the failure from the map to prevent memory leaks over time.
   */
  resolveFailure(failureId: string): void {
    const failure = this.activeFailures.get(failureId);
    if (failure) {
      failure.resolved = true;
      this.activeFailures.delete(failureId);
    }
  }

  /**
   * Get a specific failure by ID.
   */
  getFailure(failureId: string): AgentFailure | undefined {
    return this.activeFailures.get(failureId);
  }

  /**
   * Cleanup on module destroy - clear all timers.
   */
  onModuleDestroy(): void {
    for (const [, session] of this.sessionTracking) {
      clearTimeout(session.timeoutTimer);
    }
    this.sessionTracking.clear();
    this.activeFailures.clear();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Handle session timeout (exceeds max duration).
   */
  private onSessionTimeout(sessionId: string): void {
    const session = this.sessionTracking.get(sessionId);
    if (!session) return;

    const duration = Date.now() - session.registeredAt.getTime();

    this.createFailure(
      session.params,
      'timeout',
      `Session exceeded maximum duration (${Math.round(duration / 1000)}s)`,
    );
  }

  /**
   * Create a failure record, store it, and emit the agent:failure event.
   */
  private createFailure(
    params: FailureMonitoringParams,
    failureType: FailureType,
    errorDetails: string,
    extraMetadata: Record<string, any> = {},
  ): AgentFailure {
    const failure: AgentFailure = {
      id: uuidv4(),
      sessionId: params.sessionId,
      agentId: params.agentId,
      agentType: params.agentType,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      storyId: params.storyId,
      failureType,
      retryCount: 0,
      lastCheckpoint: null,
      errorDetails,
      recoveryAction: 'pending',
      resolved: false,
      timestamp: new Date(),
      metadata: extraMetadata,
    };

    this.activeFailures.set(failure.id, failure);

    this.eventEmitter.emit('agent:failure', failure);

    this.logger.warn(
      `Agent failure detected: ${failureType} for session ${params.sessionId} - ${errorDetails}`,
    );

    return failure;
  }
}
