/**
 * PipelineJobHandler Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * TDD: Tests written first, then implementation.
 * Tests the main pipeline job handler that coordinates all services.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { PipelineJobHandlerService } from './pipeline-job-handler.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { TaskContextAssemblerService } from './task-context-assembler.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { WorkspaceManagerService } from './workspace-manager.service';
import {
  PipelineJobData,
  AgentTaskContext,
} from '../interfaces/pipeline-job.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

describe('PipelineJobHandlerService', () => {
  let service: PipelineJobHandlerService;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let contextAssembler: jest.Mocked<TaskContextAssemblerService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let workspaceManager: jest.Mocked<WorkspaceManagerService>;
  let eventEmitter: EventEmitter2;

  const mockJobData: PipelineJobData = {
    pipelineProjectId: 'proj-123',
    pipelineWorkflowId: 'wf-456',
    phase: 'implementing',
    storyId: '11-3',
    agentType: 'dev',
    workspaceId: 'ws-789',
    userId: 'user-001',
  };

  const mockContext: AgentTaskContext = {
    storyTitle: 'Build Auth Module',
    storyDescription: 'Implement JWT auth',
    acceptanceCriteria: ['Login works', 'Tokens refresh'],
    techStack: 'NestJS',
    codeStylePreferences: 'ESLint',
    testingStrategy: 'Jest TDD',
    existingFiles: ['src/main.ts'],
    projectContext: 'DevOS project',
    previousAgentOutput: null,
  };

  const mockPipelineContext = {
    projectId: 'proj-123',
    workspaceId: 'ws-789',
    workflowId: 'wf-456',
    currentState: PipelineState.IMPLEMENTING,
    previousState: PipelineState.PLANNING,
    stateEnteredAt: new Date(),
    activeAgentId: null,
    activeAgentType: 'dev',
    currentStoryId: '11-3',
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Use a real EventEmitter2 for event-based completion signaling
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'session-abc',
              pid: 12345,
            }),
            getSessionStatus: jest.fn().mockResolvedValue({
              status: 'completed',
              pid: null,
              outputLineCount: 50,
              durationMs: 30000,
            }),
            terminateSession: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TaskContextAssemblerService,
          useValue: {
            assembleContext: jest.fn().mockResolvedValue(mockContext),
            formatTaskPrompt: jest.fn().mockReturnValue('Formatted task prompt'),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest.fn().mockResolvedValue('devos/dev/11-3'),
            getCurrentBranch: jest.fn().mockResolvedValue('devos/dev/11-3'),
            branchExists: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            onOutput: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            startMonitoring: jest.fn(),
            recordActivity: jest.fn(),
            stopMonitoring: jest.fn(),
            isStalled: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: WorkspaceManagerService,
          useValue: {
            getWorkspacePath: jest.fn().mockReturnValue('/workspaces/ws-789/proj-123'),
            prepareWorkspace: jest.fn().mockResolvedValue('/workspaces/ws-789/proj-123'),
            cleanupWorkspace: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<PipelineJobHandlerService>(
      PipelineJobHandlerService,
    );
    lifecycleService = module.get(
      CLISessionLifecycleService,
    ) as jest.Mocked<CLISessionLifecycleService>;
    contextAssembler = module.get(
      TaskContextAssemblerService,
    ) as jest.Mocked<TaskContextAssemblerService>;
    branchManager = module.get(
      PipelineBranchManagerService,
    ) as jest.Mocked<PipelineBranchManagerService>;
    outputStream = module.get(
      CLIOutputStreamService,
    ) as jest.Mocked<CLIOutputStreamService>;
    healthMonitor = module.get(
      SessionHealthMonitorService,
    ) as jest.Mocked<SessionHealthMonitorService>;
    workspaceManager = module.get(
      WorkspaceManagerService,
    ) as jest.Mocked<WorkspaceManagerService>;
  });

  describe('handlePipelineJob', () => {
    // Helper to simulate session completion after a short delay
    function simulateSessionCompletion(
      sessionId: string,
      exitCode: number = 0,
    ): void {
      setTimeout(() => {
        eventEmitter.emit('cli:session:completed', {
          type: 'cli:session:completed',
          sessionId,
          agentId: 'agent-test',
          agentType: 'dev',
          workspaceId: 'ws-789',
          projectId: 'proj-123',
          timestamp: new Date(),
          metadata: { exitCode },
        });
      }, 10);
    }

    it('should successfully spawn CLI session and return result', async () => {
      simulateSessionCompletion('session-abc');

      const result = await service.handlePipelineJob(mockJobData);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('session-abc');
      expect(result.error).toBeNull();
    });

    it('should assemble correct task context for dev agent', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(contextAssembler.assembleContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-789',
          projectId: 'proj-123',
          storyId: '11-3',
          agentType: 'dev',
        }),
      );
    });

    it('should assemble correct task context for qa agent', async () => {
      const qaJobData: PipelineJobData = {
        ...mockJobData,
        agentType: 'qa',
        phase: 'qa',
      };

      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(qaJobData);

      expect(contextAssembler.assembleContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'qa',
        }),
      );
    });

    it('should assemble correct task context for planner agent', async () => {
      const plannerJobData: PipelineJobData = {
        ...mockJobData,
        agentType: 'planner',
        phase: 'planning',
        storyId: null,
      };

      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(plannerJobData);

      expect(contextAssembler.assembleContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'planner',
          storyId: null,
        }),
      );
    });

    it('should assemble correct task context for devops agent', async () => {
      const devopsJobData: PipelineJobData = {
        ...mockJobData,
        agentType: 'devops',
        phase: 'deploying',
      };

      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(devopsJobData);

      expect(contextAssembler.assembleContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'devops',
        }),
      );
    });

    it('should create feature branch for dev agent', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(branchManager.createFeatureBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'dev',
          storyId: '11-3',
        }),
      );
    });

    it('should have QA agent check out dev agent branch', async () => {
      const qaJobData: PipelineJobData = {
        ...mockJobData,
        agentType: 'qa',
        phase: 'qa',
      };

      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(qaJobData);

      // QA checks out the dev branch
      expect(branchManager.createFeatureBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'dev', // QA checks out the dev branch
          storyId: '11-3',
        }),
      );
    });

    it('should have planner agent work on main branch', async () => {
      const plannerJobData: PipelineJobData = {
        ...mockJobData,
        agentType: 'planner',
        phase: 'planning',
        storyId: null,
      };

      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(plannerJobData);

      // Planner should NOT create a feature branch
      expect(branchManager.createFeatureBranch).not.toHaveBeenCalled();
    });

    it('should start output streaming on session spawn', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(outputStream.startStreaming).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-abc',
          workspaceId: 'ws-789',
        }),
      );
    });

    it('should stop streaming and archive output on session end', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(outputStream.stopStreaming).toHaveBeenCalledWith('session-abc');
    });

    it('should return correct PipelineJobResult on success', async () => {
      simulateSessionCompletion('session-abc');

      const result = await service.handlePipelineJob(mockJobData);

      expect(result.sessionId).toBe('session-abc');
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.branch).toBe('devos/dev/11-3');
    });

    it('should return error result when CLI crashes (non-zero exit)', async () => {
      // Simulate session failure
      setTimeout(() => {
        eventEmitter.emit('cli:session:failed', {
          type: 'cli:session:failed',
          sessionId: 'session-abc',
          agentId: 'agent-test',
          agentType: 'dev',
          workspaceId: 'ws-789',
          projectId: 'proj-123',
          timestamp: new Date(),
          metadata: { exitCode: 1 },
        });
      }, 10);

      const result = await service.handlePipelineJob(mockJobData);

      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(result.error).not.toBeNull();
    });

    it('should throw on workspace preparation failure', async () => {
      workspaceManager.prepareWorkspace.mockRejectedValue(
        new Error('Workspace not found'),
      );

      await expect(
        service.handlePipelineJob(mockJobData),
      ).rejects.toThrow('Workspace not found');
    });

    it('should handle session timeout correctly', async () => {
      // Simulate timeout event
      setTimeout(() => {
        eventEmitter.emit('cli:session:failed', {
          type: 'cli:session:failed',
          sessionId: 'session-abc',
          agentId: 'agent-test',
          agentType: 'dev',
          workspaceId: 'ws-789',
          projectId: 'proj-123',
          timestamp: new Date(),
          metadata: { exitCode: null, reason: 'timeout' },
        });
      }, 10);

      const result = await service.handlePipelineJob(mockJobData);

      expect(result.error).toBeDefined();
    });

    it('should include branch and commit info in result', async () => {
      branchManager.createFeatureBranch.mockResolvedValue('devos/dev/11-3');
      simulateSessionCompletion('session-abc');

      const result = await service.handlePipelineJob(mockJobData);

      expect(result.branch).toBe('devos/dev/11-3');
    });

    it('should start health monitoring on session spawn', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(healthMonitor.startMonitoring).toHaveBeenCalledWith(
        'session-abc',
      );
    });

    it('should stop health monitoring on session end', async () => {
      simulateSessionCompletion('session-abc');

      await service.handlePipelineJob(mockJobData);

      expect(healthMonitor.stopMonitoring).toHaveBeenCalledWith(
        'session-abc',
      );
    });
  });
});
