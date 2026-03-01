import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SprintsController } from '../sprints.controller';
import { SprintMetricsController } from '../sprint-metrics.controller';
import { SprintsService } from '../sprints.service';
import { SprintMetricsService } from '../services/sprint-metrics.service';
import { VelocityMetricsService } from '../services/velocity-metrics.service';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { Project } from '../../../database/entities/project.entity';
import { SprintMetric } from '../../../database/entities/sprint-metric.entity';
import { VelocityMetric } from '../../../database/entities/velocity-metric.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { RedisService } from '../../redis/redis.service';

describe('Sprint Metrics Integration Tests', () => {
  let app: INestApplication;
  let sprintRepository: jest.Mocked<Repository<Sprint>>;
  let storyRepository: jest.Mocked<Repository<Story>>;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let sprintMetricRepository: jest.Mocked<Repository<SprintMetric>>;
  let velocityMetricRepository: jest.Mocked<Repository<VelocityMetric>>;

  const mockWorkspaceId = '00000000-0000-0000-0000-000000000001';
  const mockProjectId = '00000000-0000-0000-0000-000000000002';
  const mockSprintId = '00000000-0000-0000-0000-000000000003';

  const mockSprint = {
    id: mockSprintId,
    projectId: mockProjectId,
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    startDate: '2024-01-01',
    endDate: '2024-01-14',
    sprintNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { workspaceId: mockWorkspaceId },
  } as Sprint;

  const createMockRepo = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxNumber: 1 }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  });

  const createMockSprintMetricsService = () => ({
    initializeSprintMetrics: jest.fn(),
    updateTodayMetrics: jest.fn(),
    trackScopeChange: jest.fn(),
    getBurndownData: jest.fn(),
    snapshotDailyMetrics: jest.fn(),
    getSprintMetricsSummary: jest.fn(),
  });

  const createMockVelocityMetricsService = () => ({
    calculateFinalVelocity: jest.fn(),
    getVelocityData: jest.fn(),
    getSprintMetricsSummary: jest.fn(),
  });

  const createMockDataSource = () => ({
    transaction: jest.fn((cb) => cb({
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    })),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintsController, SprintMetricsController],
      providers: [
        SprintsService,
        {
          provide: SprintMetricsService,
          useFactory: createMockSprintMetricsService,
        },
        {
          provide: VelocityMetricsService,
          useFactory: createMockVelocityMetricsService,
        },
        { provide: getRepositoryToken(Sprint), useFactory: createMockRepo },
        { provide: getRepositoryToken(Story), useFactory: createMockRepo },
        { provide: getRepositoryToken(Project), useFactory: createMockRepo },
        { provide: getRepositoryToken(SprintMetric), useFactory: createMockRepo },
        { provide: getRepositoryToken(VelocityMetric), useFactory: createMockRepo },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            publish: jest.fn(),
            del: jest.fn(),
            scanKeys: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DataSource,
          useFactory: createMockDataSource,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    sprintRepository = module.get(getRepositoryToken(Sprint));
    storyRepository = module.get(getRepositoryToken(Story));
    projectRepository = module.get(getRepositoryToken(Project));
    sprintMetricRepository = module.get(getRepositoryToken(SprintMetric));
    velocityMetricRepository = module.get(getRepositoryToken(VelocityMetric));

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/sprints/:sprintId/burndown', () => {
    it('should return burndown data for sprint', async () => {
      const mockBurndownData = {
        sprintId: mockSprintId,
        sprintName: 'Sprint 1',
        startDate: '2024-01-01',
        endDate: '2024-01-14',
        dataPoints: [
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
        ],
      };

      const sprintMetricsService = app.get(SprintMetricsService) as jest.Mocked<SprintMetricsService>;
      (sprintMetricsService.getBurndownData as jest.Mock).mockResolvedValue(mockBurndownData);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${mockWorkspaceId}/projects/${mockProjectId}/sprints/${mockSprintId}/burndown`)
        .expect(200);

      expect(response.body.sprintId).toBe(mockSprintId);
      expect(response.body.dataPoints).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      const mockBurndownData = {
        sprintId: mockSprintId,
        sprintName: 'Sprint 1',
        startDate: '2024-01-01',
        endDate: '2024-01-14',
        dataPoints: [],
      };

      const sprintMetricsService = app.get(SprintMetricsService) as jest.Mocked<SprintMetricsService>;
      (sprintMetricsService.getBurndownData as jest.Mock).mockResolvedValue(mockBurndownData);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${mockWorkspaceId}/projects/${mockProjectId}/sprints/${mockSprintId}/burndown`)
        .query({ date_from: '2024-01-01', date_to: '2024-01-07' })
        .expect(200);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/sprints/:sprintId/metrics', () => {
    it('should return sprint metrics summary', async () => {
      const mockSummary = {
        sprintId: mockSprintId,
        sprintName: 'Sprint 1',
        status: 'active',
        totalPoints: 18,
        completedPoints: 16,
        remainingPoints: 2,
        completionRate: 0.89,
        averageCycleTimeHours: 48,
        predictedCompletionDate: '2024-01-14',
        healthIndicator: 'on_track',
        daysRemaining: 7,
        startDate: '2024-01-01',
        endDate: '2024-01-14',
      };

      const velocityMetricsService = app.get(VelocityMetricsService) as jest.Mocked<VelocityMetricsService>;
      (velocityMetricsService.getSprintMetricsSummary as jest.Mock).mockResolvedValue(mockSummary);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${mockWorkspaceId}/projects/${mockProjectId}/sprints/${mockSprintId}/metrics`)
        .expect(200);

      expect(response.body.sprintId).toBe(mockSprintId);
      expect(response.body).toHaveProperty('totalPoints');
      expect(response.body).toHaveProperty('completedPoints');
      expect(response.body).toHaveProperty('healthIndicator');
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/velocity', () => {
    it('should return velocity data for project', async () => {
      const mockVelocityData = {
        projectId: mockProjectId,
        sprints: [
          {
            sprintId: 'sprint-1',
            sprintName: 'Sprint 1',
            plannedPoints: 20,
            completedPoints: 18,
            completionRate: 0.9,
            startDate: '2024-01-01',
            endDate: '2024-01-14',
            averageCycleTimeHours: 48,
            carriedOverPoints: 2,
            scopeChangePoints: 0,
          },
        ],
        averageVelocity: 18,
      };

      const velocityMetricsService = app.get(VelocityMetricsService) as jest.Mocked<VelocityMetricsService>;
      (velocityMetricsService.getVelocityData as jest.Mock).mockResolvedValue(mockVelocityData);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${mockWorkspaceId}/projects/${mockProjectId}/velocity`)
        .expect(200);

      expect(response.body.projectId).toBe(mockProjectId);
      expect(response.body.sprints).toHaveLength(1);
      expect(response.body).toHaveProperty('averageVelocity');
    });

    it('should accept last_n query parameter', async () => {
      const mockVelocityData = {
        projectId: mockProjectId,
        sprints: [],
        averageVelocity: 0,
      };

      const velocityMetricsService = app.get(VelocityMetricsService) as jest.Mocked<VelocityMetricsService>;
      (velocityMetricsService.getVelocityData as jest.Mock).mockResolvedValue(mockVelocityData);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${mockWorkspaceId}/projects/${mockProjectId}/velocity`)
        .query({ last_n: 5 })
        .expect(200);
    });
  });
});
