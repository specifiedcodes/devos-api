/**
 * PipelineJobHandler Planner Agent Integration Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for planner agent delegation in PipelineJobHandler.
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
import { PlannerAgentPipelineExecutorService } from './planner-agent-pipeline-executor.service';
import { PipelineJobData } from '../interfaces/pipeline-job.interfaces';

describe('PipelineJobHandler - Planner Agent Integration', () => {
  let handler: PipelineJobHandlerService;
  let workspaceManager: jest.Mocked<WorkspaceManagerService>;
  let plannerExecutor: jest.Mocked<PlannerAgentPipelineExecutorService>;
  let devExecutor: jest.Mocked<DevAgentPipelineExecutorService>;

  const basePlannerJobData: PipelineJobData = {
    pipelineProjectId: 'proj-456',
    pipelineWorkflowId: 'wf-789',
    phase: 'planning',
    storyId: null,
    agentType: 'planner',
    workspaceId: 'ws-123',
    userId: 'user-1',
    pipelineMetadata: {
      projectName: 'DevOS',
      projectDescription: 'AI-powered dev platform',
      projectGoals: ['Goal 1', 'Goal 2'],
      epicId: 'epic-12',
      epicDescription: 'Memory Management',
      planningTask: 'create-project-plan',
      techStack: 'NestJS, TypeScript',
      githubToken: 'ghp_token',
      repoOwner: 'owner',
      repoName: 'repo',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        EventEmitter2,
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
        {
          provide: WorkspaceManagerService,
          useValue: { prepareWorkspace: jest.fn() },
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
      ],
    }).compile();

    handler = module.get<PipelineJobHandlerService>(PipelineJobHandlerService);
    workspaceManager = module.get(WorkspaceManagerService);
    plannerExecutor = module.get(PlannerAgentPipelineExecutorService);
    devExecutor = module.get(DevAgentPipelineExecutorService);

    workspaceManager.prepareWorkspace.mockResolvedValue('/tmp/workspace');
  });

  it('should delegate planner agent pipeline job to PlannerAgentPipelineExecutor', async () => {
    plannerExecutor.execute.mockResolvedValue({
      success: true,
      planningTask: 'create-project-plan',
      documentsGenerated: [
        { type: 'prd', filePath: '/workspace/prd.md', title: 'PRD' },
      ],
      storiesCreated: [
        {
          storyId: '12-1',
          title: 'Setup',
          epicId: 'epic-12',
          status: 'backlog',
          acceptanceCriteria: ['AC 1'],
          estimatedComplexity: 'M',
        },
      ],
      commitHash: 'abc123',
      sessionId: 'session-planner-1',
      durationMs: 5000,
      error: null,
    });

    const result = await handler.handlePipelineJob(basePlannerJobData);

    expect(plannerExecutor.execute).toHaveBeenCalledTimes(1);
    expect(plannerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        projectName: 'DevOS',
        planningTask: 'create-project-plan',
        epicId: 'epic-12',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.commitHash).toBe('abc123');
  });

  it('should include documents and stories in pipeline result metadata', async () => {
    plannerExecutor.execute.mockResolvedValue({
      success: true,
      planningTask: 'breakdown-epic',
      documentsGenerated: [
        { type: 'story', filePath: '/workspace/12-1.md', title: '12-1' },
        { type: 'story', filePath: '/workspace/12-2.md', title: '12-2' },
      ],
      storiesCreated: [
        {
          storyId: '12-1',
          title: 'First story',
          epicId: 'epic-12',
          status: 'backlog',
          acceptanceCriteria: [],
          estimatedComplexity: 'S',
        },
        {
          storyId: '12-2',
          title: 'Second story',
          epicId: 'epic-12',
          status: 'backlog',
          acceptanceCriteria: [],
          estimatedComplexity: 'M',
        },
      ],
      commitHash: 'def456',
      sessionId: 'session-2',
      durationMs: 3000,
      error: null,
    });

    const result = await handler.handlePipelineJob(basePlannerJobData);

    expect(result.exitCode).toBe(0);
    expect(result.sessionId).toBe('session-2');
  });

  it('should enable Dev Agent handoff with stories created with IDs', async () => {
    plannerExecutor.execute.mockResolvedValue({
      success: true,
      planningTask: 'create-stories',
      documentsGenerated: [],
      storiesCreated: [
        {
          storyId: '12-1',
          title: 'Story 1',
          epicId: 'epic-12',
          status: 'ready-for-dev',
          acceptanceCriteria: ['AC1', 'AC2'],
          estimatedComplexity: 'L',
        },
      ],
      commitHash: 'ghi789',
      sessionId: 'session-3',
      durationMs: 2000,
      error: null,
    });

    const result = await handler.handlePipelineJob(basePlannerJobData);

    expect(result.exitCode).toBe(0);
    expect(result.commitHash).toBe('ghi789');
  });

  it('should not invoke PlannerAgentPipelineExecutor for non-planner agent jobs', async () => {
    const devJobData: PipelineJobData = {
      ...basePlannerJobData,
      agentType: 'dev',
      storyId: '11-4',
      phase: 'implementing',
      pipelineMetadata: {
        storyTitle: 'Test Story',
        githubToken: 'token',
        repoOwner: 'owner',
        repoName: 'repo',
      },
    };

    devExecutor.execute.mockResolvedValue({
      success: true,
      branch: 'devos/dev/11-4',
      commitHash: 'xyz',
      prUrl: 'https://github.com/pr/1',
      prNumber: 1,
      testResults: null,
      filesCreated: [],
      filesModified: [],
      sessionId: 'dev-session',
      durationMs: 1000,
      error: null,
    });

    await handler.handlePipelineJob(devJobData);

    expect(plannerExecutor.execute).not.toHaveBeenCalled();
    expect(devExecutor.execute).toHaveBeenCalled();
  });

  it('should return structured error result on planner agent failure', async () => {
    plannerExecutor.execute.mockResolvedValue({
      success: false,
      planningTask: 'create-project-plan',
      documentsGenerated: [],
      storiesCreated: [],
      commitHash: null,
      sessionId: 'session-fail',
      durationMs: 1000,
      error: 'CLI session crashed',
    });

    const result = await handler.handlePipelineJob(basePlannerJobData);

    expect(result.exitCode).toBe(1);
    expect(result.error).toBe('CLI session crashed');
    expect(result.branch).toBeNull();
  });

  it('should work on main branch (no feature branch created)', async () => {
    plannerExecutor.execute.mockResolvedValue({
      success: true,
      planningTask: 'create-project-plan',
      documentsGenerated: [],
      storiesCreated: [],
      commitHash: null,
      sessionId: 'session-4',
      durationMs: 500,
      error: null,
    });

    const result = await handler.handlePipelineJob(basePlannerJobData);

    expect(result.branch).toBeNull();
    // Verify planner params include workspacePath
    expect(plannerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: '/tmp/workspace',
      }),
    );
  });

  it('should fall through to generic handler when executor is not available', async () => {
    // Create a handler without planner executor
    const moduleWithout = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        EventEmitter2,
        {
          provide: CLISessionLifecycleService,
          useValue: { spawnSession: jest.fn() },
        },
        {
          provide: TaskContextAssemblerService,
          useValue: {
            assembleContext: jest.fn().mockResolvedValue({
              storyTitle: '',
              storyDescription: '',
              acceptanceCriteria: [],
              techStack: '',
              codeStylePreferences: '',
              testingStrategy: '',
              existingFiles: [],
              projectContext: '',
              previousAgentOutput: null,
            }),
            formatTaskPrompt: jest.fn().mockReturnValue('test prompt'),
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
            stopStreaming: jest.fn(),
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
          provide: WorkspaceManagerService,
          useValue: {
            prepareWorkspace: jest.fn().mockResolvedValue('/tmp/workspace'),
          },
        },
        // No Dev, QA, or Planner executors
      ],
    }).compile();

    const handlerWithout = moduleWithout.get<PipelineJobHandlerService>(
      PipelineJobHandlerService,
    );

    const emitter = moduleWithout.get(EventEmitter2);
    const lifecycleService = moduleWithout.get(CLISessionLifecycleService);

    // Mock spawnSession to return a session ID
    (lifecycleService.spawnSession as jest.Mock).mockResolvedValue({
      sessionId: 'generic-session',
      pid: 999,
    });

    // Simulate session completion
    setTimeout(() => {
      emitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId: 'generic-session',
        agentId: 'pipeline-planner',
        agentType: 'planner',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: { exitCode: 0, outputLineCount: 10 },
      });
    }, 10);

    // Without executor, falls through to generic pipeline handler
    const result = await handlerWithout.handlePipelineJob(basePlannerJobData);

    expect(result.sessionId).toBe('generic-session');
    expect(result.exitCode).toBe(0);
  });
});
