/**
 * QAAgentPipelineExecutorService
 * Story 11.5: QA Agent CLI Integration
 *
 * Orchestrates the full QA Agent quality assurance workflow via CLI:
 * 1. Check out the Dev Agent's feature branch
 * 2. Read story acceptance criteria
 * 3. Spawn Claude Code CLI with QA task
 * 4. Run existing test suite
 * 5. Write additional tests for coverage gaps (via CLI)
 * 6. Perform static analysis (lint, type check)
 * 7. Check for security vulnerabilities (npm audit)
 * 8. Scan for hardcoded secrets
 * 9. Validate acceptance criteria compliance
 * 10. Generate QA report with verdict
 * 11. Comment on PR with results and approve/request changes
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { QATestRunnerService } from './qa-test-runner.service';
import { QAStaticAnalyzerService } from './qa-static-analyzer.service';
import { QASecurityScannerService } from './qa-security-scanner.service';
import { QAAcceptanceCriteriaValidatorService } from './qa-acceptance-validator.service';
import { QAReportGeneratorService } from './qa-report-generator.service';
import { QAPRReviewerService } from './qa-pr-reviewer.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { buildQAPipelinePrompt } from '../prompts/qa-agent-pipeline.prompts';
import {
  QAAgentExecutionParams,
  QAAgentExecutionResult,
  QAAgentProgressEvent,
  QAAgentStep,
  QA_AGENT_STEP_PROGRESS,
  QAReport,
} from '../interfaces/qa-agent-execution.interfaces';
import {
  CLISessionSpawnParams,
  CLISessionEvent,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

@Injectable()
export class QAAgentPipelineExecutorService {
  private readonly logger = new Logger(
    QAAgentPipelineExecutorService.name,
  );

  constructor(
    private readonly lifecycleService: CLISessionLifecycleService,
    private readonly branchManager: PipelineBranchManagerService,
    private readonly outputStream: CLIOutputStreamService,
    private readonly healthMonitor: SessionHealthMonitorService,
    private readonly testRunner: QATestRunnerService,
    private readonly staticAnalyzer: QAStaticAnalyzerService,
    private readonly securityScanner: QASecurityScannerService,
    private readonly acceptanceValidator: QAAcceptanceCriteriaValidatorService,
    private readonly reportGenerator: QAReportGeneratorService,
    private readonly prReviewer: QAPRReviewerService,
    private readonly gitOps: DevAgentGitOpsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Execute a full QA cycle for a story.
   * Coordinates CLI session, test execution, and PR feedback.
   *
   * @param params - QA agent execution parameters
   * @returns QAAgentExecutionResult with verdict, test results, report
   */
  async execute(
    params: QAAgentExecutionParams,
  ): Promise<QAAgentExecutionResult> {
    const startTime = Date.now();
    let sessionId = `qa-pipeline-${params.storyId}-${Date.now()}`;

    this.logger.log(
      `Starting QA agent execution for story ${params.storyId}: ${params.storyTitle}`,
    );

    try {
      // Step 1: Check out dev agent's feature branch
      this.emitProgress(
        sessionId,
        params,
        'checking-out-branch',
        'started',
        `Checking out dev branch: ${params.devBranch}`,
      );

      await this.branchManager.createFeatureBranch({
        workspacePath: params.workspacePath,
        agentType: 'dev',
        storyId: params.storyId,
      });

      this.emitProgress(
        sessionId,
        params,
        'checking-out-branch',
        'completed',
        `Dev branch checked out: ${params.devBranch}`,
      );

      // Step 2: Build QA-specific prompt
      this.emitProgress(
        sessionId,
        params,
        'reading-criteria',
        'started',
        'Building QA prompt with acceptance criteria',
      );

      const taskPrompt = buildQAPipelinePrompt(params);

      this.emitProgress(
        sessionId,
        params,
        'reading-criteria',
        'completed',
        `QA prompt built with ${params.acceptanceCriteria.length} criteria`,
      );

      // Step 3: Spawn CLI session
      this.emitProgress(
        sessionId,
        params,
        'spawning-cli',
        'started',
        'Spawning Claude Code CLI session for QA',
      );

      const spawnParams: CLISessionSpawnParams = {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        agentId: `qa-agent-${params.storyId}`,
        agentType: 'qa',
        task: taskPrompt,
        storyId: params.storyId,
        gitRepoUrl: params.gitRepoUrl,
        pipelineContext: {
          projectId: params.projectId,
          workspaceId: params.workspaceId,
          workflowId: `qa-pipeline-${params.storyId}`,
          currentState: PipelineState.QA,
          previousState: null,
          stateEnteredAt: new Date(),
          activeAgentId: null,
          activeAgentType: 'qa',
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
        agentType: 'qa',
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

      // Step 4: Wait for CLI to run QA checks
      this.emitProgress(
        sessionId,
        params,
        'running-qa-checks',
        'started',
        'CLI is performing QA analysis',
      );

      const completionResult =
        await this.waitForSessionCompletion(sessionId);

      // Stop monitoring and streaming
      this.healthMonitor.stopMonitoring(sessionId);
      await this.outputStream.stopStreaming(sessionId);

      this.emitProgress(
        sessionId,
        params,
        'running-qa-checks',
        'completed',
        'CLI QA analysis completed',
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
          'running-qa-checks',
          'failed',
          errorDetail,
        );

        return this.buildFailureResult(
          sessionId,
          params,
          startTime,
          completionResult.error || errorDetail,
        );
      }

      // Step 5: Run test suite
      this.emitProgress(
        sessionId,
        params,
        'running-tests',
        'started',
        'Running test suite',
      );

      const testResults = await this.testRunner.runTestSuite(
        params.workspacePath,
      );
      const testComparison = this.testRunner.compareWithBaseline(
        testResults,
        params.devTestResults,
      );

      this.emitProgress(
        sessionId,
        params,
        'running-tests',
        'completed',
        `Tests: ${testResults.passed}/${testResults.total} passed` +
          (testResults.coverage !== null ? `, Coverage: ${testResults.coverage}%` : ''),
      );

      // Step 6: Run lint check
      this.emitProgress(
        sessionId,
        params,
        'running-lint',
        'started',
        'Running lint check',
      );

      const lintResults = await this.staticAnalyzer.runLintCheck(
        params.workspacePath,
      );

      this.emitProgress(
        sessionId,
        params,
        'running-lint',
        'completed',
        lintResults.passed
          ? 'Lint check passed'
          : `Lint: ${lintResults.errors} error(s), ${lintResults.warnings} warning(s)`,
      );

      // Step 7: Run type check
      this.emitProgress(
        sessionId,
        params,
        'running-type-check',
        'started',
        'Running TypeScript type check',
      );

      const typeCheckResults = await this.staticAnalyzer.runTypeCheck(
        params.workspacePath,
      );

      this.emitProgress(
        sessionId,
        params,
        'running-type-check',
        'completed',
        typeCheckResults.passed
          ? 'Type check passed'
          : `Type check: ${typeCheckResults.errors} error(s)`,
      );

      // Step 8: Security scanning
      this.emitProgress(
        sessionId,
        params,
        'running-security-scan',
        'started',
        'Running security scan',
      );

      const changedFiles = await this.gitOps.getChangedFiles(
        params.workspacePath,
        params.devBranch,
      );
      const allChangedFiles = [
        ...changedFiles.created,
        ...changedFiles.modified,
      ];

      const securityScan = await this.securityScanner.runNpmAudit(
        params.workspacePath,
      );
      const secretScan = this.securityScanner.scanForSecrets(
        params.workspacePath,
        allChangedFiles,
      );

      this.emitProgress(
        sessionId,
        params,
        'running-security-scan',
        'completed',
        securityScan.passed && !secretScan.secretsFound
          ? 'Security scan passed'
          : `Security: ${securityScan.total} vulnerabilities, ${secretScan.findings.length} secrets found`,
      );

      // Step 9: Validate acceptance criteria
      this.emitProgress(
        sessionId,
        params,
        'validating-acceptance',
        'started',
        'Validating acceptance criteria',
      );

      const bufferedOutput =
        await this.outputStream.getBufferedOutput(sessionId);
      const acceptanceCriteriaResults =
        this.acceptanceValidator.extractAcceptanceCriteriaResults(
          bufferedOutput,
          params.acceptanceCriteria,
        );

      // Count additional tests written from CLI output
      const additionalTestsWritten =
        this.countAdditionalTests(bufferedOutput);

      this.emitProgress(
        sessionId,
        params,
        'validating-acceptance',
        'completed',
        `${acceptanceCriteriaResults.filter((c) => c.met).length}/${acceptanceCriteriaResults.length} criteria met`,
      );

      // Step 10: Generate report
      this.emitProgress(
        sessionId,
        params,
        'generating-report',
        'started',
        'Generating QA report',
      );

      const qaReport = this.reportGenerator.buildReport({
        storyId: params.storyId,
        testResults,
        testComparison,
        lintResults,
        typeCheckResults: typeCheckResults,
        securityScan,
        secretScan,
        acceptanceCriteria: acceptanceCriteriaResults,
        additionalTestsWritten,
      });

      this.emitProgress(
        sessionId,
        params,
        'generating-report',
        'completed',
        `QA report generated: verdict = ${qaReport.verdict}`,
      );

      // Step 11: Submit PR review
      this.emitProgress(
        sessionId,
        params,
        'submitting-review',
        'started',
        `Submitting PR review for PR #${params.prNumber}`,
      );

      await this.prReviewer.submitPRReview({
        githubToken: params.githubToken,
        repoOwner: params.repoOwner,
        repoName: params.repoName,
        prNumber: params.prNumber,
        report: qaReport,
        verdict: qaReport.verdict,
      });

      this.emitProgress(
        sessionId,
        params,
        'submitting-review',
        'completed',
        'PR review submitted',
      );

      // Step 12: Update status
      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'started',
        'Finalizing execution result',
      );

      const result: QAAgentExecutionResult = {
        success: true,
        verdict: qaReport.verdict,
        qaReport,
        additionalTestsWritten,
        sessionId,
        durationMs: Date.now() - startTime,
        error: null,
      };

      this.emitProgress(
        sessionId,
        params,
        'updating-status',
        'completed',
        `QA agent execution completed: ${qaReport.verdict}`,
      );

      this.logger.log(
        `QA agent execution completed for story ${params.storyId} in ${result.durationMs}ms: ${qaReport.verdict}`,
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
        `QA agent execution failed for story ${params.storyId}: ${errorMessage}`,
      );

      return this.buildFailureResult(
        sessionId,
        params,
        startTime,
        errorMessage,
      );
    }
  }

  /**
   * Emit a progress event to the workspace WebSocket room.
   */
  private emitProgress(
    sessionId: string,
    params: QAAgentExecutionParams,
    step: QAAgentStep,
    status: 'started' | 'completed' | 'failed',
    details: string,
  ): void {
    const event: QAAgentProgressEvent = {
      type: 'qa-agent:progress',
      sessionId,
      storyId: params.storyId,
      workspaceId: params.workspaceId,
      step,
      status,
      details,
      timestamp: new Date(),
    };

    this.eventEmitter.emit('qa-agent:progress', event);

    const percentage = QA_AGENT_STEP_PROGRESS[step];
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

  /**
   * Count additional test files written by the QA agent from CLI output.
   */
  private countAdditionalTests(output: string[]): number {
    const testFilePattern = /test\(devos-.*\):/i;
    let count = 0;

    for (const line of output) {
      if (testFilePattern.test(line)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Build a failure result with empty/default QA report.
   */
  private buildFailureResult(
    sessionId: string,
    params: QAAgentExecutionParams,
    startTime: number,
    errorMessage: string,
  ): QAAgentExecutionResult {
    const emptyReport: QAReport = {
      storyId: params.storyId,
      verdict: 'FAIL',
      testResults: {
        total: 0, passed: 0, failed: 0, skipped: 0,
        coverage: null, testCommand: '', failedTests: [],
      },
      securityScan: {
        critical: 0, high: 0, medium: 0, low: 0, total: 0,
        passed: true, details: '',
      },
      lintResults: {
        errors: 0, warnings: 0, fixableErrors: 0, fixableWarnings: 0,
        passed: true, details: '',
      },
      typeCheckResults: {
        errors: 0, passed: true, details: '',
      },
      acceptanceCriteria: [],
      coverageAnalysis: {
        currentCoverage: null,
        baselineCoverage: null,
        delta: null,
        meetsThreshold: false,
      },
      comments: [`QA execution failed: ${errorMessage}`],
      summary: `QA execution failed: ${errorMessage}`,
    };

    return {
      success: false,
      verdict: 'FAIL',
      qaReport: emptyReport,
      additionalTestsWritten: 0,
      sessionId,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
