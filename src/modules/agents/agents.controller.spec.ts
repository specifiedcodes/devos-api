import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { FailureRecoveryService } from './failure-recovery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../database/entities/agent.entity';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ExecuteTaskDto, TaskType } from './dto/execute-task.dto';

describe('AgentsController', () => {
  let controller: AgentsController;
  let mockService: any;
  let mockQueueService: any;
  let mockFailureRecoveryService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockAgentId = '33333333-3333-3333-3333-333333333333';
  const mockProjectId = '44444444-4444-4444-4444-444444444444';

  const mockReq = {
    user: { sub: mockUserId, userId: mockUserId, id: mockUserId },
  };

  const createMockAgent = (overrides: Partial<Agent> = {}): Partial<Agent> => ({
    id: mockAgentId,
    name: 'Test Agent',
    type: AgentType.DEV,
    status: AgentStatus.CREATED,
    workspaceId: mockWorkspaceId,
    projectId: null,
    createdBy: mockUserId,
    config: null,
    context: null,
    currentTask: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    lastHeartbeat: null,
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    updatedAt: new Date('2026-02-01T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    mockService = {
      createAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
      updateAgent: jest.fn(),
      updateHeartbeat: jest.fn(),
      pauseAgent: jest.fn(),
      resumeAgent: jest.fn(),
      terminateAgent: jest.fn(),
    };

    mockQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-uuid-123' }),
    };

    mockFailureRecoveryService = {
      healthCheck: jest.fn().mockResolvedValue({
        healthy: 3,
        stalled: 1,
        failed: 0,
        recovering: 1,
      }),
      getRecoveryStatus: jest.fn().mockReturnValue({
        agentId: mockAgentId,
        retryCount: 1,
        maxRetries: 3,
        isRecovering: true,
      }),
      recoverAgent: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: AgentsService, useValue: mockService },
        { provide: AgentQueueService, useValue: mockQueueService },
        { provide: FailureRecoveryService, useValue: mockFailureRecoveryService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AgentsController>(AgentsController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAgent', () => {
    const createAgentDto: CreateAgentDto = {
      name: 'Dev Agent for Auth Feature',
      type: AgentType.DEV,
      projectId: mockProjectId,
      config: { key: 'value' },
    };

    it('should return response with correct shape (id, name, type, status, workspaceId, projectId, createdAt)', async () => {
      const mockAgent = createMockAgent({
        name: createAgentDto.name,
        type: createAgentDto.type,
        projectId: mockProjectId,
      });
      mockService.createAgent.mockResolvedValue(mockAgent);

      const result = await controller.createAgent(
        mockWorkspaceId,
        mockReq,
        createAgentDto,
      );

      expect(result).toEqual({
        id: mockAgentId,
        name: 'Dev Agent for Auth Feature',
        type: AgentType.DEV,
        status: AgentStatus.CREATED,
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        createdAt: mockAgent.createdAt,
      });
    });

    it('should pass workspaceId from params and user.sub as createdBy', async () => {
      const mockAgent = createMockAgent();
      mockService.createAgent.mockResolvedValue(mockAgent);

      await controller.createAgent(mockWorkspaceId, mockReq, createAgentDto);

      expect(mockService.createAgent).toHaveBeenCalledWith({
        name: 'Dev Agent for Auth Feature',
        type: AgentType.DEV,
        projectId: mockProjectId,
        config: { key: 'value' },
        workspaceId: mockWorkspaceId,
        createdBy: mockUserId,
      });
    });
  });

  describe('getAgent', () => {
    it('should return full agent object from service', async () => {
      const mockAgent = createMockAgent();
      mockService.getAgent.mockResolvedValue(mockAgent);

      const result = await controller.getAgent(mockWorkspaceId, mockAgentId);

      expect(result).toEqual(mockAgent);
      expect(mockService.getAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });

    it('should throw NotFoundException when agent not found', async () => {
      mockService.getAgent.mockRejectedValue(
        new NotFoundException('Agent not found'),
      );

      await expect(
        controller.getAgent(mockWorkspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAgents', () => {
    it('should return paginated results from service', async () => {
      const mockAgents = [createMockAgent()];
      mockService.listAgents.mockResolvedValue({
        agents: mockAgents,
        total: 1,
      });

      const query = new ListAgentsQueryDto();
      query.limit = 20;
      query.offset = 0;

      const result = await controller.listAgents(mockWorkspaceId, query);

      expect(result).toEqual({
        agents: mockAgents,
        total: 1,
      });
    });

    it('should pass query filters correctly to service', async () => {
      mockService.listAgents.mockResolvedValue({
        agents: [],
        total: 0,
      });

      const query = new ListAgentsQueryDto();
      query.projectId = mockProjectId;
      query.status = AgentStatus.RUNNING;
      query.type = AgentType.DEV;
      query.limit = 10;
      query.offset = 5;

      await controller.listAgents(mockWorkspaceId, query);

      expect(mockService.listAgents).toHaveBeenCalledWith(mockWorkspaceId, {
        projectId: mockProjectId,
        status: AgentStatus.RUNNING,
        type: AgentType.DEV,
        limit: 10,
        offset: 5,
      });
    });
  });

  describe('updateAgent', () => {
    it('should return updated agent from service', async () => {
      const mockAgent = createMockAgent({
        currentTask: 'Building auth module',
        status: AgentStatus.RUNNING,
      });
      mockService.updateAgent.mockResolvedValue(mockAgent);

      const updateDto: UpdateAgentDto = {
        currentTask: 'Building auth module',
      };

      const result = await controller.updateAgent(
        mockWorkspaceId,
        mockAgentId,
        updateDto,
      );

      expect(result).toEqual(mockAgent);
      expect(mockService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        updateDto,
      );
    });
  });

  describe('updateHeartbeat', () => {
    it('should return { success: true }', async () => {
      mockService.updateHeartbeat.mockResolvedValue(undefined);

      const result = await controller.updateHeartbeat(
        mockWorkspaceId,
        mockAgentId,
      );

      expect(result).toEqual({ success: true });
      expect(mockService.updateHeartbeat).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });
  });

  describe('pauseAgent', () => {
    it('should return paused agent from service', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.PAUSED });
      mockService.pauseAgent.mockResolvedValue(mockAgent);

      const result = await controller.pauseAgent(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
      );

      expect(result).toEqual(mockAgent);
      expect(result.status).toBe(AgentStatus.PAUSED);
      expect(mockService.pauseAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );
    });

    it('should propagate BadRequestException from service', async () => {
      mockService.pauseAgent.mockRejectedValue(
        new BadRequestException('Cannot pause agent'),
      );

      await expect(
        controller.pauseAgent(mockWorkspaceId, mockAgentId, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resumeAgent', () => {
    it('should return resumed agent from service', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockService.resumeAgent.mockResolvedValue(mockAgent);

      const result = await controller.resumeAgent(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
      );

      expect(result).toEqual(mockAgent);
      expect(result.status).toBe(AgentStatus.RUNNING);
      expect(mockService.resumeAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );
    });

    it('should propagate BadRequestException from service', async () => {
      mockService.resumeAgent.mockRejectedValue(
        new BadRequestException('Cannot resume agent'),
      );

      await expect(
        controller.resumeAgent(mockWorkspaceId, mockAgentId, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('terminateAgent', () => {
    it('should return terminated agent from service', async () => {
      const mockAgent = createMockAgent({
        status: AgentStatus.TERMINATED,
        completedAt: new Date(),
      });
      mockService.terminateAgent.mockResolvedValue(mockAgent);

      const result = await controller.terminateAgent(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
      );

      expect(result).toEqual(mockAgent);
      expect(result.status).toBe(AgentStatus.TERMINATED);
      expect(mockService.terminateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );
    });

    it('should propagate BadRequestException from service', async () => {
      mockService.terminateAgent.mockRejectedValue(
        new BadRequestException('Agent already in terminal state'),
      );

      await expect(
        controller.terminateAgent(mockWorkspaceId, mockAgentId, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeTask', () => {
    const executeTaskDto: ExecuteTaskDto = {
      type: TaskType.IMPLEMENT_STORY,
      storyId: '5-3',
      description: 'Implement the dev agent',
      files: ['src/dev-agent.service.ts'],
      requirements: ['Use Anthropic SDK'],
    };

    it('should return 202 with job details', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockService.getAgent.mockResolvedValue(mockAgent);

      const result = await controller.executeTask(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
        executeTaskDto,
      );

      expect(result).toEqual({
        jobId: 'job-uuid-123',
        agentId: mockAgentId,
        taskType: TaskType.IMPLEMENT_STORY,
        status: 'queued',
        message: 'Task queued for execution',
      });
    });

    it('should create execute-task job in queue with correct data', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockService.getAgent.mockResolvedValue(mockAgent);

      await controller.executeTask(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
        executeTaskDto,
      );

      expect(mockQueueService.addJob).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        jobType: 'execute-task',
        data: {
          agentId: mockAgentId,
          agentType: AgentType.DEV,
          workspaceId: mockWorkspaceId,
          taskData: {
            type: TaskType.IMPLEMENT_STORY,
            storyId: '5-3',
            description: 'Implement the dev agent',
            files: ['src/dev-agent.service.ts'],
            requirements: ['Use Anthropic SDK'],
          },
        },
      });
    });

    it('should return 404 for non-existent agent', async () => {
      mockService.getAgent.mockRejectedValue(
        new NotFoundException('Agent not found'),
      );

      await expect(
        controller.executeTask(
          mockWorkspaceId,
          'non-existent-id',
          mockReq,
          executeTaskDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 409 when agent is not in valid state for execution', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.COMPLETED });
      mockService.getAgent.mockResolvedValue(mockAgent);

      await expect(
        controller.executeTask(
          mockWorkspaceId,
          mockAgentId,
          mockReq,
          executeTaskDto,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should accept agent in INITIALIZING status', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.INITIALIZING });
      mockService.getAgent.mockResolvedValue(mockAgent);

      const result = await controller.executeTask(
        mockWorkspaceId,
        mockAgentId,
        mockReq,
        executeTaskDto,
      );

      expect(result.status).toBe('queued');
    });
  });

  // Story 5.10: Agent Failure Detection & Recovery - Controller endpoints
  describe('getHealth', () => {
    it('should return health check response from service', async () => {
      mockFailureRecoveryService.healthCheck.mockResolvedValue({
        healthy: 5,
        stalled: 2,
        failed: 1,
        recovering: 0,
      });

      const result = await controller.getHealth(mockWorkspaceId);

      expect(result).toEqual({
        healthy: 5,
        stalled: 2,
        failed: 1,
        recovering: 0,
      });
      expect(mockFailureRecoveryService.healthCheck).toHaveBeenCalledWith(
        mockWorkspaceId,
      );
    });
  });

  describe('getRecoveryStatus', () => {
    it('should return recovery status from service', async () => {
      mockService.getAgent.mockResolvedValue(createMockAgent());
      mockFailureRecoveryService.getRecoveryStatus.mockReturnValue({
        agentId: mockAgentId,
        retryCount: 2,
        maxRetries: 3,
        isRecovering: true,
      });

      const result = await controller.getRecoveryStatus(mockWorkspaceId, mockAgentId);

      expect(result).toEqual({
        agentId: mockAgentId,
        retryCount: 2,
        maxRetries: 3,
        isRecovering: true,
      });
      expect(mockService.getAgent).toHaveBeenCalledWith(mockAgentId, mockWorkspaceId);
      expect(
        mockFailureRecoveryService.getRecoveryStatus,
      ).toHaveBeenCalledWith(mockAgentId);
    });
  });

  describe('recoverAgent', () => {
    it('should trigger manual recovery and return result', async () => {
      mockService.getAgent.mockResolvedValue(createMockAgent());
      mockFailureRecoveryService.recoverAgent.mockResolvedValue(true);

      const result = await controller.recoverAgent(
        mockWorkspaceId,
        mockAgentId,
      );

      expect(result).toEqual({ recovered: true });
      expect(mockService.getAgent).toHaveBeenCalledWith(mockAgentId, mockWorkspaceId);
      expect(
        mockFailureRecoveryService.recoverAgent,
      ).toHaveBeenCalledWith(mockAgentId, mockWorkspaceId);
    });

    it('should return recovered: false when recovery fails', async () => {
      mockService.getAgent.mockResolvedValue(createMockAgent());
      mockFailureRecoveryService.recoverAgent.mockResolvedValue(false);

      const result = await controller.recoverAgent(
        mockWorkspaceId,
        mockAgentId,
      );

      expect(result).toEqual({ recovered: false });
    });

    it('should throw NotFoundException for non-existent agent', async () => {
      mockService.getAgent.mockRejectedValue(
        new NotFoundException('Agent not found'),
      );

      await expect(
        controller.recoverAgent(mockWorkspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
