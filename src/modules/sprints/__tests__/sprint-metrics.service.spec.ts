import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { SprintMetricsService } from '../services/sprint-metrics.service';
import { SprintMetric } from '../../../database/entities/sprint-metric.entity';
import { VelocityMetric } from '../../../database/entities/velocity-metric.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { Project } from '../../../database/entities/project.entity';
import { RedisService } from '../../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('SprintMetricsService', () => {
  let service: SprintMetricsService;
  let sprintMetricRepository: jest.Mocked<Repository<SprintMetric>>;
  let sprintRepository: jest.Mocked<Repository<Sprint>>;
  let storyRepository: jest.Mocked<Repository<Story>>;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let redisService: jest.Mocked<RedisService>;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockDataSource: { transaction: jest.Mock };

  const mockWorkspaceId = 'workspace-123';
  const mockProjectId = 'project-123';
  const mockSprintId = 'sprint-123';

  const mockSprint = {
    id: mockSprintId,
    projectId: mockProjectId,
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    startDate: '2024-01-01',
    endDate: '2024-01-14',
    project: { workspaceId: mockWorkspaceId },
  } as Sprint;

  const mockStories = [
    { id: 'story-1', storyPoints: 5, status: StoryStatus.DONE },
    { id: 'story-2', storyPoints: 3, status: StoryStatus.IN_PROGRESS },
    { id: 'story-3', storyPoints: 8, status: StoryStatus.DONE },
    { id: 'story-4', storyPoints: 2, status: StoryStatus.BACKLOG },
  ] as Story[];

  beforeEach(async () => {
    const mockRepo = () => ({
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    });

    mockEntityManager = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue(mockStories),
      create: jest.fn().mockImplementation((_, data) => data),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<EntityManager>;

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockEntityManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintMetricsService,
        { provide: getRepositoryToken(SprintMetric), useFactory: mockRepo },
        { provide: getRepositoryToken(VelocityMetric), useFactory: mockRepo },
        { provide: getRepositoryToken(Sprint), useFactory: mockRepo },
        { provide: getRepositoryToken(Story), useFactory: mockRepo },
        { provide: getRepositoryToken(Project), useFactory: mockRepo },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            scanKeys: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SprintMetricsService>(SprintMetricsService);
    sprintMetricRepository = module.get(getRepositoryToken(SprintMetric));
    sprintRepository = module.get(getRepositoryToken(Sprint));
    storyRepository = module.get(getRepositoryToken(Story));
    projectRepository = module.get(getRepositoryToken(Project));
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeSprintMetrics', () => {
    it('should throw NotFoundException if project not found', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initializeSprintMetrics(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if sprint not found', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initializeSprintMetrics(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create initial metrics for sprint', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue(null);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.initializeSprintMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should not create duplicate metrics for same day', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue({ id: 'existing' } as SprintMetric);

      await service.initializeSprintMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockEntityManager.create).not.toHaveBeenCalled();
    });
  });

  describe('snapshotDailyMetrics', () => {
    it('should skip snapshot for non-active sprint', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.PLANNED,
      } as Sprint);

      await service.snapshotDailyMetrics(mockSprintId);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should create daily snapshot for active sprint', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue(null);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.snapshotDailyMetrics(mockSprintId);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should update existing metric for today', async () => {
      const existingMetric = {
        id: 'metric-1',
        sprintId: mockSprintId,
        totalPoints: 15,
        completedPoints: 10,
      } as SprintMetric;

      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValueOnce(existingMetric);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.snapshotDailyMetrics(mockSprintId);

      expect(mockEntityManager.save).toHaveBeenCalled();
    });
  });

  describe('updateTodayMetrics', () => {
    it('should skip for non-active sprint', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.PLANNED,
      } as Sprint);

      await service.updateTodayMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should update existing metric', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue({
        id: 'metric-1',
      } as SprintMetric);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.updateTodayMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should create new metric if none exists', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValueOnce(null);
      mockEntityManager.findOne.mockResolvedValueOnce(null);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.updateTodayMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockEntityManager.create).toHaveBeenCalled();
    });
  });

  describe('trackScopeChange', () => {
    it('should increment scope changes on existing metric', async () => {
      const existingMetric = {
        id: 'metric-1',
        scopeChanges: 2,
      } as SprintMetric;

      mockEntityManager.findOne.mockResolvedValue(existingMetric);

      await service.trackScopeChange(mockWorkspaceId, mockSprintId, 5);

      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeChanges: 7,
        }),
      );
    });

    it('should create metric if none exists for scope change', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);
      mockEntityManager.findOne.mockResolvedValueOnce(mockSprint);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.trackScopeChange(mockWorkspaceId, mockSprintId, 5);

      expect(mockEntityManager.create).toHaveBeenCalled();
    });
  });

  describe('getBurndownData', () => {
    it('should throw NotFoundException if sprint not found', async () => {
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getBurndownData(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cached data if available', async () => {
      const cachedData = { sprintId: mockSprintId, dataPoints: [] };
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getBurndownData(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toEqual(cachedData);
      expect(sprintRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return burndown data for sprint', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      sprintMetricRepository.find.mockResolvedValue([
        {
          date: '2024-01-01',
          totalPoints: 18,
          completedPoints: 0,
          remainingPoints: 18,
          idealRemaining: 18,
          storiesCompleted: 0,
          storiesTotal: 4,
          scopeChanges: 0,
        },
        {
          date: '2024-01-02',
          totalPoints: 18,
          completedPoints: 5,
          remainingPoints: 13,
          idealRemaining: 16.71,
          storiesCompleted: 1,
          storiesTotal: 4,
          scopeChanges: 0,
        },
      ] as SprintMetric[]);

      const result = await service.getBurndownData(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result.sprintId).toBe(mockSprintId);
      expect(result.dataPoints).toHaveLength(2);
      expect(result.dataPoints[0].date).toBe('2024-01-01');
    });

    it('should filter by date range', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      sprintMetricRepository.find.mockResolvedValue([]);

      await service.getBurndownData(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
        '2024-01-01',
        '2024-01-07',
      );

      expect(sprintMetricRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache on metrics update', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue(null);
      mockEntityManager.find.mockResolvedValue(mockStories);
      redisService.scanKeys.mockResolvedValue(['cache-key-1', 'cache-key-2']);

      await service.updateTodayMetrics(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(redisService.del).toHaveBeenCalledWith('cache-key-1', 'cache-key-2');
    });
  });
});
