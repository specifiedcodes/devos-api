import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AgentsService, CreateAgentParams } from './agents.service';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../database/entities/agent.entity';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';

describe('AgentsService', () => {
  let service: AgentsService;
  let mockRepository: any;
  let mockAgentQueueService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockAgentId = '33333333-3333-3333-3333-333333333333';
  const mockProjectId = '44444444-4444-4444-4444-444444444444';

  const createMockAgent = (overrides: Partial<Agent> = {}): Agent =>
    ({
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
    }) as Agent;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockAgentQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: getRepositoryToken(Agent),
          useValue: mockRepository,
        },
        {
          provide: AgentQueueService,
          useValue: mockAgentQueueService,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAgent', () => {
    const createDto: CreateAgentParams = {
      name: 'Dev Agent for Auth Feature',
      type: AgentType.DEV,
      workspaceId: mockWorkspaceId,
      createdBy: mockUserId,
      config: { key: 'value' },
    };

    it('should create database record with correct fields and CREATED status', async () => {
      const mockAgent = createMockAgent({
        name: createDto.name,
        type: createDto.type,
        config: createDto.config || null,
      });
      mockRepository.create.mockReturnValue(mockAgent);
      mockRepository.save.mockResolvedValue(mockAgent);

      await service.createAgent(createDto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        name: 'Dev Agent for Auth Feature',
        type: AgentType.DEV,
        workspaceId: mockWorkspaceId,
        projectId: null,
        createdBy: mockUserId,
        config: { key: 'value' },
        status: AgentStatus.CREATED,
      });
    });

    it('should queue spawn-agent job via AgentQueueService', async () => {
      const mockAgent = createMockAgent({
        name: createDto.name,
        type: createDto.type,
        config: createDto.config || null,
      });
      mockRepository.create.mockReturnValue(mockAgent);
      mockRepository.save.mockResolvedValue(mockAgent);

      await service.createAgent(createDto);

      expect(mockAgentQueueService.addJob).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        jobType: AgentJobType.SPAWN_AGENT,
        data: {
          agentId: mockAgentId,
          agentType: AgentType.DEV,
          config: createDto.config || null,
        },
      });
    });

    it('should return complete Agent object', async () => {
      const mockAgent = createMockAgent({
        name: createDto.name,
        type: createDto.type,
      });
      mockRepository.create.mockReturnValue(mockAgent);
      mockRepository.save.mockResolvedValue(mockAgent);

      const result = await service.createAgent(createDto);

      expect(result.id).toBe(mockAgentId);
      expect(result.name).toBe('Dev Agent for Auth Feature');
      expect(result.type).toBe(AgentType.DEV);
      expect(result.status).toBe(AgentStatus.CREATED);
      expect(result.workspaceId).toBe(mockWorkspaceId);
    });

    it('should set projectId to null when not provided', async () => {
      const dtoNoProject: CreateAgentParams = {
        name: 'Agent',
        type: AgentType.QA,
        workspaceId: mockWorkspaceId,
        createdBy: mockUserId,
      };
      const mockAgent = createMockAgent();
      mockRepository.create.mockReturnValue(mockAgent);
      mockRepository.save.mockResolvedValue(mockAgent);

      await service.createAgent(dtoNoProject);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: null }),
      );
    });
  });

  describe('getAgent', () => {
    it('should return agent when found with matching workspaceId', async () => {
      const mockAgent = createMockAgent();
      mockRepository.findOne.mockResolvedValue(mockAgent);

      const result = await service.getAgent(mockAgentId, mockWorkspaceId);

      expect(result).toEqual(mockAgent);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAgentId, workspaceId: mockWorkspaceId },
      });
    });

    it('should throw NotFoundException when agent not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAgent('non-existent-id', mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce workspace isolation - does not return agent from different workspace', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const differentWorkspaceId = '99999999-9999-9999-9999-999999999999';
      await expect(
        service.getAgent(mockAgentId, differentWorkspaceId),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAgentId, workspaceId: differentWorkspaceId },
      });
    });
  });

  describe('listAgents', () => {
    const mockAgents = [createMockAgent()];
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockAgents, 1]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should return paginated results with correct total count', async () => {
      const result = await service.listAgents(mockWorkspaceId);

      expect(result.agents).toEqual(mockAgents);
      expect(result.total).toBe(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'agent.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId },
      );
    });

    it('should filter by projectId when provided', async () => {
      await service.listAgents(mockWorkspaceId, {
        projectId: mockProjectId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'agent.projectId = :projectId',
        { projectId: mockProjectId },
      );
    });

    it('should filter by status when provided', async () => {
      await service.listAgents(mockWorkspaceId, {
        status: AgentStatus.RUNNING,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'agent.status = :status',
        { status: AgentStatus.RUNNING },
      );
    });

    it('should filter by type when provided', async () => {
      await service.listAgents(mockWorkspaceId, {
        type: AgentType.DEV,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'agent.type = :type',
        { type: AgentType.DEV },
      );
    });

    it('should apply limit and offset correctly', async () => {
      await service.listAgents(mockWorkspaceId, {
        limit: 10,
        offset: 20,
      });

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('updateAgent', () => {
    it('should update agent fields and save', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockResolvedValue({
        ...mockAgent,
        currentTask: 'Building auth module',
      });

      const result = await service.updateAgent(mockAgentId, mockWorkspaceId, {
        currentTask: 'Building auth module',
      });

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent agent', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateAgent('non-existent-id', mockWorkspaceId, {
          currentTask: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate state transition when status is provided', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.CREATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.updateAgent(mockAgentId, mockWorkspaceId, {
          status: AgentStatus.RUNNING,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow valid state transition when status is provided', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.CREATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.updateAgent(mockAgentId, mockWorkspaceId, {
        status: AgentStatus.INITIALIZING,
      });

      expect(result.status).toBe(AgentStatus.INITIALIZING);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateHeartbeat(mockAgentId, mockWorkspaceId);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: mockAgentId, workspaceId: mockWorkspaceId },
        { lastHeartbeat: expect.any(Date) },
      );
    });

    it('should throw NotFoundException when agent does not exist', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateHeartbeat(mockAgentId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pauseAgent', () => {
    it('should pause running agent and set status to PAUSED', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.pauseAgent(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.status).toBe(AgentStatus.PAUSED);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if agent not in RUNNING status', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.CREATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.pauseAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is paused', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.PAUSED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.pauseAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is in terminal state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.COMPLETED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.pauseAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resumeAgent', () => {
    it('should resume paused agent and set status to RUNNING', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.PAUSED });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.resumeAgent(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.status).toBe(AgentStatus.RUNNING);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if agent not in PAUSED status', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.resumeAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is in CREATED status', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.CREATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.resumeAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is in terminal state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.TERMINATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.resumeAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('terminateAgent', () => {
    it('should terminate agent and queue termination job', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.terminateAgent(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.status).toBe(AgentStatus.TERMINATED);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockAgentQueueService.addJob).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        jobType: AgentJobType.TERMINATE_AGENT,
        data: { agentId: mockAgentId },
      });
    });

    it('should allow termination from CREATED state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.CREATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.terminateAgent(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.status).toBe(AgentStatus.TERMINATED);
    });

    it('should allow termination from PAUSED state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.PAUSED });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.save.mockImplementation((agent: Agent) =>
        Promise.resolve(agent),
      );

      const result = await service.terminateAgent(
        mockAgentId,
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.status).toBe(AgentStatus.TERMINATED);
    });

    it('should throw BadRequestException if agent already in COMPLETED state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.COMPLETED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.terminateAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent already in FAILED state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.FAILED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.terminateAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent already in TERMINATED state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.TERMINATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.terminateAgent(mockAgentId, mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markFailed', () => {
    it('should set status to FAILED with error message and completedAt', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.markFailed(mockAgentId, mockWorkspaceId, 'Out of memory');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAgentId, workspaceId: mockWorkspaceId },
      });
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: mockAgentId, workspaceId: mockWorkspaceId },
        {
          status: AgentStatus.FAILED,
          errorMessage: 'Out of memory',
          completedAt: expect.any(Date),
        },
      );
    });

    it('should throw BadRequestException if agent is in terminal state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.COMPLETED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.markFailed(mockAgentId, mockWorkspaceId, 'Some error'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markCompleted', () => {
    it('should set status to COMPLETED with completedAt', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.RUNNING });
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.markCompleted(mockAgentId, mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAgentId, workspaceId: mockWorkspaceId },
      });
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: mockAgentId, workspaceId: mockWorkspaceId },
        {
          status: AgentStatus.COMPLETED,
          completedAt: expect.any(Date),
        },
      );
    });

    it('should throw BadRequestException if agent is in terminal state', async () => {
      const mockAgent = createMockAgent({ status: AgentStatus.TERMINATED });
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await expect(
        service.markCompleted(mockAgentId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
