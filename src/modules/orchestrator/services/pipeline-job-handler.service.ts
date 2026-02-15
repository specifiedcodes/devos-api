/**
 * PipelineJobHandlerService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 * Story 11.4: Dev Agent CLI Integration (dev agent delegation)
 * Story 11.5: QA Agent CLI Integration (qa agent delegation)
 * Story 11.6: Planner Agent CLI Integration (planner agent delegation)
 * Story 11.7: DevOps Agent CLI Integration (devops agent delegation)
 *
 * Main handler for pipeline phase jobs. Coordinates:
 * - Task context assembly
 * - Git branch management
 * - CLI session spawning via CLISessionLifecycleService
 * - Real-time output streaming
 * - Session health monitoring
 * - Error handling with structured error types
 * - Dev agent delegation to DevAgentPipelineExecutor (Story 11.4)
 * - QA agent delegation to QAAgentPipelineExecutor (Story 11.5)
 * - Planner agent delegation to PlannerAgentPipelineExecutor (Story 11.6)
 * - DevOps agent delegation to DevOpsAgentPipelineExecutor (Story 11.7)
 */
import { Injectable, Logger, ForbiddenException, Optional, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { TaskContextAssemblerService } from './task-context-assembler.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { WorkspaceManagerService } from './workspace-manager.service';
import { DevAgentPipelineExecutorService } from './dev-agent-pipeline-executor.service';
import { QAAgentPipelineExecutorService } from './qa-agent-pipeline-executor.service';
import { PlannerAgentPipelineExecutorService } from './planner-agent-pipeline-executor.service';
import { DevOpsAgentPipelineExecutorService } from './devops-agent-pipeline-executor.service';
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
import { DevAgentExecutionParams } from '../interfaces/dev-agent-execution.interfaces';
import { QAAgentExecutionParams } from '../interfaces/qa-agent-execution.interfaces';
import { PlannerAgentExecutionParams } from '../interfaces/planner-agent-execution.interfaces';
import { DevOpsAgentExecutionParams } from '../interfaces/devops-agent-execution.interfaces';

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
    @Optional()
    @Inject(forwardRef(() => DevAgentPipelineExecutorService))
    private readonly devAgentExecutor?: DevAgentPipelineExecutorService,
    @Optional()
    @Inject(forwardRef(() => QAAgentPipelineExecutorService))
    private readonly qaAgentExecutor?: QAAgentPipelineExecutorService,
    @Optional()
    @Inject(forwardRef(() => PlannerAgentPipelineExecutorService))
    private readonly plannerAgentExecutor?: PlannerAgentPipelineExecutorService,
    @Optional()
    @Inject(forwardRef(() => DevOpsAgentPipelineExecutorService))
    private readonly devopsAgentExecutor?: DevOpsAgentPipelineExecutorService,
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

      // Story 11.4: Delegate dev agent jobs to DevAgentPipelineExecutor
      if (jobData.agentType === 'dev' && this.devAgentExecutor) {
        return this.handleDevAgentJob(jobData, workspacePath, startTime);
      }

      // Story 11.5: Delegate QA agent jobs to QAAgentPipelineExecutor
      if (jobData.agentType === 'qa' && this.qaAgentExecutor) {
        return this.handleQAAgentJob(jobData, workspacePath, startTime);
      }

      // Story 11.6: Delegate planner agent jobs to PlannerAgentPipelineExecutor
      if (jobData.agentType === 'planner' && this.plannerAgentExecutor) {
        return this.handlePlannerAgentJob(jobData, workspacePath, startTime);
      }

      // Story 11.7: Delegate devops agent jobs to DevOpsAgentPipelineExecutor
      if (jobData.agentType === 'devops' && this.devopsAgentExecutor) {
        return this.handleDevOpsAgentJob(jobData, workspacePath, startTime);
      }

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
   * Handle dev agent jobs by delegating to DevAgentPipelineExecutor.
   * Story 11.4: Dev Agent CLI Integration
   *
   * Builds DevAgentExecutionParams from PipelineJobData and delegates
   * execution to the DevAgentPipelineExecutor. Maps the result back
   * to PipelineJobResult with additional PR/test metadata for QA handoff.
   */
  private async handleDevAgentJob(
    jobData: PipelineJobData,
    workspacePath: string,
    startTime: number,
  ): Promise<PipelineJobResult> {
    this.logger.log(
      `Delegating dev agent job to DevAgentPipelineExecutor for story ${jobData.storyId}`,
    );

    const metadata = jobData.pipelineMetadata || {};

    // TODO: Retrieve GitHub token via IntegrationConnectionService instead of
    // pipeline metadata to avoid storing the token in Redis job data.
    // For now, validate that required GitHub fields are present.
    const githubToken = metadata.githubToken || '';
    if (!githubToken) {
      this.logger.warn(
        `Dev agent job for story ${jobData.storyId} missing GitHub token in pipeline metadata`,
      );
    }
    if (!metadata.repoOwner || !metadata.repoName) {
      this.logger.warn(
        `Dev agent job for story ${jobData.storyId} missing repo owner/name in pipeline metadata`,
      );
    }

    const executionParams: DevAgentExecutionParams = {
      workspaceId: jobData.workspaceId,
      projectId: jobData.pipelineProjectId,
      storyId: jobData.storyId || 'unknown',
      storyTitle: metadata.storyTitle || `Story ${jobData.storyId}`,
      storyDescription: metadata.storyDescription || '',
      acceptanceCriteria: metadata.acceptanceCriteria || [],
      techStack: metadata.techStack || '',
      codeStylePreferences: metadata.codeStylePreferences || '',
      testingStrategy: metadata.testingStrategy || '',
      workspacePath,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken,
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
    };

    const result = await this.devAgentExecutor!.execute(executionParams);

    // Map DevAgentExecutionResult to PipelineJobResult
    const pipelineResult: PipelineJobResult = {
      sessionId: result.sessionId,
      exitCode: result.success ? 0 : 1,
      branch: result.branch || null,
      commitHash: result.commitHash,
      outputLineCount: 0,
      durationMs: result.durationMs,
      error: result.error,
    };

    // Attach dev agent metadata for QA handoff via pipeline metadata
    // This data will be available to the QA agent in the next pipeline phase
    if (result.success) {
      this.logger.log(
        `Dev agent completed successfully: PR ${result.prUrl}, branch ${result.branch}`,
      );
    }

    return pipelineResult;
  }

  /**
   * Handle QA agent jobs by delegating to QAAgentPipelineExecutor.
   * Story 11.5: QA Agent CLI Integration
   *
   * Builds QAAgentExecutionParams from PipelineJobData and delegates
   * execution to the QAAgentPipelineExecutor. Maps the result back
   * to PipelineJobResult with verdict and report metadata for handoff.
   */
  private async handleQAAgentJob(
    jobData: PipelineJobData,
    workspacePath: string,
    startTime: number,
  ): Promise<PipelineJobResult> {
    this.logger.log(
      `Delegating QA agent job to QAAgentPipelineExecutor for story ${jobData.storyId}`,
    );

    const metadata = jobData.pipelineMetadata || {};

    const githubToken = metadata.githubToken || '';
    if (!githubToken) {
      this.logger.warn(
        `QA agent job for story ${jobData.storyId} missing GitHub token in pipeline metadata`,
      );
    }

    const executionParams: QAAgentExecutionParams = {
      workspaceId: jobData.workspaceId,
      projectId: jobData.pipelineProjectId,
      storyId: jobData.storyId || 'unknown',
      storyTitle: metadata.storyTitle || `Story ${jobData.storyId}`,
      storyDescription: metadata.storyDescription || '',
      acceptanceCriteria: metadata.acceptanceCriteria || [],
      techStack: metadata.techStack || '',
      testingStrategy: metadata.testingStrategy || '',
      workspacePath,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken,
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
      prUrl: metadata.prUrl || '',
      prNumber: metadata.prNumber || 0,
      devBranch: metadata.devBranch || '',
      devTestResults: metadata.devTestResults || null,
    };

    const result = await this.qaAgentExecutor!.execute(executionParams);

    // Map QAAgentExecutionResult to PipelineJobResult
    const pipelineResult: PipelineJobResult = {
      sessionId: result.sessionId,
      exitCode: result.success ? 0 : 1,
      branch: executionParams.devBranch || null,
      commitHash: null,
      outputLineCount: 0,
      durationMs: result.durationMs,
      error: result.error,
    };

    if (result.success) {
      this.logger.log(
        `QA agent completed with verdict: ${result.verdict} for story ${jobData.storyId}`,
      );
    }

    return pipelineResult;
  }

  /**
   * Handle planner agent jobs by delegating to PlannerAgentPipelineExecutor.
   * Story 11.6: Planner Agent CLI Integration
   *
   * Builds PlannerAgentExecutionParams from PipelineJobData and delegates
   * execution to the PlannerAgentPipelineExecutor. Maps the result back
   * to PipelineJobResult with document and story metadata for Dev Agent handoff.
   */
  private async handlePlannerAgentJob(
    jobData: PipelineJobData,
    workspacePath: string,
    startTime: number,
  ): Promise<PipelineJobResult> {
    this.logger.log(
      `Delegating planner agent job to PlannerAgentPipelineExecutor for project ${jobData.pipelineProjectId}`,
    );

    const metadata = jobData.pipelineMetadata || {};

    const githubToken = metadata.githubToken || '';
    if (!githubToken) {
      this.logger.warn(
        `Planner agent job for project ${jobData.pipelineProjectId} missing GitHub token in pipeline metadata`,
      );
    }

    const executionParams: PlannerAgentExecutionParams = {
      workspaceId: jobData.workspaceId,
      projectId: jobData.pipelineProjectId,
      storyId: jobData.storyId,
      projectName: metadata.projectName || `Project ${jobData.pipelineProjectId}`,
      projectDescription: metadata.projectDescription || '',
      projectGoals: metadata.projectGoals || [],
      epicId: metadata.epicId || null,
      epicDescription: metadata.epicDescription || null,
      planningTask: metadata.planningTask || 'create-project-plan',
      techStack: metadata.techStack || '',
      codeStylePreferences: metadata.codeStylePreferences || '',
      templateType: metadata.templateType || null,
      workspacePath,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken,
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
      existingEpics: metadata.existingEpics || [],
      existingStories: metadata.existingStories || [],
      previousPlannerOutput: metadata.previousPlannerOutput || null,
    };

    const result = await this.plannerAgentExecutor!.execute(executionParams);

    // Map PlannerAgentExecutionResult to PipelineJobResult
    const pipelineResult: PipelineJobResult = {
      sessionId: result.sessionId,
      exitCode: result.success ? 0 : 1,
      branch: null, // Planner works on main, no feature branch
      commitHash: result.commitHash,
      outputLineCount: 0,
      durationMs: result.durationMs,
      error: result.error,
    };

    if (result.success) {
      this.logger.log(
        `Planner agent completed: ${result.documentsGenerated.length} documents, ${result.storiesCreated.length} stories created`,
      );
    }

    return pipelineResult;
  }

  /**
   * Handle DevOps agent jobs by delegating to DevOpsAgentPipelineExecutor.
   * Story 11.7: DevOps Agent CLI Integration
   *
   * Builds DevOpsAgentExecutionParams from PipelineJobData and delegates
   * execution to the DevOpsAgentPipelineExecutor. Maps the result back
   * to PipelineJobResult with deployment URL, smoke test results, and incident reports.
   */
  private async handleDevOpsAgentJob(
    jobData: PipelineJobData,
    workspacePath: string,
    startTime: number,
  ): Promise<PipelineJobResult> {
    this.logger.log(
      `Delegating DevOps agent job to DevOpsAgentPipelineExecutor for story ${jobData.storyId}`,
    );

    const metadata = jobData.pipelineMetadata || {};

    const githubToken = metadata.githubToken || '';
    if (!githubToken) {
      this.logger.warn(
        `DevOps agent job for story ${jobData.storyId} missing GitHub token in pipeline metadata`,
      );
    }

    const executionParams: DevOpsAgentExecutionParams = {
      workspaceId: jobData.workspaceId,
      projectId: jobData.pipelineProjectId,
      storyId: jobData.storyId || 'unknown',
      storyTitle: metadata.storyTitle || `Story ${jobData.storyId}`,
      storyDescription: metadata.storyDescription || '',
      workspacePath,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken,
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
      prUrl: metadata.prUrl || '',
      prNumber: metadata.prNumber || 0,
      devBranch: metadata.devBranch || '',
      qaVerdict: metadata.qaVerdict || 'PASS',
      qaReportSummary: metadata.qaReportSummary || '',
      deploymentPlatform: metadata.deploymentPlatform || 'auto',
      supabaseConfigured: metadata.supabaseConfigured || false,
      environment: metadata.environment || 'staging',
    };

    const result = await this.devopsAgentExecutor!.execute(executionParams);

    // Map DevOpsAgentExecutionResult to PipelineJobResult
    const pipelineResult: PipelineJobResult = {
      sessionId: result.sessionId,
      exitCode: result.success ? 0 : 1,
      branch: null, // DevOps works on main, no feature branch
      commitHash: result.mergeCommitHash,
      outputLineCount: 0,
      durationMs: result.durationMs,
      error: result.error,
      metadata: {
        deploymentUrl: result.deploymentUrl,
        deploymentPlatform: result.deploymentPlatform,
        deploymentId: result.deploymentId,
        smokeTestResults: result.smokeTestResults,
        rollbackPerformed: result.rollbackPerformed,
        rollbackReason: result.rollbackReason,
        incidentReport: result.incidentReport,
      },
    };

    if (result.success) {
      this.logger.log(
        `DevOps agent completed successfully: deployment=${result.deploymentUrl}, platform=${result.deploymentPlatform}`,
      );
    } else {
      this.logger.warn(
        `DevOps agent failed: ${result.error}${result.rollbackPerformed ? ' (rollback performed)' : ''}`,
      );
    }

    return pipelineResult;
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
