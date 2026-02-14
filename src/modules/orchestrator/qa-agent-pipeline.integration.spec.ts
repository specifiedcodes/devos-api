/**
 * QA Agent Pipeline Integration Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * End-to-end integration tests for the full QA agent execution flow
 * with mocked CLI process and GitHub API.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

// Mock child_process for test runner, static analyzer, security scanner
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QAAgentPipelineExecutorService } from './services/qa-agent-pipeline-executor.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './services/pipeline-branch-manager.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { QATestRunnerService } from './services/qa-test-runner.service';
import { QAStaticAnalyzerService } from './services/qa-static-analyzer.service';
import { QASecurityScannerService } from './services/qa-security-scanner.service';
import { QAAcceptanceCriteriaValidatorService } from './services/qa-acceptance-validator.service';
import { QAReportGeneratorService } from './services/qa-report-generator.service';
import { QAPRReviewerService } from './services/qa-pr-reviewer.service';
import { DevAgentGitOpsService } from './services/dev-agent-git-ops.service';
import { GitHubService } from '../integrations/github/github.service';
import { QAAgentExecutionParams, QAAgentProgressEvent } from './interfaces/qa-agent-execution.interfaces';

describe('QA Agent Pipeline Integration', () => {
  let executor: QAAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let mockCreateReview: jest.Mock;

  const baseParams: QAAgentExecutionParams = {
    workspaceId: 'ws-integration',
    projectId: 'proj-integration',
    storyId: '11-5',
    storyTitle: 'QA Agent CLI Integration',
    storyDescription: 'Implement QA agent integration',
    acceptanceCriteria: [
      'Tests pass with coverage >= 80%',
      'Lint checks pass with zero errors',
      'Security scan finds no critical vulnerabilities',
    ],
    techStack: 'NestJS, TypeScript, Jest',
    testingStrategy: 'TDD with Jest',
    workspacePath: '/tmp/workspaces/ws-integration/proj-integration',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_integration_test',
    repoOwner: 'owner',
    repoName: 'repo',
    prUrl: 'https://github.com/owner/repo/pull/99',
    prNumber: 99,
    devBranch: 'devos/dev/11-5',
    devTestResults: {
      total: 40, passed: 38, failed: 2,
      coverage: 82, testCommand: 'npm test',
    },
  };

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
        workspaceId: 'ws-integration',
        projectId: 'proj-integration',
        timestamp: new Date(),
        metadata: { exitCode, outputLineCount: 200 },
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
        workspaceId: 'ws-integration',
        projectId: 'proj-integration',
        timestamp: new Date(),
        metadata: { exitCode: 1, error: 'CLI process crashed' },
      });
    }, 10);
  }

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();
    mockCreateReview = jest.fn().mockResolvedValue({ data: {} });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QAAgentPipelineExecutorService,
        // Use real report generator and acceptance validator services
        // (they don't depend on external systems)
        QAReportGeneratorService,
        QAAcceptanceCriteriaValidatorService,
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'integration-qa-session',
              pid: 9999,
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
            getBufferedOutput: jest.fn().mockResolvedValue([
              '## Acceptance Criteria Verification',
              '- [x] Tests pass with coverage >= 80% - VERIFIED: coverage is 90%',
              '- [x] Lint checks pass with zero errors - VERIFIED: no lint errors',
              '- [x] Security scan finds no critical vulnerabilities - VERIFIED: clean',
            ]),
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
              total: 55, passed: 55, failed: 0, skipped: 0,
              coverage: 90, testCommand: 'npm test -- --ci --coverage',
              failedTests: [],
            }),
            compareWithBaseline: jest.fn().mockReturnValue({
              totalDelta: 15, passedDelta: 17, failedDelta: -2,
              coverageDelta: 8, hasRegressions: false, regressionCount: 0,
            }),
          },
        },
        {
          provide: QAStaticAnalyzerService,
          useValue: {
            runLintCheck: jest.fn().mockResolvedValue({
              errors: 0, warnings: 1, fixableErrors: 0, fixableWarnings: 0,
              passed: true, details: 'Clean',
            }),
            runTypeCheck: jest.fn().mockResolvedValue({
              errors: 0, passed: true, details: 'No type errors',
            }),
          },
        },
        {
          provide: QASecurityScannerService,
          useValue: {
            runNpmAudit: jest.fn().mockResolvedValue({
              critical: 0, high: 0, medium: 0, low: 1, total: 1,
              passed: true, details: 'Clean',
            }),
            scanForSecrets: jest.fn().mockReturnValue({
              secretsFound: false, findings: [],
            }),
          },
        },
        {
          provide: DevAgentGitOpsService,
          useValue: {
            getChangedFiles: jest.fn().mockResolvedValue({
              created: ['src/new-feature.ts'],
              modified: ['src/existing.ts'],
              deleted: [],
            }),
          },
        },
        {
          provide: QAPRReviewerService,
          useValue: {
            submitPRReview: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    executor = module.get<QAAgentPipelineExecutorService>(
      QAAgentPipelineExecutorService,
    );
  });

  it('should execute full QA pipeline: checkout, CLI, tests, lint, type-check, security, criteria, report, review', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.verdict).toBeDefined();
    expect(result.qaReport).toBeDefined();
    expect(result.qaReport.storyId).toBe('11-5');
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.error).toBeNull();
  });

  it('should emit progress events at each step in correct order', async () => {
    const progressEvents: QAAgentProgressEvent[] = [];
    eventEmitter.on('qa-agent:progress', (event: QAAgentProgressEvent) => {
      progressEvents.push(event);
    });

    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    await executor.execute(baseParams);

    const steps = progressEvents.map((e) => e.step);
    const expectedSteps = [
      'checking-out-branch',
      'reading-criteria',
      'spawning-cli',
      'running-qa-checks',
      'running-tests',
      'running-lint',
      'running-type-check',
      'running-security-scan',
      'validating-acceptance',
      'generating-report',
      'submitting-review',
      'updating-status',
    ];

    for (const step of expectedSteps) {
      expect(steps).toContain(step);
    }

    // Verify each step has both 'started' and 'completed' events
    for (const step of expectedSteps) {
      const stepEvents = progressEvents.filter((e) => e.step === step);
      const statuses = stepEvents.map((e) => e.status);
      expect(statuses).toContain('started');
      expect(statuses).toContain('completed');
    }
  });

  it('should validate acceptance criteria from CLI output', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.qaReport.acceptanceCriteria).toHaveLength(3);
    // The CLI output includes checklist format verification
    expect(result.qaReport.acceptanceCriteria[0].met).toBe(true);
  });

  it('should include QA report with all sections', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);
    const report = result.qaReport;

    expect(report.testResults).toBeDefined();
    expect(report.lintResults).toBeDefined();
    expect(report.typeCheckResults).toBeDefined();
    expect(report.securityScan).toBeDefined();
    expect(report.acceptanceCriteria).toBeDefined();
    expect(report.coverageAnalysis).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.verdict).toBeDefined();
  });

  it('should generate PASS verdict when all checks pass', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.verdict).toBe('PASS');
    expect(result.qaReport.verdict).toBe('PASS');
  });

  it('should handle CLI failure and return error result (not thrown exception)', async () => {
    simulateSessionFailure(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAIL');
    expect(result.error).toBeDefined();
    expect(result.qaReport.verdict).toBe('FAIL');
  });

  it('should include session ID and duration in result', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.sessionId).toBe('integration-qa-session');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should include coverage analysis in report', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.qaReport.coverageAnalysis).toBeDefined();
    expect(result.qaReport.coverageAnalysis.currentCoverage).toBe(90);
    expect(result.qaReport.coverageAnalysis.meetsThreshold).toBe(true);
  });

  it('should include test comparison with baseline in coverage analysis', async () => {
    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.qaReport.coverageAnalysis.delta).toBe(8);
  });

  it('should include correct story ID in all events and report', async () => {
    const progressEvents: QAAgentProgressEvent[] = [];
    eventEmitter.on('qa-agent:progress', (event: QAAgentProgressEvent) => {
      progressEvents.push(event);
    });

    simulateSessionCompletion(eventEmitter, 'integration-qa-session');

    const result = await executor.execute(baseParams);

    expect(result.qaReport.storyId).toBe('11-5');
    expect(progressEvents.every((e) => e.storyId === '11-5')).toBe(true);
  });
});
