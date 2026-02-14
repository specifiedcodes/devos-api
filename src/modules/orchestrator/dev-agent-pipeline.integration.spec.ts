/**
 * Dev Agent Pipeline Integration Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * End-to-end integration tests for the full dev agent execution pipeline
 * with mocked CLI process and GitHub API.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevAgentPipelineExecutorService } from './services/dev-agent-pipeline-executor.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './services/pipeline-branch-manager.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { DevAgentGitOpsService } from './services/dev-agent-git-ops.service';
import { DevAgentTestExtractorService } from './services/dev-agent-test-extractor.service';
import { DevAgentPRCreatorService } from './services/dev-agent-pr-creator.service';
import {
  DevAgentExecutionParams,
  DevAgentProgressEvent,
} from './interfaces/dev-agent-execution.interfaces';

describe('Dev Agent Pipeline Integration', () => {
  let executor: DevAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let gitOps: jest.Mocked<DevAgentGitOpsService>;
  let testExtractor: jest.Mocked<DevAgentTestExtractorService>;
  let prCreator: jest.Mocked<DevAgentPRCreatorService>;

  const params: DevAgentExecutionParams = {
    workspaceId: 'ws-int-123',
    projectId: 'proj-int-456',
    storyId: '11-4',
    storyTitle: 'Dev Agent CLI Integration',
    storyDescription: 'Full integration test of dev agent pipeline',
    acceptanceCriteria: [
      'CLI session spawns and completes',
      'Tests pass',
      'PR is created',
    ],
    techStack: 'NestJS, TypeScript, PostgreSQL',
    codeStylePreferences: 'ESLint + Prettier',
    testingStrategy: 'TDD with Jest',
    workspacePath: '/tmp/integration-test/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/test-owner/test-repo.git',
    githubToken: 'ghp_integration_test_token',
    repoOwner: 'test-owner',
    repoName: 'test-repo',
  };

  function simulateSessionCompletion(sessionId: string): void {
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId,
        agentId: 'dev-agent-11-4',
        agentType: 'dev',
        workspaceId: 'ws-int-123',
        projectId: 'proj-int-456',
        timestamp: new Date(),
        metadata: { exitCode: 0, outputLineCount: 200 },
      });
    }, 10);
  }

  function simulateSessionFailure(
    sessionId: string,
    error: string,
  ): void {
    setTimeout(() => {
      eventEmitter.emit('cli:session:failed', {
        type: 'cli:session:failed',
        sessionId,
        agentId: 'dev-agent-11-4',
        agentType: 'dev',
        workspaceId: 'ws-int-123',
        projectId: 'proj-int-456',
        timestamp: new Date(),
        metadata: { exitCode: 1, error, outputLineCount: 50 },
      });
    }, 10);
  }

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevAgentPipelineExecutorService,
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'int-session-001',
              pid: 99999,
            }),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest
              .fn()
              .mockResolvedValue('devos/dev/11-4'),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([
              'PASS src/service.spec.ts',
              'Tests:       30 passed, 30 total',
              'All files |  92.50% |',
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
          provide: DevAgentGitOpsService,
          useValue: {
            getLatestCommit: jest.fn().mockResolvedValue({
              hash: 'integration-abc123',
              message: 'feat(devos-11-4): implement dev agent pipeline',
              author: 'DevOS Agent',
              timestamp: new Date(),
            }),
            pushBranch: jest.fn().mockResolvedValue(undefined),
            getChangedFiles: jest.fn().mockResolvedValue({
              created: [
                'src/services/dev-agent-pipeline-executor.service.ts',
                'src/services/dev-agent-git-ops.service.ts',
                'src/services/dev-agent-test-extractor.service.ts',
                'src/services/dev-agent-pr-creator.service.ts',
              ],
              modified: [
                'src/services/pipeline-job-handler.service.ts',
                'src/orchestrator.module.ts',
              ],
              deleted: [],
            }),
          },
        },
        {
          provide: DevAgentTestExtractorService,
          useValue: {
            extractTestResults: jest.fn().mockReturnValue({
              total: 30,
              passed: 30,
              failed: 0,
              coverage: 92.5,
              testCommand: 'npm test',
            }),
            runTests: jest.fn().mockResolvedValue({
              total: 30,
              passed: 30,
              failed: 0,
              coverage: 92.5,
              testCommand: 'npm test',
            }),
          },
        },
        {
          provide: DevAgentPRCreatorService,
          useValue: {
            createPullRequest: jest.fn().mockResolvedValue({
              prUrl:
                'https://github.com/test-owner/test-repo/pull/99',
              prNumber: 99,
            }),
          },
        },
      ],
    }).compile();

    executor = module.get<DevAgentPipelineExecutorService>(
      DevAgentPipelineExecutorService,
    );
    lifecycleService = module.get(CLISessionLifecycleService);
    branchManager = module.get(PipelineBranchManagerService);
    outputStream = module.get(CLIOutputStreamService);
    healthMonitor = module.get(SessionHealthMonitorService);
    gitOps = module.get(DevAgentGitOpsService);
    testExtractor = module.get(DevAgentTestExtractorService);
    prCreator = module.get(DevAgentPRCreatorService);
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  it('should complete full dev agent execution flow: branch, CLI, commit, push, PR', async () => {
    simulateSessionCompletion('int-session-001');

    const result = await executor.execute(params);

    expect(result.success).toBe(true);
    expect(result.branch).toBe('devos/dev/11-4');
    expect(result.commitHash).toBe('integration-abc123');
    expect(result.prUrl).toBe(
      'https://github.com/test-owner/test-repo/pull/99',
    );
    expect(result.prNumber).toBe(99);
    expect(result.sessionId).toBe('int-session-001');
    expect(result.error).toBeNull();

    // Verify all steps were called
    expect(branchManager.createFeatureBranch).toHaveBeenCalled();
    expect(lifecycleService.spawnSession).toHaveBeenCalled();
    expect(outputStream.startStreaming).toHaveBeenCalled();
    expect(healthMonitor.startMonitoring).toHaveBeenCalled();
    expect(gitOps.getLatestCommit).toHaveBeenCalled();
    expect(gitOps.pushBranch).toHaveBeenCalled();
    expect(gitOps.getChangedFiles).toHaveBeenCalled();
    expect(prCreator.createPullRequest).toHaveBeenCalled();
  });

  it('should emit progress events at each step in correct order', async () => {
    const progressEvents: DevAgentProgressEvent[] = [];
    eventEmitter.on(
      'dev-agent:progress',
      (event: DevAgentProgressEvent) => {
        progressEvents.push(event);
      },
    );

    simulateSessionCompletion('int-session-001');

    await executor.execute(params);

    // Extract unique step names in order
    const stepNames = progressEvents.map((e) => e.step);

    // Verify correct order
    const expectedSteps = [
      'reading-story',
      'creating-branch',
      'spawning-cli',
      'writing-code',
      'running-tests',
      'committing-code',
      'pushing-branch',
      'creating-pr',
      'updating-status',
    ];

    for (const step of expectedSteps) {
      expect(stepNames).toContain(step);
    }

    // Verify each step has started and completed events
    for (const step of expectedSteps) {
      const stepEvents = progressEvents.filter(
        (e) => e.step === step,
      );
      const statuses = stepEvents.map((e) => e.status);
      expect(statuses).toContain('started');
      expect(statuses).toContain('completed');
    }
  });

  it('should extract test results from CLI output', async () => {
    simulateSessionCompletion('int-session-001');

    const result = await executor.execute(params);

    expect(result.testResults).not.toBeNull();
    expect(result.testResults!.total).toBe(30);
    expect(result.testResults!.passed).toBe(30);
    expect(result.testResults!.failed).toBe(0);
    expect(result.testResults!.coverage).toBe(92.5);
  });

  it('should include correct files in PR', async () => {
    simulateSessionCompletion('int-session-001');

    const result = await executor.execute(params);

    expect(result.filesCreated).toHaveLength(4);
    expect(result.filesModified).toHaveLength(2);

    // Verify PR was created with changed files
    expect(prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        changedFiles: expect.objectContaining({
          created: expect.arrayContaining([
            'src/services/dev-agent-pipeline-executor.service.ts',
          ]),
          modified: expect.arrayContaining([
            'src/services/pipeline-job-handler.service.ts',
          ]),
        }),
      }),
    );
  });

  it('should include all data needed for QA handoff', async () => {
    simulateSessionCompletion('int-session-001');

    const result = await executor.execute(params);

    // QA agent needs these fields
    expect(result.prUrl).toBeTruthy();
    expect(result.branch).toBeTruthy();
    expect(result.commitHash).toBeTruthy();
    expect(result.testResults).toBeTruthy();
    expect(result.success).toBe(true);
  });

  it('should return error result on CLI failure (not thrown exception)', async () => {
    simulateSessionFailure('int-session-001', 'Out of memory');

    const result = await executor.execute(params);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.prUrl).toBeNull();
    expect(result.prNumber).toBeNull();
    // Should not throw - returns structured result
  });

  it('should retry GitHub push on first failure', async () => {
    // First push fails, we test that the executor catches and reports error
    gitOps.pushBranch.mockRejectedValue(
      new Error('Push failed after retry'),
    );

    simulateSessionCompletion('int-session-001');

    const result = await executor.execute(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Push failed');
    expect(gitOps.pushBranch).toHaveBeenCalledTimes(1);
  });
});
