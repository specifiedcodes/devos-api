/**
 * DevAgentPipelineExecutorService
 * Story 11.4: Dev Agent CLI Integration
 *
 * Orchestrates the full Dev Agent development workflow via CLI:
 * 1. Read story requirements and acceptance criteria
 * 2. Read project context (.devoscontext, DEVOS.md)
 * 3. Create feature branch from main
 * 4. Spawn Claude Code CLI with implementation task
 * 5. CLI writes code, creates files, installs dependencies
 * 6. Run tests (unit + integration)
 * 7. Commit code with descriptive message
 * 8. Push branch to GitHub
 * 9. Create pull request via GitHub API (Epic 6)
 * 10. Update story status to "In Review"
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { DevAgentTestExtractorService } from './dev-agent-test-extractor.service';
import { DevAgentPRCreatorService } from './dev-agent-pr-creator.service';
import { buildDevPipelinePrompt } from '../prompts/dev-agent-pipeline.prompts';
import {
  DevAgentExecutionParams,
  DevAgentExecutionResult,
  DevAgentProgressEvent,
  DevAgentStep,
  DEV_AGENT_STEP_PROGRESS,
} from '../interfaces/dev-agent-execution.interfaces';
import {
  CLISessionSpawnParams,
  CLISessionEvent,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

@Injectable()
export class DevAgentPipelineExecutorService {
  private readonly logger = new Logger(
    DevAgentPipelineExecutorService.name,
  );

  constructor(
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly branchManager: PipelineBranchManagerService,
    private readonly outputStream: CLIOutputStreamService,
    private readonly healthMonitor: SessionHealthMonitorService,
    private readonly gitOps: DevAgentGitOpsService,
    private readonly testExtractor: DevAgentTestExtractorService,
    private readonly prCreator: DevAgentPRCreatorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Execute a full dev cycle for a story.
   * Coordinates CLI session, Git operations, and GitHub API calls.
   *
   * @param params - Dev agent execution parameters
   * @returns DevAgentExecutionResult with branch, PR, test results
   */
  async execute(
    params: DevAgentExecutionParams,
  ): Promise<DevAgentExecutionResult> {
    const startTime = Date.now();
    let sessionId = `dev-pipeline-${params.storyId}-${Date.now()}`;
    let branch = '';

    this.logger.log(
      `Starting dev agent execution for story ${params.storyId}: ${params.storyTitle}`,
    );

    try {
      // Step 1: Read story context and build prompt
      this.emitProgress(
        sessionId,
        params,
        'reading-story',
        'started',
        'Reading story requirements',
      );

      const taskPrompt = buildDevPipelinePrompt(params);

      this.emitProgress(
        sessionId,
        params,
        'reading-story',
        'completed',
        'Story requirements loaded',
      );

      // Step 2: Create feature branch
      this.emitProgress(
        sessionId,
        params,
        'creating-branch',
        'started',
        'Creating feature branch',
      );

      branch = await this.branchManager.createFeatureBranch({
        workspacePath: params.workspacePath,
        agentType: 'dev',
        storyId: params.storyId,
      });

      this.emitProgress(
        sessionId,
        params,
        'creating-branch',
        'completed',
        `Feature branch created: ${branch}`,
      );

      // Step 3: Spawn CLI session
      this.emitProgress(
        sessionId,
        params,
        'spawning-cli',
        'started',
        'Spawning Claude Code CLI session',
      );

      const spawnParams: CLISessionSpawnParams = {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        agentId: `dev-agent-${params.storyId}`,
        agentType: 'dev',
        task: taskPrompt,
        storyId: params.storyId,
        gitRepoUrl: params.gitRepoUrl,
        pipelineContext: {
          projectId: params.projectId,
          workspaceId: params.workspaceId,
          workflowId: `dev-pipeline-${params.storyId}`,
          currentState: PipelineState.IMPLEMENTING,
          previousState: null,
          stateEnteredAt: new Date(),
          activeAgentId: null,
          activeAgentType: 'dev',
          currentStoryId: params.storyId,
          retryCount: 0,
          maxRetries: 3,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const spawnResult =
        await this.lifecycleService.spawnSession(spawnParams);
      sessionId = spawnResult.sessionId;

      // Start output streaming
      this.outputStream.startStreaming({
        sessionId,
        workspaceId: params.workspaceId,
        agentId: spawnParams.agentId,
        agentType: 'dev',
      });

      // Start health monitoring
      this.healthMonitor.startMonitoring(sessionId);

      this.emitProgress(
        sessionId,
        params,
        'spawning-cli',
        'completed',
        'CLI session spawned',
      );

      // Step 4: Wait for CLI to write code
      this.emitProgress(
        sessionId,
        params,
        'writing-code',
        'started',
        'CLI is writing code',
      );

      const completionResult =
        await this.waitForSessionCompletion(sessionId);

      // Stop monitoring and streaming
      this.healthMonitor.stopMonitoring(sessionId);
      await this.outputStream.stopStreaming(sessionId);

      this.emitProgress(
        sessionId,
        params,
        'writing-code',
        'completed',
        'CLI session completed',
      );

      // Check if CLI failed or timed out
      if (completionResult.exitCode !== 0) {
        const errorDetail =
          completionResult.exitCode === null
            ? 'CLI session timed out'
            : `CLI exited with code ${completionResult.exitCode}`;

        this.emitProgress(
          sessionId,
          params,
          'writing-code',
          'failed',
          errorDetail,
        );

        return {
          success: false,
          branch,
          commitHash: null,
          prUrl: null,
          prNumber: null,
          testResults: null,
          filesCreated: [],
          filesModified: [],
          sessionId,
          durationMs: Date.now() - startTime,
          error: completionResult.error || errorDetail,
        };
      }

      // Step 5: Extract test results
      this.emitProgress(
        sessionId,
        params,
        'running-tests',
        'started',
        'Extracting test results',
      );

      const bufferedOutput =
        await this.outputStream.getBufferedOutput(sessionId);
      let testResults =
        this.testExtractor.extractTestResults(bufferedOutput);

      // If no test results from CLI output, run tests explicitly
      if (!testResults) {
        testResults = await this.testExtractor.runTests(
          params.workspacePath,
        );
      }

      this.emitProgress(
        sessionId,
        params,
        'running-tests',
        'completed',
        testResults
          ? `Tests: ${testResults.passed}/${testResults.total} passed`
          : 'Test results extracted',
      );

      // Step 6: Verify commits
      this.emitProgress(
        sessionId,
        params,
        'committing-code',
        'started',
        'Verifying commits',
      );

      const latestCommit = await this.gitOps.getLatestCommit(
        params.workspacePath,
      );

      if (!latestCommit) {
        this.emitProgress(
          sessionId,
          params,
          'committing-code',
          'failed',
          'No commits found after CLI session',
        );

        return {
          success: false,
          branch,
          commitHash: null,
          prUrl: null,
          prNumber: null,
          testResults,
          filesCreated: [],
          filesModified: [],
          sessionId,
          durationMs: Date.now() - startTime,
          error: 'CLI session did not produce any commits',
        };
      }

      this.emitProgress(
        sessionId,
        params,
        'committing-code',
        'completed',
        `Latest commit: ${latestCommit.hash.substring(0, 8)}`,
      );

      // Step 7: Push branch
      this.emitProgress(
        sessionId,
        params,
        'pushing-branch',
        'started',
        'Pushing branch to remote',
      );

      await this.gitOps.pushBranch(
        params.workspacePath,
        branch,
        params.githubToken,
        params.repoOwner,
        params.repoName,
      );

      this.emitProgress(
        sessionId,
        params,
        'pushing-branch',
        'completed',
        `Branch ${branch} pushed successfully`,
      );

      // Step 8: Create pull request
      this.emitProgress(
        sessionId,
        params,
        'creating-pr',
        'started',
        'Creating pull request',
      );

      const changedFiles = await this.gitOps.getChangedFiles(
        params.workspacePath,
        branch,
      );

      const prResult = await this.prCreator.createPullRequest({
        githubToken: params.githubToken,
        repoOwner: params.repoOwner,
        repoName: params.repoName,
        branch,
        baseBranch: 'main',
        storyId: params.storyId,
        storyTitle: params.storyTitle,
        testResults,
        changedFiles,
      });

      this.emitProgress(
        sessionId,
        params,
        'creating-pr',
        'completed',
        `PR #${prResult.prNumber} created: ${prResult.prUrl}`,
      );

      // Step 9: Update status
      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'started',
        'Finalizing execution result',
      );

      const result: DevAgentExecutionResult = {
        success: true,
        branch,
        commitHash: latestCommit.hash,
        prUrl: prResult.prUrl,
        prNumber: prResult.prNumber,
        testResults,
        filesCreated: changedFiles.created,
        filesModified: changedFiles.modified,
        sessionId,
        durationMs: Date.now() - startTime,
        error: null,
      };

      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'completed',
        'Dev agent execution completed successfully',
      );

      this.logger.log(
        `Dev agent execution completed for story ${params.storyId} in ${result.durationMs}ms`,
      );

      return result;
    } catch (error) {
      // Cleanup on error - wrap in try/catch to prevent masking the original error
      try {
        if (sessionId) {
          this.healthMonitor.stopMonitoring(sessionId);
          await this.outputStream.stopStreaming(sessionId);
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Cleanup failed during error handling: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown'}`,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Dev agent execution failed for story ${params.storyId}: ${errorMessage}`,
      );

      return {
        success: false,
        branch,
        commitHash: null,
        prUrl: null,
        prNumber: null,
        testResults: null,
        filesCreated: [],
        filesModified: [],
        sessionId,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Emit a progress event to the workspace WebSocket room.
   */
  private emitProgress(
    sessionId: string,
    params: DevAgentExecutionParams,
    step: DevAgentStep,
    status: 'started' | 'completed' | 'failed',
    details: string,
  ): void {
    const event: DevAgentProgressEvent = {
      type: 'dev-agent:progress',
      sessionId,
      storyId: params.storyId,
      workspaceId: params.workspaceId,
      step,
      status,
      details,
      timestamp: new Date(),
    };

    this.eventEmitter.emit('dev-agent:progress', event);

    const percentage = DEV_AGENT_STEP_PROGRESS[step];
    this.logger.log(
      `[${percentage}%] ${step} ${status}: ${details}`,
    );
  }

  /**
   * Wait for session completion by listening for EventEmitter2 events.
   * Returns when cli:session:completed or cli:session:failed is received.
   */
  private waitForSessionCompletion(
    sessionId: string,
  ): Promise<{
    exitCode: number | null;
    error: string | null;
    outputLineCount: number;
  }> {
    const SAFETY_TIMEOUT_MS = 14_400_000; // 4 hours

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
}
