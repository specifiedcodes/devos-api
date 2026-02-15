/**
 * DevOpsSmokeTestRunnerService
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Spawns Claude Code CLI sessions to run smoke tests against deployed URLs.
 * Tests health endpoint, critical user flows, and API endpoints.
 * Uses CLISessionLifecycleService (Story 11.2) and CLIOutputStreamService (Story 11.3).
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { buildDevOpsPipelinePrompt } from '../prompts/devops-agent-pipeline.prompts';
import {
  DevOpsSmokeTestResults,
  DevOpsSmokeCheck,
  DevOpsAgentExecutionParams,
} from '../interfaces/devops-agent-execution.interfaces';
import {
  CLISessionSpawnParams,
  CLISessionEvent,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

/** Smoke test timeout: 5 minutes */
const SMOKE_TEST_TIMEOUT_MS = 300_000;

@Injectable()
export class DevOpsSmokeTestRunnerService {
  private readonly logger = new Logger(DevOpsSmokeTestRunnerService.name);

  constructor(
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly outputStream: CLIOutputStreamService,
    private readonly healthMonitor: SessionHealthMonitorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Spawn Claude Code CLI session to run smoke tests against deployed URL.
   *
   * @returns DevOpsSmokeTestResults with pass/fail details
   */
  async runSmokeTests(params: {
    deploymentUrl: string;
    workspacePath: string;
    workspaceId: string;
    projectId: string;
    storyTitle: string;
    environment: string;
    executionParams?: DevOpsAgentExecutionParams;
  }): Promise<DevOpsSmokeTestResults> {
    const startTime = Date.now();
    const sessionId = `devops-smoke-${Date.now()}`;

    this.logger.log(
      `Running smoke tests against ${params.deploymentUrl}`,
    );

    try {
      // Build smoke test prompt
      const baseExecutionParams: DevOpsAgentExecutionParams = params.executionParams || {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        storyId: '',
        storyTitle: params.storyTitle,
        storyDescription: '',
        workspacePath: params.workspacePath,
        gitRepoUrl: '',
        githubToken: '',
        repoOwner: '',
        repoName: '',
        prUrl: '',
        prNumber: 0,
        devBranch: '',
        qaVerdict: 'PASS',
        qaReportSummary: '',
        deploymentPlatform: 'auto',
        supabaseConfigured: false,
        environment: params.environment,
      };

      const taskPrompt = buildDevOpsPipelinePrompt(
        baseExecutionParams,
        params.deploymentUrl,
      );

      // Spawn CLI session
      const spawnParams: CLISessionSpawnParams = {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        agentId: `devops-smoke-${params.projectId}`,
        agentType: 'devops',
        task: taskPrompt,
        storyId: undefined,
        gitRepoUrl: '',
        pipelineContext: {
          projectId: params.projectId,
          workspaceId: params.workspaceId,
          workflowId: `devops-smoke-${Date.now()}`,
          currentState: PipelineState.DEPLOYING,
          previousState: null,
          stateEnteredAt: new Date(),
          activeAgentId: null,
          activeAgentType: 'devops',
          currentStoryId: null,
          retryCount: 0,
          maxRetries: 1,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const spawnResult = await this.lifecycleService.spawnSession(spawnParams);
      const actualSessionId = spawnResult.sessionId;

      // Start output streaming
      this.outputStream.startStreaming({
        sessionId: actualSessionId,
        workspaceId: params.workspaceId,
        agentId: spawnParams.agentId,
        agentType: 'devops',
      });

      // Start health monitoring
      this.healthMonitor.startMonitoring(actualSessionId);

      // Wait for session completion with timeout
      const completionResult = await this.waitForSessionCompletion(
        actualSessionId,
        SMOKE_TEST_TIMEOUT_MS,
      );

      // Stop monitoring and streaming
      this.healthMonitor.stopMonitoring(actualSessionId);
      await this.outputStream.stopStreaming(actualSessionId);

      // Extract results from CLI output
      const bufferedLines = await this.outputStream.getBufferedOutput(actualSessionId);
      const bufferedOutput = Array.isArray(bufferedLines) ? bufferedLines.join('\n') : String(bufferedLines);
      const results = this.parseResults(bufferedOutput, params.deploymentUrl, startTime);

      if (completionResult.exitCode !== 0 && completionResult.exitCode !== null) {
        this.logger.warn(
          `Smoke test CLI session exited with code ${completionResult.exitCode}`,
        );
        // If CLI failed but we got some results, mark as failed
        results.passed = false;
        results.details = `CLI session exited with code ${completionResult.exitCode}. ${results.details}`;
      }

      return results;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown smoke test error';
      this.logger.error(`Smoke test execution failed: ${errorMessage}`);

      return this.buildDefaultFailedResults(
        params.deploymentUrl,
        startTime,
        errorMessage,
      );
    }
  }

  /**
   * Parse smoke test results from CLI output.
   * Looks for structured JSON block in the output.
   */
  private parseResults(
    output: string,
    deploymentUrl: string,
    startTime: number,
  ): DevOpsSmokeTestResults {
    try {
      // Look for JSON block in the output
      const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);

      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1].trim());

        const healthCheck: DevOpsSmokeCheck = parsed.healthCheck || {
          name: 'Health Check',
          url: `${deploymentUrl}/api/health`,
          method: 'GET',
          expectedStatus: 200,
          actualStatus: null,
          passed: false,
          responseTimeMs: null,
          error: 'No health check data in output',
        };

        const apiChecks: DevOpsSmokeCheck[] = parsed.apiChecks || [];

        const allChecks = [healthCheck, ...apiChecks];
        const passedChecks = allChecks.filter((c) => c.passed).length;
        const failedChecks = allChecks.filter((c) => !c.passed).length;

        return {
          passed: healthCheck.passed && failedChecks === 0,
          healthCheck,
          apiChecks,
          totalChecks: allChecks.length,
          passedChecks,
          failedChecks,
          durationMs: Date.now() - startTime,
          details: `${passedChecks}/${allChecks.length} checks passed`,
        };
      }
    } catch (parseError: any) {
      this.logger.warn(
        `Failed to parse smoke test results from CLI output: ${parseError?.message}`,
      );
    }

    // Fallback: could not parse, build default failed results
    return this.buildDefaultFailedResults(
      deploymentUrl,
      startTime,
      'Could not parse smoke test results from CLI output',
    );
  }

  /**
   * Build default failed smoke test results.
   */
  private buildDefaultFailedResults(
    deploymentUrl: string,
    startTime: number,
    error: string,
  ): DevOpsSmokeTestResults {
    const healthCheck: DevOpsSmokeCheck = {
      name: 'Health Check',
      url: `${deploymentUrl}/api/health`,
      method: 'GET',
      expectedStatus: 200,
      actualStatus: null,
      passed: false,
      responseTimeMs: null,
      error,
    };

    return {
      passed: false,
      healthCheck,
      apiChecks: [],
      totalChecks: 1,
      passedChecks: 0,
      failedChecks: 1,
      durationMs: Date.now() - startTime,
      details: error,
    };
  }

  /**
   * Wait for CLI session completion with timeout.
   */
  private waitForSessionCompletion(
    sessionId: string,
    timeoutMs: number,
  ): Promise<{
    exitCode: number | null;
    error: string | null;
  }> {
    return new Promise((resolve) => {
      let timeoutHandle: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.eventEmitter.removeListener('cli:session:completed', onCompleted);
        this.eventEmitter.removeListener('cli:session:failed', onFailed);
      };

      const onCompleted = (event: CLISessionEvent) => {
        if (event.sessionId !== sessionId) return;
        cleanup();
        resolve({
          exitCode: event.metadata?.exitCode ?? 0,
          error: null,
        });
      };

      const onFailed = (event: CLISessionEvent) => {
        if (event.sessionId !== sessionId) return;
        cleanup();
        resolve({
          exitCode: event.metadata?.exitCode ?? 1,
          error: event.metadata?.error || 'CLI session failed',
        });
      };

      timeoutHandle = setTimeout(() => {
        this.eventEmitter.removeListener('cli:session:completed', onCompleted);
        this.eventEmitter.removeListener('cli:session:failed', onFailed);

        // Terminate the timed-out CLI session to free resources
        this.lifecycleService.terminateSession(sessionId).catch((err) => {
          this.logger.warn(
            `Failed to terminate timed-out smoke test session ${sessionId}: ${err?.message}`,
          );
        });

        resolve({
          exitCode: null,
          error: `Smoke test timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      this.eventEmitter.on('cli:session:completed', onCompleted);
      this.eventEmitter.on('cli:session:failed', onFailed);
    });
  }
}
