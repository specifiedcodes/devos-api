import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { VelocityMetricsService } from '../services/velocity-metrics.service';
import { VelocityMetric } from '../../../database/entities/velocity-metric.entity';
import { SprintMetric } from '../../../database/entities/sprint-metric.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { Project } from '../../../database/entities/project.entity';
import { RedisService } from '../../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('VelocityMetricsService', () => {
  let service: VelocityMetricsService;
  let velocityMetricRepository: jest.Mocked<Repository<VelocityMetric>>;
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
    status: SprintStatus.COMPLETED,
    startDate: '2024-01-01',
    endDate: '2024-01-14',
  } as Sprint;

  const mockStories = [
    { id: 'story-1', storyPoints: 5, status: StoryStatus.DONE, createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-05') },
    { id: 'story-2', storyPoints: 3, status: StoryStatus.DONE, createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-04') },
    { id: 'story-3', storyPoints: 8, status: StoryStatus.DONE, createdAt: new Date('2024-01-03'), updatedAt: new Date('2024-01-10') },
    { id: 'story-4', storyPoints: 2, status: StoryStatus.IN_PROGRESS, createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-14') },
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
        VelocityMetricsService,
        { provide: getRepositoryToken(VelocityMetric), useFactory: mockRepo },
        { provide: getRepositoryToken(SprintMetric), useFactory: mockRepo },
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

    service = module.get<VelocityMetricsService>(VelocityMetricsService);
    velocityMetricRepository = module.get(getRepositoryToken(VelocityMetric));
    sprintMetricRepository = module.get(getRepositoryToken(SprintMetric));
    sprintRepository = module.get(getRepositoryToken(Sprint));
    storyRepository = module.get(getRepositoryToken(Story));
    projectRepository = module.get(getRepositoryToken(Project));
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFinalVelocity', () => {
    it('should throw NotFoundException if project not found', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.calculateFinalVelocity(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if sprint not found', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.calculateFinalVelocity(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create velocity metric for completed sprint', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValue(null);
      mockEntityManager.find.mockResolvedValue(mockStories);

      await service.calculateFinalVelocity(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.create).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should not create duplicate velocity metrics', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId, workspaceId: mockWorkspaceId } as Project);
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'existing' } as VelocityMetric);

      await service.calculateFinalVelocity(mockWorkspaceId, mockProjectId, mockSprintId);

      expect(mockEntityManager.create).not.toHaveBeenCalled();
    });
  });

  describe('getVelocityData', () => {
    it('should throw NotFoundException if project not found', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getVelocityData(mockWorkspaceId, mockProjectId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cached data if available', async () => {
      const cachedData = { projectId: mockProjectId, sprints: [], averageVelocity: 0 };
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getVelocityData(mockWorkspaceId, mockProjectId);

      expect(result).toEqual(cachedData);
      expect(projectRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return velocity data with average velocity', async () => {
      projectRepository.findOne.mockResolvedValue({ id: mockProjectId } as Project);
      velocityMetricRepository.find.mockResolvedValue([
        { sprintId: 's1', completedPoints: 20, plannedPoints: 25, startDate: '2024-01-01', endDate: '2024-01-14' },
        { sprintId: 's2', completedPoints: 22, plannedPoints: 25, startDate: '2024-01-15', endDate: '2024-01-28' },
        { sprintId: 's3', completedPoints: 18, plannedPoints: 25, startDate: '2024-01-29', endDate: '2024-02-11' },
      ] as VelocityMetric[]);
      velocityMetricRepository.find.mockResolvedValue([
        { completedPoints: 18 } as VelocityMetric,
        { completedPoints: 20 } as VelocityMetric,
        { completedPoints: 22 } as VelocityMetric,
      ]);

      const result = await service.getVelocityData(mockWorkspaceId, mockProjectId);

      expect(result.projectId).toBe(mockProjectId);
      expect(result.sprints).toHaveLength(3);
    });
  });

  describe('calculateAverageVelocity', () => {
    it('should return 0 for no sprints', async () => {
      velocityMetricRepository.find.mockResolvedValue([]);

      const result = await service.calculateAverageVelocity(mockProjectId, 3);

      expect(result).toBe(0);
    });

    it('should calculate average from recent sprints', async () => {
      velocityMetricRepository.find.mockResolvedValue([
        { completedPoints: 20 } as VelocityMetric,
        { completedPoints: 25 } as VelocityMetric,
        { completedPoints: 15 } as VelocityMetric,
      ]);

      const result = await service.calculateAverageVelocity(mockProjectId, 3);

      expect(result).toBe(20);
    });
  });

  describe('predictCompletionDate', () => {
    it('should return null for non-active sprint', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.COMPLETED,
      } as Sprint);

      const result = await service.predictCompletionDate(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBeNull();
    });

    it('should return null if no remaining points', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as Sprint);
      storyRepository.find.mockResolvedValue([
        { storyPoints: 5, status: StoryStatus.DONE },
      ] as Story[]);

      const result = await service.predictCompletionDate(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBeNull();
    });

    it('should predict completion date based on velocity', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as Sprint);
      storyRepository.find.mockResolvedValue([
        { storyPoints: 5, status: StoryStatus.DONE },
        { storyPoints: 3, status: StoryStatus.IN_PROGRESS },
      ] as Story[]);
      velocityMetricRepository.find.mockResolvedValue([
        { completedPoints: 21 } as VelocityMetric,
        { completedPoints: 21 } as VelocityMetric,
        { completedPoints: 21 } as VelocityMetric,
      ]);
      sprintMetricRepository.find.mockResolvedValue([]);

      const result = await service.predictCompletionDate(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).not.toBeNull();
    });
  });

  describe('calculateSprintHealth', () => {
    it('should return on_track for non-active sprint', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.COMPLETED,
      } as Sprint);

      const result = await service.calculateSprintHealth(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBe('on_track');
    });

    it('should return on_track when remaining <= ideal + buffer', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as Sprint);
      sprintMetricRepository.findOne.mockResolvedValue({
        remainingPoints: 10,
        idealRemaining: 12,
        totalPoints: 30,
      } as SprintMetric);

      const result = await service.calculateSprintHealth(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBe('on_track');
    });

    it('should return at_risk when remaining slightly above ideal', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as Sprint);
      sprintMetricRepository.findOne.mockResolvedValue({
        remainingPoints: 24,
        idealRemaining: 20,
        totalPoints: 30,
      } as SprintMetric);

      const result = await service.calculateSprintHealth(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBe('at_risk');
    });

    it('should return behind when remaining significantly above ideal', async () => {
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as Sprint);
      sprintMetricRepository.findOne.mockResolvedValue({
        remainingPoints: 25,
        idealRemaining: 10,
        totalPoints: 30,
      } as SprintMetric);

      const result = await service.calculateSprintHealth(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result).toBe('behind');
    });
  });

  describe('getCycleTimeDistribution', () => {
    it('should throw NotFoundException if sprint not found', async () => {
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getCycleTimeDistribution(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cycle time distribution', async () => {
      sprintRepository.findOne.mockResolvedValue(mockSprint);
      storyRepository.find.mockResolvedValue([
        { status: StoryStatus.DONE, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01T12:00:00') },
        { status: StoryStatus.DONE, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-03') },
        { status: StoryStatus.DONE, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-06') },
        { status: StoryStatus.DONE, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-10') },
        { status: StoryStatus.IN_PROGRESS, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-14') },
      ] as Story[]);

      const result = await service.getCycleTimeDistribution(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result.lessThanOneDay).toBe(1);
      expect(result.oneToThreeDays).toBe(1);
      expect(result.threeToSevenDays).toBe(1);
      expect(result.moreThanSevenDays).toBe(1);
      expect(result.averageCycleTimeHours).toBeGreaterThan(0);
    });
  });

  describe('getSprintMetricsSummary', () => {
    it('should throw NotFoundException if sprint not found', async () => {
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSprintMetricsSummary(mockWorkspaceId, mockProjectId, mockSprintId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return sprint metrics summary', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
        startDate: new Date().toISOString().split('T')[0],
        endDate: futureDate.toISOString().split('T')[0],
      } as Sprint);
      storyRepository.find.mockResolvedValue(mockStories);
      velocityMetricRepository.find.mockResolvedValue([]);
      sprintMetricRepository.findOne.mockResolvedValue({
        remainingPoints: 2,
        idealRemaining: 10,
        totalPoints: 18,
      } as SprintMetric);

      const result = await service.getSprintMetricsSummary(
        mockWorkspaceId,
        mockProjectId,
        mockSprintId,
      );

      expect(result.sprintId).toBe(mockSprintId);
      expect(result.totalPoints).toBe(18);
      expect(result.completedPoints).toBe(16);
      expect(result.completionRate).toBeCloseTo(0.89, 1);
    });
  });
});
