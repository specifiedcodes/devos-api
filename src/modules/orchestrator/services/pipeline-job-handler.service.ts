/**
 * PipelineJobHandlerService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Main handler for pipeline phase jobs. Coordinates:
 * - Task context assembly
 * - Git branch management
 * - CLI session spawning via CLISessionLifecycleService
 * - Real-time output streaming
 * - Session health monitoring
 * - Error handling with structured error types
 */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { TaskContextAssemblerService } from './task-context-assembler.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { WorkspaceManagerService } from './workspace-manager.service';
import {
  PipelineJobData,
  PipelineJobResult,
  PipelineJobError,
} from '../interfaces/pipeline-job.interfaces';
import {
  CLISessionEvent,
  CLISessionSpawnParams,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

/** Agent types that work on feature branches */
const FEATURE_BRANCH_AGENTS = new Set(['dev']);

/** Agent types that check out the dev branch (not create their own) */
const CHECKOUT_DEV_BRANCH_AGENTS = new Set(['qa']);

/** Agent types that work directly on main */
const MAIN_BRANCH_AGENTS = new Set(['planner', 'devops']);

@Injectable()
export class PipelineJobHandlerService {
  private readonly logger = new Logger(PipelineJobHandlerService.name);

  constructor(
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly contextAssembler: TaskContextAssemblerService,
    private readonly branchManager: PipelineBranchManagerService,
    private readonly outputStream: CLIOutputStreamService,
    private readonly healthMonitor: SessionHealthMonitorService,
    private readonly workspaceManager: WorkspaceManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Execute a pipeline phase job.
   * Called by AgentJobProcessor for jobs with pipelineProjectId.
   *
   * @returns Result containing session outcome, branch, commit info
   */
  async handlePipelineJob(
    jobData: PipelineJobData,
  ): Promise<PipelineJobResult> {
    const startTime = Date.now();
    let sessionId: string | null = null;
    let branch: string | null = null;

    this.logger.log(
      `Handling pipeline job: phase=${jobData.phase}, agent=${jobData.agentType}, project=${jobData.pipelineProjectId}`,
    );

    try {
      // 1. Prepare workspace
      const workspacePath = await this.workspaceManager.prepareWorkspace(
        jobData.workspaceId,
        jobData.pipelineProjectId,
        '', // Git URL will be resolved by workspace manager
      );

      // 2. Handle Git branch strategy based on agent type
      branch = await this.handleBranchStrategy(
        jobData,
        workspacePath,
      );

      // 3. Assemble task context (pass pipeline metadata for story details, tech stack, etc.)
      const context = await this.contextAssembler.assembleContext({
        workspaceId: jobData.workspaceId,
        projectId: jobData.pipelineProjectId,
        storyId: jobData.storyId,
        agentType: jobData.agentType,
        workspacePath,
        pipelineMetadata: jobData.pipelineMetadata || {},
      });

      // 4. Format task prompt
      const taskPrompt = this.contextAssembler.formatTaskPrompt(
        context,
        jobData.agentType,
      );

      // 5. Build pipeline context for CLI session
      const pipelineContext = {
        projectId: jobData.pipelineProjectId,
        workspaceId: jobData.workspaceId,
        workflowId: jobData.pipelineWorkflowId,
        currentState: this.phaseToState(jobData.phase),
        previousState: null,
        stateEnteredAt: new Date(),
        activeAgentId: null,
        activeAgentType: jobData.agentType,
        currentStoryId: jobData.storyId,
        retryCount: 0,
        maxRetries: 3,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 6. Spawn CLI session
      const spawnParams: CLISessionSpawnParams = {
        workspaceId: jobData.workspaceId,
        projectId: jobData.pipelineProjectId,
        agentId: `pipeline-${jobData.agentType}-${Date.now()}`,
        agentType: jobData.agentType,
        task: taskPrompt,
        storyId: jobData.storyId || undefined,
        gitRepoUrl: '',
        pipelineContext,
      };

      const spawnResult = await this.lifecycleService.spawnSession(spawnParams);
      sessionId = spawnResult.sessionId;

      // 7. Start output streaming
      this.outputStream.startStreaming({
        sessionId,
        workspaceId: jobData.workspaceId,
        agentId: spawnParams.agentId,
        agentType: jobData.agentType,
      });

      // 8. Start health monitoring
      this.healthMonitor.startMonitoring(sessionId);

      // 9. Wait for session completion
      const completionResult = await this.waitForSessionCompletion(sessionId);

      // 10. Stop monitoring and streaming
      this.healthMonitor.stopMonitoring(sessionId);
      await this.outputStream.stopStreaming(sessionId);

      // 11. Build result
      const durationMs = Date.now() - startTime;

      if (completionResult.exitCode === 0) {
        return {
          sessionId,
          exitCode: 0,
          branch,
          commitHash: null, // Would need git log to get this
          outputLineCount: completionResult.outputLineCount || 0,
          durationMs,
          error: null,
        };
      } else {
        return {
          sessionId,
          exitCode: completionResult.exitCode,
          branch,
          commitHash: null,
          outputLineCount: completionResult.outputLineCount || 0,
          durationMs,
          error: completionResult.error || `CLI exited with code ${completionResult.exitCode}`,
        };
      }
    } catch (error) {
      // Cleanup on error
      if (sessionId) {
        this.healthMonitor.stopMonitoring(sessionId);
        await this.outputStream.stopStreaming(sessionId);
      }

      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Pipeline job failed after ${durationMs}ms: ${errorMessage}`,
      );

      // Classify error type and handle appropriately
      if (error instanceof ForbiddenException) {
        // BYOK key error - non-recoverable, throw to prevent BullMQ retry
        throw error;
      }

      // Workspace/setup errors - throw for BullMQ retry
      throw error;
    }
  }

  /**
   * Handle Git branch strategy based on agent type.
   *
   * - dev: Create devos/dev/{storyId} branch
   * - qa: Checkout devos/dev/{storyId} (the dev branch)
   * - planner: Work on main (no feature branch)
   * - devops: Work on main (for merge)
   */
  private async handleBranchStrategy(
    jobData: PipelineJobData,
    workspacePath: string,
  ): Promise<string | null> {
    const { agentType, storyId } = jobData;

    if (MAIN_BRANCH_AGENTS.has(agentType) || !storyId) {
      // Planner and devops work on main
      return null;
    }

    if (FEATURE_BRANCH_AGENTS.has(agentType)) {
      // Dev agent creates a feature branch
      return this.branchManager.createFeatureBranch({
        workspacePath,
        agentType,
        storyId,
      });
    }

    if (CHECKOUT_DEV_BRANCH_AGENTS.has(agentType)) {
      // QA agent checks out the dev agent's branch
      return this.branchManager.createFeatureBranch({
        workspacePath,
        agentType: 'dev', // Check out the dev branch
        storyId,
      });
    }

    return null;
  }

  /**
   * Wait for session completion by listening for EventEmitter2 events.
   * Returns when cli:session:completed or cli:session:failed is received.
   * Includes a safety timeout (4 hours) to prevent indefinite hanging
   * if events are never emitted (e.g., process killed without cleanup).
   */
  private waitForSessionCompletion(
    sessionId: string,
  ): Promise<{
    exitCode: number | null;
    error: string | null;
    outputLineCount: number;
  }> {
    // Safety timeout: 4 hours max (matches MAX_TIMEOUT_MS from CLI config)
    const SAFETY_TIMEOUT_MS = 14_400_000;

    return new Promise((resolve) => {
      let timeoutHandle: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.eventEmitter.removeListener(
          'cli:session:completed',
          onCompleted,
        );
        this.eventEmitter.removeListener(
          'cli:session:failed',
          onFailed,
        );
      };

      const onCompleted = (event: CLISessionEvent) => {
        if (event.sessionId !== sessionId) return;
        cleanup();
        resolve({
          exitCode: event.metadata?.exitCode ?? 0,
          error: null,
          outputLineCount: event.metadata?.outputLineCount ?? 0,
        });
      };

      const onFailed = (event: CLISessionEvent) => {
        if (event.sessionId !== sessionId) return;
        cleanup();
        resolve({
          exitCode: event.metadata?.exitCode ?? 1,
          error:
            event.metadata?.error ||
            event.metadata?.reason ||
            'CLI session failed',
          outputLineCount: event.metadata?.outputLineCount ?? 0,
        });
      };

      timeoutHandle = setTimeout(() => {
        this.eventEmitter.removeListener(
          'cli:session:completed',
          onCompleted,
        );
        this.eventEmitter.removeListener(
          'cli:session:failed',
          onFailed,
        );
        this.logger.error(
          `Session ${sessionId} completion wait timed out after ${SAFETY_TIMEOUT_MS}ms`,
        );
        resolve({
          exitCode: null,
          error: `Session completion wait timed out after ${SAFETY_TIMEOUT_MS}ms`,
          outputLineCount: 0,
        });
      }, SAFETY_TIMEOUT_MS);

      this.eventEmitter.on('cli:session:completed', onCompleted);
      this.eventEmitter.on('cli:session:failed', onFailed);
    });
  }

  /**
   * Map pipeline phase to PipelineState enum.
   */
  private phaseToState(phase: string): PipelineState {
    const mapping: Record<string, PipelineState> = {
      planning: PipelineState.PLANNING,
      implementing: PipelineState.IMPLEMENTING,
      qa: PipelineState.QA,
      deploying: PipelineState.DEPLOYING,
    };
    return mapping[phase] || PipelineState.IMPLEMENTING;
  }
}
