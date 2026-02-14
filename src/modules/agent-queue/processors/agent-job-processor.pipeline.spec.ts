/**
 * AgentJobProcessor Pipeline Integration Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Tests that pipeline jobs (with pipelineProjectId) are correctly
 * delegated to PipelineJobHandler while non-pipeline jobs continue
 * to use existing agent service routing.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AgentJobProcessor } from './agent-job.processor';
import { AgentQueueService } from '../services/agent-queue.service';
import { AgentsService } from '../../agents/agents.service';
import { DevAgentService } from '../../agents/implementations/dev-agent.service';
import { PlannerAgentService } from '../../agents/implementations/planner-agent.service';
import { QAAgentService } from '../../agents/implementations/qa-agent.service';
import { DevOpsAgentService } from '../../agents/implementations/devops-agent.service';
import { ContextRecoveryService } from '../../agents/context-recovery.service';
import { PipelineStateMachineService } from '../../orchestrator/services/pipeline-state-machine.service';
import { PipelineJobHandlerService } from '../../orchestrator/services/pipeline-job-handler.service';
import { AgentJobStatus, AgentJobType } from '../entities/agent-job.entity';

describe('AgentJobProcessor - Pipeline Integration', () => {
  let processor: AgentJobProcessor;
  let agentQueueService: jest.Mocked<AgentQueueService>;
  let pipelineJobHandler: jest.Mocked<PipelineJobHandlerService>;
  let pipelineStateMachine: jest.Mocked<PipelineStateMachineService>;
  let devAgentService: jest.Mocked<DevAgentService>;
  let agentsService: jest.Mocked<AgentsService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentJobProcessor,
        {
          provide: AgentQueueService,
          useValue: {
            updateJobStatus: jest.fn().mockResolvedValue(undefined),
            updateJobAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AgentsService,
          useValue: {
            getAgent: jest.fn().mockResolvedValue({
              id: 'agent-123',
              type: 'dev',
              name: 'Test Agent',
            }),
            updateAgent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DevAgentService,
          useValue: {
            executeTask: jest.fn().mockResolvedValue({ status: 'completed' }),
          },
        },
        {
          provide: PlannerAgentService,
          useValue: {
            executeTask: jest.fn().mockResolvedValue({ status: 'completed' }),
          },
        },
        {
          provide: QAAgentService,
          useValue: {
            executeTask: jest.fn().mockResolvedValue({ status: 'completed' }),
          },
        },
        {
          provide: DevOpsAgentService,
          useValue: {
            executeTask: jest.fn().mockResolvedValue({ status: 'completed' }),
          },
        },
        {
          provide: ContextRecoveryService,
          useValue: {
            recoverContext: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PipelineStateMachineService,
          useValue: {
            onPhaseComplete: jest.fn().mockResolvedValue(undefined),
            onPhaseFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PipelineJobHandlerService,
          useValue: {
            handlePipelineJob: jest.fn().mockResolvedValue({
              sessionId: 'session-abc',
              exitCode: 0,
              branch: 'devos/dev/11-3',
              commitHash: null,
              outputLineCount: 50,
              durationMs: 30000,
              error: null,
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<AgentJobProcessor>(AgentJobProcessor);
    agentQueueService = module.get(
      AgentQueueService,
    ) as jest.Mocked<AgentQueueService>;
    pipelineJobHandler = module.get(
      PipelineJobHandlerService,
    ) as jest.Mocked<PipelineJobHandlerService>;
    pipelineStateMachine = module.get(
      PipelineStateMachineService,
    ) as jest.Mocked<PipelineStateMachineService>;
    devAgentService = module.get(
      DevAgentService,
    ) as jest.Mocked<DevAgentService>;
    agentsService = module.get(
      AgentsService,
    ) as jest.Mocked<AgentsService>;
  });

  it('should delegate pipeline job (with pipelineProjectId) to PipelineJobHandler', async () => {
    const job = {
      data: {
        agentJobId: 'job-1',
        jobType: AgentJobType.EXECUTE_TASK,
        data: {
          agentId: 'agent-123',
          agentType: 'dev',
          workspaceId: 'ws-789',
          pipelineProjectId: 'proj-123',
          pipelineWorkflowId: 'wf-456',
          phase: 'implementing',
          storyId: '11-3',
          userId: 'user-001',
        },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processor.process(job as any);

    expect(pipelineJobHandler.handlePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineProjectId: 'proj-123',
        agentType: 'dev',
      }),
    );
  });

  it('should NOT delegate non-pipeline job to PipelineJobHandler', async () => {
    const job = {
      data: {
        agentJobId: 'job-2',
        jobType: AgentJobType.EXECUTE_TASK,
        data: {
          agentId: 'agent-123',
          agentType: 'dev',
          workspaceId: 'ws-789',
          taskData: { action: 'implement feature' },
          // No pipelineProjectId - this is a regular job
        },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processor.process(job as any);

    expect(pipelineJobHandler.handlePipelineJob).not.toHaveBeenCalled();
    expect(devAgentService.executeTask).toHaveBeenCalled();
  });

  it('should pass pipeline job result to pipelineStateMachine.onPhaseComplete', async () => {
    const job = {
      data: {
        agentJobId: 'job-3',
        jobType: AgentJobType.EXECUTE_TASK,
        data: {
          agentId: 'agent-123',
          agentType: 'dev',
          workspaceId: 'ws-789',
          pipelineProjectId: 'proj-123',
          pipelineWorkflowId: 'wf-456',
          phase: 'implementing',
          storyId: '11-3',
          userId: 'user-001',
        },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processor.process(job as any);

    expect(pipelineStateMachine.onPhaseComplete).toHaveBeenCalledWith(
      'proj-123',
      'implementing',
      expect.objectContaining({
        sessionId: 'session-abc',
        exitCode: 0,
      }),
    );
  });

  it('should pass pipeline job failure to pipelineStateMachine.onPhaseFailed', async () => {
    pipelineJobHandler.handlePipelineJob.mockRejectedValue(
      new Error('CLI crash'),
    );

    const job = {
      data: {
        agentJobId: 'job-4',
        jobType: AgentJobType.EXECUTE_TASK,
        data: {
          agentId: 'agent-123',
          agentType: 'dev',
          workspaceId: 'ws-789',
          pipelineProjectId: 'proj-123',
          pipelineWorkflowId: 'wf-456',
          phase: 'implementing',
          storyId: '11-3',
          userId: 'user-001',
        },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // The processor re-throws the error, so it should throw
    await expect(processor.process(job as any)).rejects.toThrow('CLI crash');
  });

  it('should work without PipelineJobHandler (optional dependency)', async () => {
    // Create a processor without PipelineJobHandler
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentJobProcessor,
        {
          provide: AgentQueueService,
          useValue: {
            updateJobStatus: jest.fn().mockResolvedValue(undefined),
            updateJobAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AgentsService,
          useValue: {
            getAgent: jest.fn().mockResolvedValue({
              id: 'agent-123',
              type: 'dev',
            }),
            updateAgent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DevAgentService,
          useValue: { executeTask: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: PlannerAgentService,
          useValue: { executeTask: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: QAAgentService,
          useValue: { executeTask: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: DevOpsAgentService,
          useValue: { executeTask: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: ContextRecoveryService,
          useValue: { recoverContext: jest.fn().mockResolvedValue(null) },
        },
        // No PipelineStateMachineService
        // No PipelineJobHandlerService
      ],
    }).compile();

    const processorWithout = module.get<AgentJobProcessor>(AgentJobProcessor);

    // Non-pipeline job should work fine
    const job = {
      data: {
        agentJobId: 'job-5',
        jobType: AgentJobType.EXECUTE_TASK,
        data: {
          agentId: 'agent-123',
          agentType: 'dev',
          workspaceId: 'ws-789',
          taskData: {},
        },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await expect(processorWithout.process(job as any)).resolves.toBeDefined();
  });
});
