import { Test, TestingModule } from '@nestjs/testing';
import { AgentJobProcessor } from './agent-job.processor';
import { AgentQueueService } from '../services/agent-queue.service';
import { AgentJobType, AgentJobStatus } from '../entities/agent-job.entity';
import { AgentsService } from '../../agents/agents.service';
import { DevAgentService } from '../../agents/implementations/dev-agent.service';
import { PlannerAgentService } from '../../agents/implementations/planner-agent.service';
import { QAAgentService } from '../../agents/implementations/qa-agent.service';
import { DevOpsAgentService } from '../../agents/implementations/devops-agent.service';
import { ContextRecoveryService } from '../../agents/context-recovery.service';
import { AgentType, AgentStatus } from '../../../database/entities/agent.entity';

describe('AgentJobProcessor', () => {
  let processor: AgentJobProcessor;
  let mockService: any;
  let mockAgentsService: any;
  let mockDevAgentService: any;
  let mockPlannerAgentService: any;
  let mockQAAgentService: any;
  let mockDevOpsAgentService: any;
  let mockContextRecoveryService: any;

  const mockJobId = '33333333-3333-3333-3333-333333333333';
  const mockAgentId = '44444444-4444-4444-4444-444444444444';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';

  const mockAgent = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    name: 'Test Agent',
  };

  function createMockJob(
    jobType: string,
    data: Record<string, any> = {},
    attemptsMade = 0,
    maxAttempts = 3,
  ): any {
    return {
      data: {
        agentJobId: mockJobId,
        jobType,
        data,
      },
      attemptsMade,
      opts: {
        attempts: maxAttempts,
      },
    };
  }

  beforeEach(async () => {
    mockService = {
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
      incrementAttempts: jest.fn().mockResolvedValue(undefined),
      updateJobAttempts: jest.fn().mockResolvedValue(undefined),
    };

    mockAgentsService = {
      getAgent: jest.fn().mockResolvedValue(mockAgent),
      updateAgent: jest.fn().mockResolvedValue(mockAgent),
    };

    mockDevAgentService = {
      executeTask: jest.fn().mockResolvedValue({
        status: 'implemented',
        storyId: '5-3',
        plan: 'Plan',
        filesGenerated: [],
        codeBlocks: [],
        testsGenerated: false,
        summary: 'Done',
        tokensUsed: { input: 100, output: 200 },
      }),
    };

    mockPlannerAgentService = {
      executeTask: jest.fn().mockResolvedValue({
        status: 'plan_created',
        description: 'Create plan',
        plan: { summary: 'Plan', phases: [], milestones: [] },
        risks: [],
        estimatedEffort: 'medium',
        summary: 'Plan created',
        tokensUsed: { input: 100, output: 200 },
      }),
    };

    mockQAAgentService = {
      executeTask: jest.fn().mockResolvedValue({
        status: 'tests_completed',
        storyId: '5-5',
        testResults: [],
        passed: 5,
        failed: 0,
        skipped: 0,
        coverageEstimate: 90,
        recommendations: [],
        summary: 'All tests passed',
        tokensUsed: { input: 100, output: 200 },
      }),
    };

    mockDevOpsAgentService = {
      executeTask: jest.fn().mockResolvedValue({
        status: 'deployment_completed',
        environment: 'staging',
        deploymentId: 'deploy-001',
        steps: [],
        deploymentUrl: 'https://staging.example.com',
        smokeTestsPassed: true,
        rollbackAvailable: true,
        summary: 'Deployed successfully',
        tokensUsed: { input: 100, output: 200 },
      }),
    };

    mockContextRecoveryService = {
      recoverContext: jest.fn().mockResolvedValue(null),
      saveContext: jest.fn().mockResolvedValue(undefined),
      deleteContext: jest.fn().mockResolvedValue({ tier1Cleaned: true, tier2Deleted: 0, tier3Cleaned: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentJobProcessor,
        { provide: AgentQueueService, useValue: mockService },
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: DevAgentService, useValue: mockDevAgentService },
        { provide: PlannerAgentService, useValue: mockPlannerAgentService },
        { provide: QAAgentService, useValue: mockQAAgentService },
        { provide: DevOpsAgentService, useValue: mockDevOpsAgentService },
        { provide: ContextRecoveryService, useValue: mockContextRecoveryService },
      ],
    }).compile();

    processor = module.get<AgentJobProcessor>(AgentJobProcessor);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should route spawn-agent jobs to handleSpawnAgent', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('agent_spawned');
    });

    it('should route execute-task jobs to handleExecuteTask', async () => {
      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'dev',
        workspaceId: mockWorkspaceId,
        taskData: {
          type: 'implement-story',
          storyId: '5-3',
          description: 'Implement feature',
        },
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('implemented');
      expect(mockDevAgentService.executeTask).toHaveBeenCalledWith(
        mockAgent,
        expect.objectContaining({ type: 'implement-story' }),
      );
    });

    it('should route recover-context jobs to handleRecoverContext and recover context', async () => {
      mockContextRecoveryService.recoverContext.mockResolvedValue({ recovered: 'data' });

      const job = createMockJob(AgentJobType.RECOVER_CONTEXT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('context_recovered');
      expect(mockContextRecoveryService.recoverContext).toHaveBeenCalledWith(mockAgentId);
      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        { context: { recovered: 'data' } },
      );
    });

    it('should return failure result when no context is found during recovery', async () => {
      mockContextRecoveryService.recoverContext.mockResolvedValue(null);

      const job = createMockJob(AgentJobType.RECOVER_CONTEXT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('context_recovery_failed');
      expect(result.message).toContain('No context found');
    });

    it('should return failure result when context recovery throws', async () => {
      mockContextRecoveryService.recoverContext.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const job = createMockJob(AgentJobType.RECOVER_CONTEXT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('context_recovery_failed');
      expect(result.message).toBe('Database connection lost');
    });

    it('should route terminate-agent jobs to handleTerminateAgent', async () => {
      const job = createMockJob(AgentJobType.TERMINATE_AGENT);

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('agent_terminated');
    });

    it('should throw error for unknown job type', async () => {
      const job = createMockJob('unknown-type');

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown job type: unknown-type',
      );
    });

    it('should update status to processing at job start', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      await processor.process(job);

      expect(mockService.updateJobStatus).toHaveBeenCalledWith(
        mockJobId,
        AgentJobStatus.PROCESSING,
        { startedAt: expect.any(Date) },
      );
    });

    it('should update status to completed with result on success', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      await processor.process(job);

      expect(mockService.updateJobStatus).toHaveBeenCalledWith(
        mockJobId,
        AgentJobStatus.COMPLETED,
        {
          result: expect.objectContaining({ status: 'agent_spawned' }),
          completedAt: expect.any(Date),
        },
      );
    });

    it('should sync attempts counter on failure', async () => {
      const job = createMockJob('unknown-type');

      await expect(processor.process(job)).rejects.toThrow();

      // Should sync with BullMQ's attemptsMade (0 + 1 = 1)
      expect(mockService.updateJobAttempts).toHaveBeenCalledWith(mockJobId, 1);
    });

    it('should load agent and route to DevAgentService for dev agent type', async () => {
      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'dev',
        workspaceId: mockWorkspaceId,
        taskData: {
          type: 'fix-bug',
          description: 'Fix null pointer',
        },
      });

      await processor.process(job);

      expect(mockAgentsService.getAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
      expect(mockDevAgentService.executeTask).toHaveBeenCalled();
    });

    it('should throw error for unsupported agent type in execute-task', async () => {
      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'unknown-agent',
        workspaceId: mockWorkspaceId,
        taskData: { type: 'implement-story', description: 'Test' },
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Unsupported agent type for task execution: unknown-agent',
      );
    });

    it('should throw error for missing agentId in execute-task', async () => {
      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentType: 'dev',
        taskData: { type: 'implement-story', description: 'Test' },
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Missing agentId or workspaceId in execute-task job data',
      );
    });

    it('should route agentType planner to PlannerAgentService.executeTask', async () => {
      const plannerAgent = {
        ...mockAgent,
        type: AgentType.PLANNER,
        name: 'Test Planner Agent',
      };
      mockAgentsService.getAgent.mockResolvedValue(plannerAgent);

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'planner',
        workspaceId: mockWorkspaceId,
        taskData: {
          type: 'create-plan',
          description: 'Create implementation plan',
        },
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('plan_created');
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalledWith(
        plannerAgent,
        expect.objectContaining({ type: 'create-plan' }),
      );
    });

    it('should pass correct agent entity and task data for planner', async () => {
      const plannerAgent = {
        ...mockAgent,
        type: AgentType.PLANNER,
      };
      mockAgentsService.getAgent.mockResolvedValue(plannerAgent);

      const taskData = {
        type: 'breakdown-epic',
        epicId: 'epic-5',
        description: 'Break down epic',
      };

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'planner',
        workspaceId: mockWorkspaceId,
        taskData,
      });

      await processor.process(job);

      expect(mockAgentsService.getAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalledWith(
        plannerAgent,
        taskData,
      );
    });

    it('should route agentType qa to QAAgentService.executeTask', async () => {
      const qaAgent = {
        ...mockAgent,
        type: AgentType.QA,
        name: 'Test QA Agent',
      };
      mockAgentsService.getAgent.mockResolvedValue(qaAgent);

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'qa',
        workspaceId: mockWorkspaceId,
        taskData: {
          type: 'run-tests',
          description: 'Run test analysis',
          storyId: '5-5',
        },
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('tests_completed');
      expect(mockQAAgentService.executeTask).toHaveBeenCalledWith(
        qaAgent,
        expect.objectContaining({ type: 'run-tests' }),
      );
    });

    it('should pass correct agent entity and task data for QA', async () => {
      const qaAgent = {
        ...mockAgent,
        type: AgentType.QA,
      };
      mockAgentsService.getAgent.mockResolvedValue(qaAgent);

      const taskData = {
        type: 'code-review',
        pullRequestId: 'PR-42',
        description: 'Review QA code',
      };

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'qa',
        workspaceId: mockWorkspaceId,
        taskData,
      });

      await processor.process(job);

      expect(mockAgentsService.getAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
      expect(mockQAAgentService.executeTask).toHaveBeenCalledWith(
        qaAgent,
        taskData,
      );
    });

    it('should route agentType devops to DevOpsAgentService.executeTask', async () => {
      const devopsAgent = {
        ...mockAgent,
        type: AgentType.DEVOPS,
        name: 'Test DevOps Agent',
      };
      mockAgentsService.getAgent.mockResolvedValue(devopsAgent);

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'devops',
        workspaceId: mockWorkspaceId,
        taskData: {
          type: 'deploy',
          description: 'Deploy to staging',
          environment: 'staging',
        },
      });

      const result = await processor.process(job);

      expect(result).toBeDefined();
      expect(result.status).toBe('deployment_completed');
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledWith(
        devopsAgent,
        expect.objectContaining({ type: 'deploy' }),
      );
    });

    it('should pass correct agent entity and task data for DevOps', async () => {
      const devopsAgent = {
        ...mockAgent,
        type: AgentType.DEVOPS,
      };
      mockAgentsService.getAgent.mockResolvedValue(devopsAgent);

      const taskData = {
        type: 'monitor-health',
        deploymentUrl: 'https://staging.example.com',
        description: 'Check system health',
      };

      const job = createMockJob(AgentJobType.EXECUTE_TASK, {
        agentId: mockAgentId,
        agentType: 'devops',
        workspaceId: mockWorkspaceId,
        taskData,
      });

      await processor.process(job);

      expect(mockAgentsService.getAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledWith(
        devopsAgent,
        taskData,
      );
    });

    it('should transition agent through INITIALIZING to RUNNING on spawn', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
      });

      await processor.process(job);

      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        { status: AgentStatus.INITIALIZING },
      );
      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.objectContaining({ status: AgentStatus.RUNNING }),
      );
    });
  });

  describe('onFailed', () => {
    it('should update status to retrying when attempts < maxAttempts', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {}, 1, 3);
      const error = new Error('Processing failed');

      await processor.onFailed(job, error);

      expect(mockService.updateJobStatus).toHaveBeenCalledWith(
        mockJobId,
        AgentJobStatus.RETRYING,
        { errorMessage: 'Processing failed' },
      );
    });

    it('should update status to failed when attempts >= maxAttempts', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {}, 3, 3);
      const error = new Error('Max attempts reached');

      await processor.onFailed(job, error);

      expect(mockService.updateJobStatus).toHaveBeenCalledWith(
        mockJobId,
        AgentJobStatus.FAILED,
        {
          errorMessage: 'Max attempts reached',
          completedAt: expect.any(Date),
        },
      );
    });

    it('should store error message on failure', async () => {
      const job = createMockJob(AgentJobType.SPAWN_AGENT, {}, 3, 3);
      const error = new Error('Specific error message');

      await processor.onFailed(job, error);

      expect(mockService.updateJobStatus).toHaveBeenCalledWith(
        mockJobId,
        AgentJobStatus.FAILED,
        expect.objectContaining({
          errorMessage: 'Specific error message',
        }),
      );
    });
  });
});
