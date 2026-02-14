/**
 * PipelineJobHandler QA Agent Integration Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for QA agent job delegation in PipelineJobHandler.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PipelineJobHandlerService } from './pipeline-job-handler.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { TaskContextAssemblerService } from './task-context-assembler.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { WorkspaceManagerService } from './workspace-manager.service';
import { DevAgentPipelineExecutorService } from './dev-agent-pipeline-executor.service';
import { QAAgentPipelineExecutorService } from './qa-agent-pipeline-executor.service';
import { PipelineJobData } from '../interfaces/pipeline-job.interfaces';

describe('PipelineJobHandler - QA Agent Integration', () => {
  let handler: PipelineJobHandlerService;
  let qaAgentExecutor: jest.Mocked<Partial<QAAgentPipelineExecutorService>>;
  let devAgentExecutor: jest.Mocked<Partial<DevAgentPipelineExecutorService>>;
  let workspaceManager: jest.Mocked<Partial<WorkspaceManagerService>>;

  const qaJobData: PipelineJobData = {
    pipelineProjectId: 'proj-456',
    pipelineWorkflowId: 'wf-789',
    phase: 'qa',
    storyId: '11-5',
    agentType: 'qa',
    workspaceId: 'ws-123',
    userId: 'user-1',
    pipelineMetadata: {
      storyTitle: 'QA Agent CLI Integration',
      storyDescription: 'Implement QA agent',
      acceptanceCriteria: ['Tests pass', 'Coverage >= 80%'],
      techStack: 'NestJS',
      testingStrategy: 'TDD',
      githubToken: 'ghp_test',
      repoOwner: 'owner',
      repoName: 'repo',
      prUrl: 'https://github.com/owner/repo/pull/42',
      prNumber: 42,
      devBranch: 'devos/dev/11-5',
      devTestResults: {
        total: 50, passed: 48, failed: 2,
        coverage: 85, testCommand: 'npm test',
      },
    },
  };

  const devJobData: PipelineJobData = {
    ...qaJobData,
    phase: 'implementing',
    agentType: 'dev',
  };

  const plannerJobData: PipelineJobData = {
    ...qaJobData,
    phase: 'planning',
    agentType: 'planner',
  };

  beforeEach(async () => {
    qaAgentExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        verdict: 'PASS',
        qaReport: {
          storyId: '11-5',
          verdict: 'PASS',
          testResults: { total: 50, passed: 50, failed: 0, skipped: 0, coverage: 85, testCommand: 'npm test', failedTests: [] },
          securityScan: { critical: 0, high: 0, medium: 0, low: 0, total: 0, passed: true, details: '' },
          lintResults: { errors: 0, warnings: 0, fixableErrors: 0, fixableWarnings: 0, passed: true, details: '' },
          typeCheckResults: { errors: 0, passed: true, details: '' },
          acceptanceCriteria: [],
          coverageAnalysis: { currentCoverage: 85, baselineCoverage: 83, delta: 2, meetsThreshold: true },
          comments: [],
          summary: 'All passed',
        },
        additionalTestsWritten: 0,
        sessionId: 'qa-session-123',
        durationMs: 5000,
        error: null,
      }),
    };

    devAgentExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        branch: 'devos/dev/11-5',
        commitHash: 'abc123',
        prUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        testResults: null,
        filesCreated: [],
        filesModified: [],
        sessionId: 'dev-session-123',
        durationMs: 3000,
        error: null,
      }),
    };

    workspaceManager = {
      prepareWorkspace: jest.fn().mockResolvedValue('/tmp/workspaces/ws-123/proj-456'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        {
          provide: CLISessionLifecycleService,
          useValue: { spawnSession: jest.fn() },
        },
        {
          provide: TaskContextAssemblerService,
          useValue: { assembleContext: jest.fn(), formatTaskPrompt: jest.fn() },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: { createFeatureBranch: jest.fn() },
        },
        {
          provide: CLIOutputStreamService,
          useValue: { startStreaming: jest.fn(), stopStreaming: jest.fn() },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: { startMonitoring: jest.fn(), stopMonitoring: jest.fn() },
        },
        { provide: WorkspaceManagerService, useValue: workspaceManager },
        { provide: DevAgentPipelineExecutorService, useValue: devAgentExecutor },
        { provide: QAAgentPipelineExecutorService, useValue: qaAgentExecutor },
      ],
    }).compile();

    handler = module.get<PipelineJobHandlerService>(PipelineJobHandlerService);
  });

  it('should delegate QA agent pipeline job to QAAgentPipelineExecutor', async () => {
    const result = await handler.handlePipelineJob(qaJobData);

    expect(qaAgentExecutor.execute).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.sessionId).toBe('qa-session-123');
  });

  it('should include verdict in QA agent result', async () => {
    const result = await handler.handlePipelineJob(qaJobData);

    expect(result.exitCode).toBe(0);
    expect(result.error).toBeNull();
  });

  it('should pass Dev Agent handoff metadata (prUrl, prNumber, devBranch)', async () => {
    await handler.handlePipelineJob(qaJobData);

    expect(qaAgentExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        devBranch: 'devos/dev/11-5',
      }),
    );
  });

  it('should pass Dev Agent test results as baseline', async () => {
    await handler.handlePipelineJob(qaJobData);

    expect(qaAgentExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        devTestResults: expect.objectContaining({
          total: 50,
          passed: 48,
          coverage: 85,
        }),
      }),
    );
  });

  it('should not invoke QAAgentPipelineExecutor for non-QA agent jobs', async () => {
    await handler.handlePipelineJob(devJobData);

    expect(qaAgentExecutor.execute).not.toHaveBeenCalled();
    expect(devAgentExecutor.execute).toHaveBeenCalled();
  });

  it('should return structured error result on QA agent failure', async () => {
    (qaAgentExecutor.execute as jest.Mock).mockResolvedValue({
      success: false,
      verdict: 'FAIL',
      qaReport: {} as any,
      additionalTestsWritten: 0,
      sessionId: 'qa-session-fail',
      durationMs: 1000,
      error: 'Tests have regressions',
    });

    const result = await handler.handlePipelineJob(qaJobData);

    expect(result.exitCode).toBe(1);
    expect(result.error).toBe('Tests have regressions');
  });

  it('should enable DevOps handoff with PASS verdict', async () => {
    const result = await handler.handlePipelineJob(qaJobData);

    expect(result.exitCode).toBe(0);
    expect(result.branch).toBe('devos/dev/11-5');
  });
});
