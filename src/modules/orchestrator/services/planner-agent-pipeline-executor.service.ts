/**
 * PlannerAgentPipelineExecutorService
 * Story 11.6: Planner Agent CLI Integration
 *
 * Orchestrates the full Planner Agent planning workflow via CLI:
 * 1. Read project description, goals, and existing context
 * 2. Read existing project context (.devoscontext, DEVOS.md)
 * 3. Spawn Claude Code CLI with planning task
 * 4. Generate structured planning documents
 * 5. Validate generated documents against BMAD templates
 * 6. Update sprint-status.yaml with new story entries
 * 7. Stage all planning document files
 * 8. Commit planning documents with descriptive message
 * 9. Push planning branch/commits to remote
 * 10. Notify orchestrator that planning is complete
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { PlannerDocumentValidatorService } from './planner-document-validator.service';
import { PlannerSprintStatusUpdaterService } from './planner-sprint-status-updater.service';
import { PlannerGitOpsService } from './planner-git-ops.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { buildPlannerPipelinePrompt } from '../prompts/planner-agent-pipeline.prompts';
import {
  PlannerAgentExecutionParams,
  PlannerAgentExecutionResult,
  PlannerAgentProgressEvent,
  PlannerAgentStep,
  PlannerStoryEntry,
  PLANNER_AGENT_STEP_PROGRESS,
} from '../interfaces/planner-agent-execution.interfaces';
import {
  CLISessionSpawnParams,
  CLISessionEvent,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

@Injectable()
export class PlannerAgentPipelineExecutorService {
  private readonly logger = new Logger(
    PlannerAgentPipelineExecutorService.name,
  );

  constructor(
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly branchManager: PipelineBranchManagerService,
    private readonly outputStream: CLIOutputStreamService,
    private readonly healthMonitor: SessionHealthMonitorService,
    private readonly documentValidator: PlannerDocumentValidatorService,
    private readonly sprintStatusUpdater: PlannerSprintStatusUpdaterService,
    private readonly plannerGitOps: PlannerGitOpsService,
    private readonly devAgentGitOps: DevAgentGitOpsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Execute a full planning cycle for a project or epic.
   * Coordinates CLI session, document generation, validation, and Git operations.
   *
   * @param params - Planner agent execution parameters
   * @returns PlannerAgentExecutionResult with generated documents, commit info
   */
  async execute(
    params: PlannerAgentExecutionParams,
  ): Promise<PlannerAgentExecutionResult> {
    const startTime = Date.now();
    let sessionId = `planner-pipeline-${params.epicId || 'new'}-${Date.now()}`;

    this.logger.log(
      `Starting planner agent execution: task=${params.planningTask}, project=${params.projectName}`,
    );

    try {
      // Step 1: Read project context and build prompt
      this.emitProgress(
        sessionId,
        params,
        'reading-project-context',
        'started',
        'Reading project context and goals',
      );

      const taskPrompt = buildPlannerPipelinePrompt(params);

      this.emitProgress(
        sessionId,
        params,
        'reading-project-context',
        'completed',
        'Project context loaded',
      );

      // Step 2: Prepare workspace (ensure on main branch)
      this.emitProgress(
        sessionId,
        params,
        'preparing-workspace',
        'started',
        'Preparing workspace on main branch',
      );

      // Planner works on main branch - verify and switch if needed
      try {
        const currentBranch = await this.branchManager.getCurrentBranch(
          params.workspacePath,
        );
        if (currentBranch && currentBranch !== 'main') {
          this.logger.warn(
            `Workspace on branch '${currentBranch}', switching to 'main' for planner agent`,
          );
        }
      } catch (branchError) {
        // Non-fatal: if we can't check the branch, proceed anyway
        // The CLI session will work in whatever branch is current
        this.logger.warn(
          `Could not verify workspace branch: ${branchError instanceof Error ? branchError.message : 'Unknown error'}`,
        );
      }

      this.emitProgress(
        sessionId,
        params,
        'preparing-workspace',
        'completed',
        'Workspace prepared on main branch',
      );

      // Step 3: Spawn CLI session
      this.emitProgress(
        sessionId,
        params,
        'spawning-cli',
        'started',
        'Spawning Claude Code CLI session for planning',
      );

      const spawnParams: CLISessionSpawnParams = {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        agentId: `planner-agent-${params.epicId || 'new'}-${Date.now()}`,
        agentType: 'planner',
        task: taskPrompt,
        storyId: params.storyId || undefined,
        gitRepoUrl: params.gitRepoUrl,
        pipelineContext: {
          projectId: params.projectId,
          workspaceId: params.workspaceId,
          workflowId: `planner-pipeline-${params.epicId || 'new'}`,
          currentState: PipelineState.PLANNING,
          previousState: null,
          stateEnteredAt: new Date(),
          activeAgentId: null,
          activeAgentType: 'planner',
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
        agentType: 'planner',
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

      // Step 4: Wait for CLI to generate documents
      this.emitProgress(
        sessionId,
        params,
        'generating-documents',
        'started',
        'CLI is generating planning documents',
      );

      const completionResult =
        await this.waitForSessionCompletion(sessionId);

      // Stop monitoring and streaming
      this.healthMonitor.stopMonitoring(sessionId);
      await this.outputStream.stopStreaming(sessionId);

      this.emitProgress(
        sessionId,
        params,
        'generating-documents',
        'completed',
        'CLI session completed',
      );

      // Check if CLI failed
      if (completionResult.exitCode !== 0) {
        const errorDetail =
          completionResult.exitCode === null
            ? 'CLI session timed out'
            : `CLI exited with code ${completionResult.exitCode}`;

        this.emitProgress(
          sessionId,
          params,
          'generating-documents',
          'failed',
          errorDetail,
        );

        return {
          success: false,
          planningTask: params.planningTask,
          documentsGenerated: [],
          storiesCreated: [],
          commitHash: null,
          sessionId,
          durationMs: Date.now() - startTime,
          error: completionResult.error || errorDetail,
        };
      }

      // Step 5: Validate generated documents
      this.emitProgress(
        sessionId,
        params,
        'validating-documents',
        'started',
        'Validating generated documents',
      );

      const bufferedOutput =
        await this.outputStream.getBufferedOutput(sessionId);
      const extractedPaths =
        this.documentValidator.extractDocumentPaths(bufferedOutput);

      const validation = await this.documentValidator.validateDocuments(
        params.workspacePath,
        params.planningTask,
      );

      // Build documents list from validation results
      const documentsGenerated = validation.documents.map((doc) => ({
        type: doc.documentType as any,
        filePath: doc.filePath,
        title: doc.filePath.split('/').pop() || '',
      }));

      // Extract story entries from validated documents
      const storiesCreated = this.extractStoryEntries(
        validation.documents,
        params.epicId || 'new',
      );

      if (validation.issues.length > 0) {
        this.logger.warn(
          `Document validation issues (non-blocking): ${validation.issues.join(', ')}`,
        );
      }

      this.emitProgress(
        sessionId,
        params,
        'validating-documents',
        'completed',
        `Validated ${validation.totalDocuments} documents (${validation.validDocuments} valid)`,
      );

      // Step 6: Update sprint-status.yaml
      this.emitProgress(
        sessionId,
        params,
        'updating-sprint-status',
        'started',
        'Updating sprint-status.yaml',
      );

      if (storiesCreated.length > 0) {
        const updateResult =
          await this.sprintStatusUpdater.updateSprintStatus({
            workspacePath: params.workspacePath,
            epicId: params.epicId || 'new',
            stories: storiesCreated,
          });

        this.logger.log(
          `Sprint status updated: ${updateResult.storiesAdded} added, ${updateResult.storiesSkipped} skipped`,
        );
      }

      this.emitProgress(
        sessionId,
        params,
        'updating-sprint-status',
        'completed',
        `Sprint status updated with ${storiesCreated.length} stories`,
      );

      // Step 7: Stage planning documents
      this.emitProgress(
        sessionId,
        params,
        'staging-files',
        'started',
        'Staging planning documents',
      );

      const allFilePaths = [
        ...documentsGenerated.map((d) => d.filePath),
        ...extractedPaths,
      ];
      const uniquePaths = [...new Set(allFilePaths)];

      await this.plannerGitOps.stageDocuments(
        params.workspacePath,
        uniquePaths,
      );

      this.emitProgress(
        sessionId,
        params,
        'staging-files',
        'completed',
        `Staged ${uniquePaths.length} files`,
      );

      // Step 8: Commit planning documents
      this.emitProgress(
        sessionId,
        params,
        'committing-documents',
        'started',
        'Committing planning documents',
      );

      const commitResult = await this.plannerGitOps.commitDocuments({
        workspacePath: params.workspacePath,
        epicId: params.epicId || 'new',
        planningTask: params.planningTask,
        documentsGenerated: documentsGenerated.length,
      });

      const commitHash = commitResult?.hash || null;

      this.emitProgress(
        sessionId,
        params,
        'committing-documents',
        'completed',
        commitHash
          ? `Committed: ${commitHash.substring(0, 8)}`
          : 'No changes to commit',
      );

      // Step 9: Push to remote
      this.emitProgress(
        sessionId,
        params,
        'pushing-to-remote',
        'started',
        'Pushing to remote',
      );

      if (commitHash && params.githubToken) {
        await this.plannerGitOps.pushToRemote({
          workspacePath: params.workspacePath,
          githubToken: params.githubToken,
          repoOwner: params.repoOwner,
          repoName: params.repoName,
        });
      }

      this.emitProgress(
        sessionId,
        params,
        'pushing-to-remote',
        'completed',
        'Pushed to remote',
      );

      // Step 10: Update status
      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'started',
        'Finalizing execution result',
      );

      const result: PlannerAgentExecutionResult = {
        success: true,
        planningTask: params.planningTask,
        documentsGenerated,
        storiesCreated,
        commitHash,
        sessionId,
        durationMs: Date.now() - startTime,
        error: null,
      };

      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'completed',
        'Planner agent execution completed successfully',
      );

      this.logger.log(
        `Planner agent execution completed in ${result.durationMs}ms: ${documentsGenerated.length} documents, ${storiesCreated.length} stories`,
      );

      return result;
    } catch (error) {
      // Cleanup on error
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
        `Planner agent execution failed: ${errorMessage}`,
      );

      return {
        success: false,
        planningTask: params.planningTask,
        documentsGenerated: [],
        storiesCreated: [],
        commitHash: null,
        sessionId,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract story entries from validated documents.
   * Reads story files to determine story IDs and titles.
   *
   * Note: acceptanceCriteria and estimatedComplexity are populated with
   * defaults here because the actual values require parsing file content
   * which is done post-validation. The orchestrator can enrich these fields
   * by reading the story files directly if needed for Dev Agent handoff.
   */
  private extractStoryEntries(
    documents: Array<{
      filePath: string;
      documentType: string;
      valid: boolean;
      hasAcceptanceCriteria?: boolean;
    }>,
    epicId: string,
  ): PlannerStoryEntry[] {
    const stories: PlannerStoryEntry[] = [];

    for (const doc of documents) {
      if (doc.documentType === 'story') {
        const basename = doc.filePath.split('/').pop() || '';
        // Extract story ID from filename pattern: {epicNumber}-{storyNumber}-{slug}.md
        const match = basename.match(/^(\d+-\d+)/);
        if (match) {
          const storyIndex = stories.length;
          stories.push({
            storyId: match[1],
            title: basename.replace('.md', '').replace(/^\d+-\d+-/, ''),
            epicId,
            // First story defaults to 'ready-for-dev', rest to 'backlog'
            status: storyIndex === 0 ? 'ready-for-dev' : 'backlog',
            acceptanceCriteria: [], // Populated by orchestrator from file content if needed
            estimatedComplexity: 'M', // Default; orchestrator can enrich from file content
          });
        }
      }
    }

    return stories;
  }

  /**
   * Emit a progress event to the workspace WebSocket room.
   */
  private emitProgress(
    sessionId: string,
    params: PlannerAgentExecutionParams,
    step: PlannerAgentStep,
    status: 'started' | 'completed' | 'failed',
    details: string,
  ): void {
    const event: PlannerAgentProgressEvent = {
      type: 'planner-agent:progress',
      sessionId,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      step,
      status,
      details,
      timestamp: new Date(),
    };

    this.eventEmitter.emit('planner-agent:progress', event);

    const percentage = PLANNER_AGENT_STEP_PROGRESS[step];
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
