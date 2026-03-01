import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../database/entities/agent.entity';
import { Project } from '../../database/entities/project.entity';
import { Story } from '../../database/entities/story.entity';
import { IntegrationConnection } from '../../database/entities/integration-connection.entity';

describe('DashboardService', () => {
  let service: DashboardService;
  let agentRepository: Repository<Agent>;
  let projectRepository: Repository<Project>;
  let storyRepository: Repository<Story>;
  let integrationRepository: Repository<IntegrationConnection>;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';

  const mockAgentRepo = {
    find: jest.fn(),
  };

  const mockProjectRepo = {
    findOne: jest.fn(),
  };

  const mockStoryRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockIntegrationRepo = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Agent),
          useValue: mockAgentRepo,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepo,
        },
        {
          provide: getRepositoryToken(Story),
          useValue: mockStoryRepo,
        },
        {
          provide: getRepositoryToken(IntegrationConnection),
          useValue: mockIntegrationRepo,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    agentRepository = module.get<Repository<Agent>>(getRepositoryToken(Agent));
    projectRepository = module.get<Repository<Project>>(getRepositoryToken(Project));
    storyRepository = module.get<Repository<Story>>(getRepositoryToken(Story));
    integrationRepository = module.get<Repository<IntegrationConnection>>(
      getRepositoryToken(IntegrationConnection)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardStats', () => {
    it('should return dashboard stats with active project', async () => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        workspaceId: mockWorkspaceId,
        status: 'active',
      };

      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Dev Agent',
          type: 'dev',
          status: 'running',
          currentTaskId: 'task-1',
        },
      ];

      const mockStoriesCount = 10;
      const mockCompletedStoriesCount = 5;
      const mockDeploymentsCount = 2;
      const mockCosts = 15.5;

      mockProjectRepo.findOne.mockResolvedValue(mockProject);
      mockAgentRepo.find.mockResolvedValue(mockAgents);
      mockStoryRepo.count.mockResolvedValue(mockStoriesCount);
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(mockCompletedStoriesCount),
      };
      mockStoryRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockIntegrationRepo.count.mockResolvedValue(mockDeploymentsCount);

      const result = await service.getDashboardStats(mockWorkspaceId);

      expect(result.activeProject).toBeDefined();
      expect(result.activeProject?.name).toBe('Test Project');
      expect(result.agentStats).toHaveLength(1);
      expect(result.quickStats.deployments).toBe(mockDeploymentsCount);
    });

    it('should return null for active project when none exists', async () => {
      mockProjectRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.find.mockResolvedValue([]);
      mockStoryRepo.count.mockResolvedValue(0);
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockStoryRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockIntegrationRepo.count.mockResolvedValue(0);

      const result = await service.getDashboardStats(mockWorkspaceId);

      expect(result.activeProject).toBeNull();
      expect(result.agentStats).toHaveLength(0);
    });
  });

  describe('getActivityFeed', () => {
    it('should return activity feed items', async () => {
      const mockLimit = 20;
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Dev Agent',
          type: 'dev',
          status: 'running',
          updatedAt: new Date(),
        },
      ];

      mockAgentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getActivityFeed(mockWorkspaceId, mockLimit);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(mockLimit);
    });

    it('should respect limit parameter', async () => {
      const customLimit = 10;
      mockAgentRepo.find.mockResolvedValue([]);

      await service.getActivityFeed(mockWorkspaceId, customLimit);

      expect(mockAgentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: mockWorkspaceId },
          take: customLimit,
        })
      );
    });
  });
});
