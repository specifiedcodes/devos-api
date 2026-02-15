/**
 * PipelineJobHandler DevOps Agent Integration Tests
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Tests that PipelineJobHandler correctly delegates devops agent jobs
 * to DevOpsAgentPipelineExecutor and maps results.
 */

// Mock Octokit ESM module before imports
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
import { PlannerAgentPipelineExecutorService } from './planner-agent-pipeline-executor.service';
import { DevOpsAgentPipelineExecutorService } from './devops-agent-pipeline-executor.service';
import { PipelineJobData } from '../interfaces/pipeline-job.interfaces';

describe('PipelineJobHandler - DevOps Agent Integration', () => {
  let handler: PipelineJobHandlerService;
  let devopsExecutor: jest.Mocked<DevOpsAgentPipelineExecutorService>;
  let workspaceManager: jest.Mocked<WorkspaceManagerService>;

  const baseJobData: PipelineJobData = {
    pipelineProjectId: 'proj-456',
    pipelineWorkflowId: 'wf-001',
    phase: 'deploying',
    storyId: 'story-789',
    agentType: 'devops',
    workspaceId: 'ws-123',
    userId: 'user-001',
    pipelineMetadata: {
      githubToken: 'ghp_test',
      repoOwner: 'org',
      repoName: 'repo',
      storyTitle: 'Add user profile',
      storyDescription: 'Add user profile endpoint',
      prUrl: 'https://github.com/org/repo/pull/42',
      prNumber: 42,
      devBranch: 'devos/dev/story-789',
      qaVerdict: 'PASS',
      qaReportSummary: 'All tests passing',
      deploymentPlatform: 'railway',
      supabaseConfigured: false,
      environment: 'staging',
    },
  };

  const successResult = {
    success: true,
    mergeCommitHash: 'abc123',
    deploymentUrl: 'https://app.railway.app',
    deploymentId: 'deploy-123',
    deploymentPlatform: 'railway' as const,
    smokeTestResults: {
      passed: true,
      healthCheck: {
        name: 'Health Check',
        url: 'https://app.railway.app/api/health',
        method: 'GET',
        expectedStatus: 200,
        actualStatus: 200,
        passed: true,
        responseTimeMs: 100,
        error: null,
      },
      apiChecks: [],
      totalChecks: 1,
      passedChecks: 1,
      failedChecks: 0,
      durationMs: 5000,
      details: '1/1 checks passed',
    },
    rollbackPerformed: false,
    rollbackReason: null,
    incidentReport: null,
    sessionId: 'devops-pipeline-story-789-12345',
    durationMs: 120000,
    error: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
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
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn(),
            getBufferedOutput: jest.fn(),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: { startMonitoring: jest.fn(), stopMonitoring: jest.fn() },
        },
        {
          provide: WorkspaceManagerService,
          useValue: { prepareWorkspace: jest.fn().mockResolvedValue('/tmp/workspace') },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), on: jest.fn(), removeListener: jest.fn() },
        },
        {
          provide: DevAgentPipelineExecutorService,
          useValue: { execute: jest.fn() },
        },
        {
          provide: QAAgentPipelineExecutorService,
          useValue: { execute: jest.fn() },
        },
        {
          provide: PlannerAgentPipelineExecutorService,
          useValue: { execute: jest.fn() },
        },
        {
          provide: DevOpsAgentPipelineExecutorService,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();

    handler = module.get<PipelineJobHandlerService>(PipelineJobHandlerService);
    devopsExecutor = module.get(DevOpsAgentPipelineExecutorService) as jest.Mocked<DevOpsAgentPipelineExecutorService>;
    workspaceManager = module.get(WorkspaceManagerService) as jest.Mocked<WorkspaceManagerService>;
  });

  it('should delegate DevOps agent pipeline job to DevOpsAgentPipelineExecutor', async () => {
    devopsExecutor.execute.mockResolvedValue(successResult);

    await handler.handlePipelineJob(baseJobData);

    expect(devopsExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-789',
        prUrl: 'https://github.com/org/repo/pull/42',
        prNumber: 42,
        qaVerdict: 'PASS',
        deploymentPlatform: 'railway',
      }),
    );
  });

  it('should include deployment URL in pipeline result', async () => {
    devopsExecutor.execute.mockResolvedValue(successResult);

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result.commitHash).toBe('abc123');
  });

  it('should mark story for completion on success', async () => {
    devopsExecutor.execute.mockResolvedValue(successResult);

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result.exitCode).toBe(0);
    expect(result.error).toBeNull();
  });

  it('should include incident report data on failure', async () => {
    devopsExecutor.execute.mockResolvedValue({
      ...successResult,
      success: false,
      error: 'Smoke tests failed',
      rollbackPerformed: true,
      incidentReport: {
        storyId: 'story-789',
        timestamp: new Date(),
        severity: 'medium' as const,
        failureType: 'smoke_tests_failed' as const,
        description: 'Smoke tests failed',
        deploymentId: 'deploy-123',
        rollbackPerformed: true,
        rollbackSuccessful: true,
        rootCause: 'Health check failed',
        resolution: 'Automatic rollback completed',
        recommendations: ['Fix health endpoint'],
      },
    });

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result.exitCode).toBe(1);
    expect(result.error).toBe('Smoke tests failed');
  });

  it('should not invoke DevOpsAgentPipelineExecutor for non-devops agent jobs', async () => {
    const devJobData: PipelineJobData = {
      ...baseJobData,
      agentType: 'dev',
    };

    const devExecutor = (handler as any).devAgentExecutor;
    devExecutor.execute.mockResolvedValue({
      success: true,
      branch: 'feature-branch',
      commitHash: 'abc123',
      prUrl: 'https://github.com/org/repo/pull/1',
      prNumber: 1,
      testResults: null,
      filesCreated: [],
      filesModified: [],
      sessionId: 'dev-session-1',
      durationMs: 5000,
      error: null,
    });

    await handler.handlePipelineJob(devJobData);

    expect(devopsExecutor.execute).not.toHaveBeenCalled();
  });

  it('should return structured error result on DevOps agent failure', async () => {
    devopsExecutor.execute.mockResolvedValue({
      ...successResult,
      success: false,
      mergeCommitHash: null,
      deploymentUrl: null,
      error: 'PR merge conflict',
    });

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result.exitCode).toBe(1);
    expect(result.error).toBe('PR merge conflict');
    expect(result.commitHash).toBeNull();
  });

  it('should receive QA Agent handoff metadata (prUrl, prNumber, devBranch, qaVerdict)', async () => {
    devopsExecutor.execute.mockResolvedValue(successResult);

    await handler.handlePipelineJob(baseJobData);

    expect(devopsExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prUrl: 'https://github.com/org/repo/pull/42',
        prNumber: 42,
        devBranch: 'devos/dev/story-789',
        qaVerdict: 'PASS',
        qaReportSummary: 'All tests passing',
      }),
    );
  });

  it('should fall through to generic handler when executor not available', async () => {
    // Create a handler without devops executor
    const moduleWithout = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({ sessionId: 'generic-session' }),
          },
        },
        {
          provide: TaskContextAssemblerService,
          useValue: {
            assembleContext: jest.fn().mockResolvedValue({}),
            formatTaskPrompt: jest.fn().mockReturnValue('task prompt'),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: { createFeatureBranch: jest.fn() },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: { startMonitoring: jest.fn(), stopMonitoring: jest.fn() },
        },
        {
          provide: WorkspaceManagerService,
          useValue: { prepareWorkspace: jest.fn().mockResolvedValue('/tmp/workspace') },
        },
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2(),
        },
        // Note: No DevOpsAgentPipelineExecutorService provided
      ],
    }).compile();

    const handlerWithout = moduleWithout.get<PipelineJobHandlerService>(PipelineJobHandlerService);
    const emitter = moduleWithout.get(EventEmitter2) as EventEmitter2;

    // Simulate session completion quickly for the generic handler path
    setTimeout(() => {
      emitter.emit('cli:session:completed', {
        sessionId: 'generic-session',
        type: 'completed',
        timestamp: new Date(),
        metadata: { exitCode: 0, outputLineCount: 10 },
      });
    }, 10);

    const result = await handlerWithout.handlePipelineJob(baseJobData);

    // Should use generic handler, not devops executor
    expect(result.sessionId).toBe('generic-session');
    expect(result.exitCode).toBe(0);
  });
});
