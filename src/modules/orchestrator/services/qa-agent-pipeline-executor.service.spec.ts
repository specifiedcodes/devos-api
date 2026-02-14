/**
 * QAAgentPipelineExecutorService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for the main QA agent orchestrator that coordinates
 * CLI session, test execution, static analysis, security scanning,
 * acceptance criteria validation, and PR review submission.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QAAgentPipelineExecutorService } from './qa-agent-pipeline-executor.service';
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
import { QAAgentExecutionParams } from '../interfaces/qa-agent-execution.interfaces';

describe('QAAgentPipelineExecutorService', () => {
  let service: QAAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let testRunner: jest.Mocked<QATestRunnerService>;
  let staticAnalyzer: jest.Mocked<QAStaticAnalyzerService>;
  let securityScanner: jest.Mocked<QASecurityScannerService>;
  let acceptanceValidator: jest.Mocked<QAAcceptanceCriteriaValidatorService>;
  let reportGenerator: jest.Mocked<QAReportGeneratorService>;
  let prReviewer: jest.Mocked<QAPRReviewerService>;
  let gitOps: jest.Mocked<DevAgentGitOpsService>;

  const baseParams: QAAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: '11-5',
    storyTitle: 'QA Agent CLI Integration',
    storyDescription: 'Implement QA agent CLI integration',
    acceptanceCriteria: ['Tests pass', 'Coverage >= 80%'],
    techStack: 'NestJS, TypeScript',
    testingStrategy: 'TDD with Jest',
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
    prUrl: 'https://github.com/owner/repo/pull/42',
    prNumber: 42,
    devBranch: 'devos/dev/11-5',
    devTestResults: {
      total: 50, passed: 48, failed: 2,
      coverage: 85, testCommand: 'npm test',
    },
  };

  /**
   * Helper to simulate CLI session completion.
   */
  function simulateSessionCompletion(
    emitter: EventEmitter2,
    sessionId: string,
    exitCode: number = 0,
  ): void {
    setTimeout(() => {
      emitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId,
        agentId: 'qa-agent-11-5',
        agentType: 'qa',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: { exitCode, outputLineCount: 100 },
      });
    }, 10);
  }

  function simulateSessionFailure(
    emitter: EventEmitter2,
    sessionId: string,
  ): void {
    setTimeout(() => {
      emitter.emit('cli:session:failed', {
        type: 'cli:session:failed',
        sessionId,
        agentId: 'qa-agent-11-5',
        agentType: 'qa',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: { exitCode: 1, error: 'CLI crashed' },
      });
    }, 10);
  }

  const passingReport = {
    storyId: '11-5',
    verdict: 'PASS' as const,
    testResults: {
      total: 50, passed: 50, failed: 0, skipped: 0,
      coverage: 85, testCommand: 'npm test', failedTests: [],
    },
    securityScan: {
      critical: 0, high: 0, medium: 0, low: 0, total: 0,
      passed: true, details: '',
    },
    lintResults: {
      errors: 0, warnings: 0, fixableErrors: 0, fixableWarnings: 0,
      passed: true, details: '',
    },
    typeCheckResults: { errors: 0, passed: true, details: '' },
    acceptanceCriteria: [
      { criterion: 'Tests pass', met: true, evidence: 'All pass' },
    ],
    coverageAnalysis: {
      currentCoverage: 85, baselineCoverage: 83, delta: 2, meetsThreshold: true,
    },
    comments: [],
    summary: 'All checks passed',
  };

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QAAgentPipelineExecutorService,
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'qa-session-123',
              pid: 1234,
            }),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest.fn().mockResolvedValue('devos/dev/11-5'),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            startMonitoring: jest.fn(),
            stopMonitoring: jest.fn(),
          },
        },
        {
          provide: QATestRunnerService,
          useValue: {
            runTestSuite: jest.fn().mockResolvedValue({
              total: 50, passed: 50, failed: 0, skipped: 0,
              coverage: 85, testCommand: 'npm test', failedTests: [],
            }),
            compareWithBaseline: jest.fn().mockReturnValue({
              totalDelta: 0, passedDelta: 2, failedDelta: -2,
              coverageDelta: 0, hasRegressions: false, regressionCount: 0,
            }),
          },
        },
        {
          provide: QAStaticAnalyzerService,
          useValue: {
            runLintCheck: jest.fn().mockResolvedValue({
              errors: 0, warnings: 0, fixableErrors: 0, fixableWarnings: 0,
              passed: true, details: 'Clean',
            }),
            runTypeCheck: jest.fn().mockResolvedValue({
              errors: 0, passed: true, details: 'No errors',
            }),
          },
        },
        {
          provide: QASecurityScannerService,
          useValue: {
            runNpmAudit: jest.fn().mockResolvedValue({
              critical: 0, high: 0, medium: 0, low: 0, total: 0,
              passed: true, details: '',
            }),
            scanForSecrets: jest.fn().mockReturnValue({
              secretsFound: false, findings: [],
            }),
          },
        },
        {
          provide: QAAcceptanceCriteriaValidatorService,
          useValue: {
            extractAcceptanceCriteriaResults: jest.fn().mockReturnValue([
              { criterion: 'Tests pass', met: true, evidence: 'All pass' },
              { criterion: 'Coverage >= 80%', met: true, evidence: '85%' },
            ]),
          },
        },
        {
          provide: QAReportGeneratorService,
          useValue: {
            buildReport: jest.fn().mockReturnValue(passingReport),
          },
        },
        {
          provide: QAPRReviewerService,
          useValue: {
            submitPRReview: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DevAgentGitOpsService,
          useValue: {
            getChangedFiles: jest.fn().mockResolvedValue({
              created: ['src/new.ts'], modified: ['src/existing.ts'], deleted: [],
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QAAgentPipelineExecutorService>(
      QAAgentPipelineExecutorService,
    );
    lifecycleService = module.get(CLISessionLifecycleService);
    branchManager = module.get(PipelineBranchManagerService);
    outputStream = module.get(CLIOutputStreamService);
    healthMonitor = module.get(SessionHealthMonitorService);
    testRunner = module.get(QATestRunnerService);
    staticAnalyzer = module.get(QAStaticAnalyzerService);
    securityScanner = module.get(QASecurityScannerService);
    acceptanceValidator = module.get(QAAcceptanceCriteriaValidatorService);
    reportGenerator = module.get(QAReportGeneratorService);
    prReviewer = module.get(QAPRReviewerService);
    gitOps = module.get(DevAgentGitOpsService);
  });

  it('should complete full 10-step QA workflow successfully', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.verdict).toBe('PASS');
    expect(result.error).toBeNull();
  });

  it('should check out dev agent feature branch via PipelineBranchManager', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(branchManager.createFeatureBranch).toHaveBeenCalledWith({
      workspacePath: baseParams.workspacePath,
      agentType: 'dev',
      storyId: baseParams.storyId,
    });
  });

  it('should spawn CLI session via CLISessionLifecycleService', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'qa',
        storyId: '11-5',
      }),
    );
  });

  it('should wait for CLI session completion', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
  });

  it('should run test suite and extract results', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(testRunner.runTestSuite).toHaveBeenCalledWith(
      baseParams.workspacePath,
    );
  });

  it('should compare test results with Dev Agent baseline', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(testRunner.compareWithBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ total: 50 }),
      baseParams.devTestResults,
    );
  });

  it('should run lint check', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(staticAnalyzer.runLintCheck).toHaveBeenCalledWith(
      baseParams.workspacePath,
    );
  });

  it('should run type check', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(staticAnalyzer.runTypeCheck).toHaveBeenCalledWith(
      baseParams.workspacePath,
    );
  });

  it('should run npm audit', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(securityScanner.runNpmAudit).toHaveBeenCalledWith(
      baseParams.workspacePath,
    );
  });

  it('should scan for hardcoded secrets', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(securityScanner.scanForSecrets).toHaveBeenCalledWith(
      baseParams.workspacePath,
      expect.arrayContaining(['src/new.ts', 'src/existing.ts']),
    );
  });

  it('should validate acceptance criteria from CLI output', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(
      acceptanceValidator.extractAcceptanceCriteriaResults,
    ).toHaveBeenCalledWith([], baseParams.acceptanceCriteria);
  });

  it('should generate comprehensive QA report', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(reportGenerator.buildReport).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: '11-5',
      }),
    );
  });

  it('should submit PR review with correct verdict', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    expect(prReviewer.submitPRReview).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        verdict: 'PASS',
      }),
    );
  });

  it('should return PASS verdict when all checks pass', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.verdict).toBe('PASS');
    expect(result.qaReport.verdict).toBe('PASS');
  });

  it('should return FAIL verdict when tests have regressions', async () => {
    const failReport = { ...passingReport, verdict: 'FAIL' as const };
    reportGenerator.buildReport.mockReturnValue(failReport);
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.verdict).toBe('FAIL');
  });

  it('should return FAIL verdict when critical security issues found', async () => {
    const failReport = { ...passingReport, verdict: 'FAIL' as const };
    reportGenerator.buildReport.mockReturnValue(failReport);
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.verdict).toBe('FAIL');
  });

  it('should return NEEDS_CHANGES when coverage below threshold', async () => {
    const needsChangesReport = {
      ...passingReport,
      verdict: 'NEEDS_CHANGES' as const,
    };
    reportGenerator.buildReport.mockReturnValue(needsChangesReport);
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.verdict).toBe('NEEDS_CHANGES');
  });

  it('should handle CLI session failure (non-zero exit code)', async () => {
    simulateSessionFailure(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAIL');
    expect(result.error).toBeDefined();
  });

  it('should emit progress events at each step', async () => {
    const progressEvents: any[] = [];
    eventEmitter.on('qa-agent:progress', (event: any) => {
      progressEvents.push(event);
    });

    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    await service.execute(baseParams);

    // Should have progress events for all steps
    const steps = progressEvents.map((e) => e.step);
    expect(steps).toContain('checking-out-branch');
    expect(steps).toContain('reading-criteria');
    expect(steps).toContain('spawning-cli');
    expect(steps).toContain('running-qa-checks');
    expect(steps).toContain('running-tests');
    expect(steps).toContain('running-lint');
    expect(steps).toContain('running-type-check');
    expect(steps).toContain('running-security-scan');
    expect(steps).toContain('validating-acceptance');
    expect(steps).toContain('generating-report');
    expect(steps).toContain('submitting-review');
    expect(steps).toContain('updating-status');
  });

  it('should set pipeline metadata for DevOps or Dev Agent handoff', async () => {
    simulateSessionCompletion(eventEmitter, 'qa-session-123');

    const result = await service.execute(baseParams);

    expect(result.qaReport).toBeDefined();
    expect(result.qaReport.storyId).toBe('11-5');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should handle branch checkout failure gracefully', async () => {
    branchManager.createFeatureBranch.mockRejectedValue(
      new Error('Branch not found'),
    );

    const result = await service.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Branch not found');
  });
});
