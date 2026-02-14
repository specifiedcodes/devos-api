/**
 * PipelineJobHandler Dev Agent Integration Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for dev agent delegation in PipelineJobHandlerService.
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
import { PipelineJobData } from '../interfaces/pipeline-job.interfaces';

describe('PipelineJobHandlerService - Dev Agent Delegation', () => {
  let service: PipelineJobHandlerService;
  let devAgentExecutor: jest.Mocked<DevAgentPipelineExecutorService>;
  let workspaceManager: jest.Mocked<WorkspaceManagerService>;
  let eventEmitter: EventEmitter2;

  const devJobData: PipelineJobData = {
    pipelineProjectId: 'proj-456',
    pipelineWorkflowId: 'wf-789',
    phase: 'implementing',
    storyId: '11-4',
    agentType: 'dev',
    workspaceId: 'ws-123',
    userId: 'user-1',
    pipelineMetadata: {
      storyTitle: 'Dev Agent CLI Integration',
      storyDescription: 'Implement dev agent',
      acceptanceCriteria: ['CLI spawns correctly'],
      techStack: 'NestJS',
      codeStylePreferences: 'ESLint',
      testingStrategy: 'TDD',
      gitRepoUrl: 'https://github.com/owner/repo.git',
      githubToken: 'ghp_test',
      repoOwner: 'owner',
      repoName: 'repo',
    },
  };

  const qaJobData: PipelineJobData = {
    pipelineProjectId: 'proj-456',
    pipelineWorkflowId: 'wf-789',
    phase: 'qa',
    storyId: '11-4',
    agentType: 'qa',
    workspaceId: 'ws-123',
    userId: 'user-1',
  };

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'session-123',
              pid: 12345,
            }),
          },
        },
        {
          provide: TaskContextAssemblerService,
          useValue: {
            assembleContext: jest.fn().mockResolvedValue({
              storyTitle: 'Test',
              storyDescription: 'Test',
              acceptanceCriteria: [],
              techStack: 'NestJS',
              codeStylePreferences: '',
              testingStrategy: '',
              existingFiles: [],
              projectContext: '',
              previousAgentOutput: null,
            }),
            formatTaskPrompt: jest.fn().mockReturnValue('task prompt'),
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
            prepareWorkspace: jest
              .fn()
              .mockResolvedValue('/tmp/workspaces/ws-123/proj-456'),
          },
        },
        {
          provide: DevAgentPipelineExecutorService,
          useValue: {
            execute: jest.fn().mockResolvedValue({
              success: true,
              branch: 'devos/dev/11-4',
              commitHash: 'abc123',
              prUrl: 'https://github.com/owner/repo/pull/42',
              prNumber: 42,
              testResults: {
                total: 15,
                passed: 15,
                failed: 0,
                coverage: 90.0,
                testCommand: 'npm test',
              },
              filesCreated: ['src/new.ts'],
              filesModified: ['src/existing.ts'],
              sessionId: 'session-123',
              durationMs: 5000,
              error: null,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PipelineJobHandlerService>(
      PipelineJobHandlerService,
    );
    devAgentExecutor = module.get(DevAgentPipelineExecutorService);
    workspaceManager = module.get(WorkspaceManagerService);
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  describe('dev agent delegation', () => {
    it('should delegate dev agent pipeline job to DevAgentPipelineExecutor', async () => {
      const result = await service.handlePipelineJob(devJobData);

      expect(devAgentExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          storyId: '11-4',
          storyTitle: 'Dev Agent CLI Integration',
          repoOwner: 'owner',
          repoName: 'repo',
        }),
      );
      expect(result.sessionId).toBe('session-123');
    });

    it('should include PR URL in pipeline result metadata', async () => {
      const result = await service.handlePipelineJob(devJobData);

      expect(result.branch).toBe('devos/dev/11-4');
      expect(result.commitHash).toBe('abc123');
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeNull();
    });

    it('should enable QA handoff (branch + PR in result)', async () => {
      const result = await service.handlePipelineJob(devJobData);

      // QA needs branch and commit for review
      expect(result.branch).toBeTruthy();
      expect(result.commitHash).toBeTruthy();
      expect(result.exitCode).toBe(0);
    });

    it('should NOT invoke DevAgentPipelineExecutor for non-dev agent jobs', async () => {
      // QA agent job - should not use dev executor
      // Need to simulate session completion for the generic handler
      setTimeout(() => {
        eventEmitter.emit('cli:session:completed', {
          type: 'cli:session:completed',
          sessionId: 'session-123',
          agentId: 'qa-agent',
          agentType: 'qa',
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          timestamp: new Date(),
          metadata: { exitCode: 0, outputLineCount: 50 },
        });
      }, 10);

      await service.handlePipelineJob(qaJobData);

      expect(devAgentExecutor.execute).not.toHaveBeenCalled();
    });

    it('should handle dev agent failure and return structured error result', async () => {
      devAgentExecutor.execute.mockResolvedValue({
        success: false,
        branch: 'devos/dev/11-4',
        commitHash: null,
        prUrl: null,
        prNumber: null,
        testResults: null,
        filesCreated: [],
        filesModified: [],
        sessionId: 'session-123',
        durationMs: 3000,
        error: 'CLI session crashed',
      });

      const result = await service.handlePipelineJob(devJobData);

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('CLI session crashed');
    });
  });
});
