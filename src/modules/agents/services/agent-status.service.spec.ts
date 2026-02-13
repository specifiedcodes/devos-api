import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { AgentStatusService } from './agent-status.service';
import { Agent, AgentType, AgentStatus } from '../../../database/entities/agent.entity';
import { AgentStatusUpdate } from '../../../database/entities/agent-status-update.entity';
import { ChatMessage, ChatSenderType } from '../../../database/entities/chat-message.entity';
import { RedisService } from '../../redis/redis.service';
import { AgentActivityStatus, StatusUpdateCategory } from '../enums/agent-activity-status.enum';

describe('AgentStatusService', () => {
  let service: AgentStatusService;
  let agentRepo: jest.Mocked<Repository<Agent>>;
  let statusUpdateRepo: jest.Mocked<Repository<AgentStatusUpdate>>;
  let chatMessageRepo: jest.Mocked<Repository<ChatMessage>>;
  let redisService: jest.Mocked<RedisService>;

  const mockAgent: Agent = {
    id: 'agent-1',
    name: 'Dev Agent',
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    activityStatus: AgentActivityStatus.IDLE,
    activityStatusSince: new Date(),
    activityMessage: null,
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    createdBy: 'user-1',
    config: null,
    context: null,
    currentTask: null,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
    lastHeartbeat: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    workspace: {} as any,
    project: {} as any,
    creator: {} as any,
  };

  const mockStatusUpdate: AgentStatusUpdate = {
    id: 'status-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    agentId: 'agent-1',
    agentType: AgentType.DEV,
    agentName: 'Dev Agent',
    previousStatus: AgentActivityStatus.IDLE,
    newStatus: AgentActivityStatus.CODING,
    message: 'Started coding',
    category: StatusUpdateCategory.PROGRESS,
    metadata: null,
    postedToChat: false,
    chatMessageId: null,
    createdAt: new Date(),
    workspace: {} as any,
    project: {} as any,
    agent: {} as any,
  };

  // Mock query builder for atomic updates
  const createMockAgentQueryBuilder = (affected: number, rawResult: any[] = []) => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected, raw: rawResult }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentStatusService,
        {
          provide: getRepositoryToken(Agent),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])),
          },
        },
        {
          provide: getRepositoryToken(AgentStatusUpdate),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentStatusService>(AgentStatusService);
    agentRepo = module.get(getRepositoryToken(Agent));
    statusUpdateRepo = module.get(getRepositoryToken(AgentStatusUpdate));
    chatMessageRepo = module.get(getRepositoryToken(ChatMessage));
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear any pending timeouts
    service.onModuleDestroy();
  });

  describe('updateAgentStatus', () => {
    it('should create status update record', async () => {
      // Mock query builder for atomic update
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      const result = await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.CODING,
        'Started coding',
      );

      expect(statusUpdateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          workspaceId: 'workspace-1',
          newStatus: AgentActivityStatus.CODING,
          message: 'Started coding',
        }),
      );
      expect(statusUpdateRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockStatusUpdate);
    });

    it('should update agent activityStatus atomically', async () => {
      const mockQueryBuilder = createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }]);
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQueryBuilder);
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.CODING,
        'Started coding',
      );

      // Verify atomic update via query builder
      expect(agentRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          activityStatus: AgentActivityStatus.CODING,
          activityMessage: 'Started coding',
        }),
      );
    });

    it('should throw NotFoundException if agent not found during update', async () => {
      // Mock query builder returning 0 affected rows
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(0, [])
      );

      await expect(
        service.updateAgentStatus('agent-1', 'workspace-1', AgentActivityStatus.CODING, 'Started'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if agent not found after update', async () => {
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAgentStatus('agent-1', 'workspace-1', AgentActivityStatus.CODING, 'Started'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should infer category from status', async () => {
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.FAILED, // Should infer ERROR category
        'Task failed',
      );

      expect(statusUpdateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: StatusUpdateCategory.ERROR,
        }),
      );
    });

    it('should use explicit category when provided', async () => {
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.CODING,
        'Started task',
        { category: StatusUpdateCategory.TASK_LIFECYCLE },
      );

      expect(statusUpdateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: StatusUpdateCategory.TASK_LIFECYCLE,
        }),
      );
    });

    it('should sanitize status message', async () => {
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      // Message with potential injection pattern
      await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.CODING,
        'Test {{injection}} message',
      );

      expect(statusUpdateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test { {injection} } message',
        }),
      );
    });

    it('should store metadata when provided', async () => {
      (agentRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        createMockAgentQueryBuilder(1, [{ activity_status: 'idle' }])
      );
      agentRepo.findOne.mockResolvedValue(mockAgent);
      statusUpdateRepo.create.mockReturnValue(mockStatusUpdate);
      statusUpdateRepo.save.mockResolvedValue(mockStatusUpdate);
      redisService.publish.mockResolvedValue(1);

      await service.updateAgentStatus(
        'agent-1',
        'workspace-1',
        AgentActivityStatus.CODING,
        'Working on file',
        { metadata: { file: 'src/auth.ts' } },
      );

      expect(statusUpdateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { file: 'src/auth.ts' },
        }),
      );
    });
  });

  describe('getCurrentStatus', () => {
    it('should return current agent status', async () => {
      agentRepo.findOne.mockResolvedValue(mockAgent);

      const result = await service.getCurrentStatus('agent-1', 'workspace-1');

      expect(result.currentStatus).toEqual({
        activityStatus: mockAgent.activityStatus,
        message: mockAgent.activityMessage,
        since: mockAgent.activityStatusSince,
      });
      expect(result.agent).toEqual(mockAgent);
    });

    it('should throw NotFoundException if agent not found', async () => {
      agentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getCurrentStatus('agent-1', 'workspace-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAgentStatusHistory', () => {
    it('should return paginated status history', async () => {
      agentRepo.findOne.mockResolvedValue(mockAgent);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getAgentStatusHistory('agent-1', 'workspace-1');

      expect(result.statusUpdates).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore when more records exist', async () => {
      agentRepo.findOne.mockResolvedValue(mockAgent);

      // Return more records than limit
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(Array(51).fill(mockStatusUpdate)),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getAgentStatusHistory('agent-1', 'workspace-1', { limit: 50 });

      expect(result.statusUpdates).toHaveLength(50);
      expect(result.hasMore).toBe(true);
    });

    it('should throw NotFoundException if agent not found', async () => {
      agentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getAgentStatusHistory('agent-1', 'workspace-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should apply before cursor for pagination', async () => {
      agentRepo.findOne.mockResolvedValue(mockAgent);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const beforeDate = new Date('2026-02-13T14:00:00Z');
      await service.getAgentStatusHistory('agent-1', 'workspace-1', { before: beforeDate });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'statusUpdate.createdAt < :before',
        { before: beforeDate },
      );
    });
  });

  describe('getWorkspaceStatusUpdates', () => {
    it('should return workspace status updates', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getWorkspaceStatusUpdates('workspace-1');

      expect(result.statusUpdates).toHaveLength(1);
    });

    it('should filter by projectId', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getWorkspaceStatusUpdates('workspace-1', { projectId: 'project-1' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'statusUpdate.projectId = :projectId',
        { projectId: 'project-1' },
      );
    });

    it('should filter by agentId', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getWorkspaceStatusUpdates('workspace-1', { agentId: 'agent-1' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'statusUpdate.agentId = :agentId',
        { agentId: 'agent-1' },
      );
    });

    it('should filter by category', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStatusUpdate]),
      };
      statusUpdateRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getWorkspaceStatusUpdates('workspace-1', { category: StatusUpdateCategory.ERROR });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'statusUpdate.category = :category',
        { category: StatusUpdateCategory.ERROR },
      );
    });
  });
});
