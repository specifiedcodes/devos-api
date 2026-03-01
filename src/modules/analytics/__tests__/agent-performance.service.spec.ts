import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentPerformanceService } from '../services/agent-performance.service';
import { Agent, AgentType, AgentStatus } from '../../../database/entities/agent.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { RedisService } from '../../redis/redis.service';

describe('AgentPerformanceService', () => {
  let service: AgentPerformanceService;
  let agentRepository: Repository<Agent>;
  let storyRepository: Repository<Story>;
  let redisService: RedisService;

  const mockAgentRepository = {
    find: jest.fn(),
  };

  const mockStoryRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentPerformanceService,
        {
          provide: getRepositoryToken(Agent),
          useValue: mockAgentRepository,
        },
        {
          provide: getRepositoryToken(Story),
          useValue: mockStoryRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AgentPerformanceService>(AgentPerformanceService);
    agentRepository = module.get<Repository<Agent>>(getRepositoryToken(Agent));
    storyRepository = module.get<Repository<Story>>(getRepositoryToken(Story));
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAgentPerformance', () => {
    it('should return agent performance data', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Dev Agent',
          type: AgentType.DEV,
          status: AgentStatus.RUNNING,
        },
        {
          id: 'agent-2',
          name: 'QA Agent',
          type: AgentType.QA,
          status: AgentStatus.RUNNING,
        },
      ];

      const mockStories = [
        { id: 'story-1', status: StoryStatus.DONE, assignedAgentId: 'agent-1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
        { id: 'story-2', status: StoryStatus.DONE, assignedAgentId: 'agent-1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-03') },
        { id: 'story-3', status: StoryStatus.REVIEW, assignedAgentId: 'agent-1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-04') },
        { id: 'story-4', status: StoryStatus.DONE, assignedAgentId: 'agent-2', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
      ];

      mockRedisService.get.mockResolvedValue(null);
      mockAgentRepository.find.mockResolvedValue(mockAgents);
      mockStoryRepository.find.mockResolvedValue(mockStories);
      mockStoryRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { date: '2026-01-01', count: '1' },
          { date: '2026-01-02', count: '2' },
        ]),
      });

      const result = await service.getAgentPerformance('workspace-1', 'project-1', {});

      expect(result.agents).toHaveLength(2);
      expect(result.agents[0].agentName).toBe('Dev Agent');
      expect(result.agents[0].tasksCompleted).toBe(3);
      expect(result.agents[0].successRate).toBe(75);
      expect(result.dateFrom).toBeDefined();
      expect(result.dateTo).toBeDefined();
    });

    it('should return cached data if available', async () => {
      const cachedData = {
        agents: [],
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      };

      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getAgentPerformance('workspace-1', 'project-1', {});

      expect(result).toEqual(cachedData);
      expect(mockAgentRepository.find).not.toHaveBeenCalled();
    });

    it('should filter by agent_id when provided', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockAgentRepository.find.mockResolvedValue([]);
      mockStoryRepository.find.mockResolvedValue([]);

      await service.getAgentPerformance('workspace-1', 'project-1', {
        agent_id: 'agent-1',
      });

      expect(mockAgentRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1', id: 'agent-1' },
      });
    });
  });
});
