import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectAnalyticsService } from '../services/project-analytics.service';
import { Story, StoryStatus, StoryPriority } from '../../../database/entities/story.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Agent, AgentType, AgentStatus } from '../../../database/entities/agent.entity';

describe('ProjectAnalyticsService', () => {
  let service: ProjectAnalyticsService;
  let storyRepo: any;
  let sprintRepo: any;
  let agentRepo: any;

  const projectId = '11111111-1111-1111-1111-111111111111';
  const sprintId1 = '22222222-2222-2222-2222-222222222221';
  const sprintId2 = '22222222-2222-2222-2222-222222222222';
  const agentId1 = '33333333-3333-3333-3333-333333333331';

  const mockSprints: Partial<Sprint>[] = [
    {
      id: sprintId1,
      projectId,
      sprintNumber: 1,
      name: 'Sprint 1',
      status: SprintStatus.COMPLETED,
      startDate: '2026-01-01',
      endDate: '2026-01-14',
    },
    {
      id: sprintId2,
      projectId,
      sprintNumber: 2,
      name: 'Sprint 2',
      status: SprintStatus.ACTIVE,
      startDate: '2026-01-15',
      endDate: '2026-01-28',
    },
  ];

  const mockStories: Partial<Story>[] = [
    {
      id: 'story-1',
      projectId,
      sprintId: sprintId1,
      status: StoryStatus.DONE,
      storyPoints: 5,
      priority: StoryPriority.HIGH,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-10'),
    },
    {
      id: 'story-2',
      projectId,
      sprintId: sprintId1,
      status: StoryStatus.DONE,
      storyPoints: 3,
      priority: StoryPriority.MEDIUM,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-12'),
    },
    {
      id: 'story-3',
      projectId,
      sprintId: sprintId2,
      status: StoryStatus.DONE,
      storyPoints: 8,
      priority: StoryPriority.HIGH,
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-20'),
    },
    {
      id: 'story-4',
      projectId,
      sprintId: sprintId2,
      status: StoryStatus.IN_PROGRESS,
      storyPoints: 5,
      priority: StoryPriority.LOW,
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-18'),
    },
    {
      id: 'story-5',
      projectId,
      sprintId: sprintId2,
      status: StoryStatus.BACKLOG,
      storyPoints: 3,
      priority: StoryPriority.MEDIUM,
      createdAt: new Date('2026-01-16'),
      updatedAt: new Date('2026-01-16'),
    },
  ];

  const mockAgents: Partial<Agent>[] = [
    {
      id: agentId1,
      projectId,
      type: AgentType.DEV,
      status: AgentStatus.COMPLETED,
      startedAt: new Date('2026-01-05T08:00:00Z'),
      completedAt: new Date('2026-01-05T16:00:00Z'),
    },
    {
      id: 'agent-2',
      projectId,
      type: AgentType.QA,
      status: AgentStatus.COMPLETED,
      startedAt: new Date('2026-01-06T09:00:00Z'),
      completedAt: new Date('2026-01-06T13:00:00Z'),
    },
    {
      id: 'agent-3',
      projectId,
      type: AgentType.DEV,
      status: AgentStatus.RUNNING,
      startedAt: new Date('2026-01-20T10:00:00Z'),
      completedAt: null,
    },
  ];

  beforeEach(async () => {
    const mockStoryQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getMany: jest.fn(),
    };

    const mockSprintQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    storyRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockStoryQueryBuilder),
    };

    sprintRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockSprintQueryBuilder),
    };

    agentRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAnalyticsService,
        { provide: getRepositoryToken(Story), useValue: storyRepo },
        { provide: getRepositoryToken(Sprint), useValue: sprintRepo },
        { provide: getRepositoryToken(Agent), useValue: agentRepo },
      ],
    }).compile();

    service = module.get<ProjectAnalyticsService>(ProjectAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Velocity Tests
  // ============================================================================
  describe('getVelocityData', () => {
    it('should return story points per sprint, ordered by sprint number', async () => {
      sprintRepo.find.mockResolvedValue([...mockSprints].reverse()); // DESC order
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValueOnce([
        { sprintId: sprintId1, total: '8' },
        { sprintId: sprintId2, total: '8' },
      ]);

      const result = await service.getVelocityData(projectId, 6);

      expect(result.dataPoints).toHaveLength(2);
      expect(result.dataPoints[0].sprintNumber).toBe(1);
      expect(result.dataPoints[1].sprintNumber).toBe(2);
      expect(result.totalSprints).toBe(2);
    });

    it('should mark current active sprint with isCurrentSprint flag', async () => {
      sprintRepo.find.mockResolvedValue([...mockSprints].reverse());
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValueOnce([
        { sprintId: sprintId1, total: '8' },
        { sprintId: sprintId2, total: '8' },
      ]);

      const result = await service.getVelocityData(projectId, 6);

      expect(result.dataPoints[0].isCurrentSprint).toBe(false); // Sprint 1 is completed
      expect(result.dataPoints[1].isCurrentSprint).toBe(true); // Sprint 2 is active
    });

    it('should calculate average velocity correctly', async () => {
      sprintRepo.find.mockResolvedValue([...mockSprints].reverse());
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValueOnce([
        { sprintId: sprintId1, total: '10' },
        { sprintId: sprintId2, total: '6' },
      ]);

      const result = await service.getVelocityData(projectId, 6);

      expect(result.averageVelocity).toBe(8); // (10 + 6) / 2
    });

    it('should return empty data for project with no sprints', async () => {
      sprintRepo.find.mockResolvedValue([]);

      const result = await service.getVelocityData(projectId, 6);

      expect(result.dataPoints).toEqual([]);
      expect(result.averageVelocity).toBe(0);
      expect(result.totalSprints).toBe(0);
    });

    it('should handle sprints with no completed stories (zero points)', async () => {
      sprintRepo.find.mockResolvedValue([mockSprints[0]]);
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValueOnce([]); // No rows = no completed stories

      const result = await service.getVelocityData(projectId, 6);

      expect(result.dataPoints[0].points).toBe(0);
      expect(result.averageVelocity).toBe(0);
    });

    it('should respect sprintCount limit', async () => {
      sprintRepo.find.mockResolvedValue([mockSprints[1]]);
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValueOnce([
        { sprintId: sprintId2, total: '5' },
      ]);

      await service.getVelocityData(projectId, 1);

      expect(sprintRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  // ============================================================================
  // Burndown Tests
  // ============================================================================
  describe('getBurndownData', () => {
    it('should return ideal line from totalPoints to zero', async () => {
      sprintRepo.findOne.mockResolvedValue(mockSprints[0]);
      const sprintStories = mockStories.filter(s => s.sprintId === sprintId1);
      storyRepo.find.mockResolvedValue(sprintStories);

      const result = await service.getBurndownData(projectId, sprintId1);

      // First data point ideal should equal totalPoints
      expect(result.dataPoints[0].idealPoints).toBe(result.totalPoints);
      // Last data point ideal should be 0
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.idealPoints).toBe(0);
    });

    it('should return actual remaining points per day', async () => {
      sprintRepo.findOne.mockResolvedValue(mockSprints[0]);
      const sprintStories = mockStories.filter(s => s.sprintId === sprintId1);
      storyRepo.find.mockResolvedValue(sprintStories);

      const result = await service.getBurndownData(projectId, sprintId1);

      expect(result.totalPoints).toBe(8); // 5 + 3
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });

    it('should set status to "ahead" when actual < ideal', async () => {
      // Use past sprint dates so today is after the sprint ends
      // When all stories are done, remaining=0, ideal at endDate=0, so it equals on-track
      // For a truly "ahead" result, we need remaining < ideal - tolerance
      // Use a sprint that ended yesterday so currentDayNumber = totalDays
      // At totalDays, ideal = 0, remaining = 0 -> on-track
      // Instead: half the sprint done, all stories complete -> remaining=0, ideal > 0 -> ahead
      const today = new Date();
      const midSprint = new Date(today);
      midSprint.setDate(midSprint.getDate() - 7); // started 7 days ago
      const endSprint = new Date(today);
      endSprint.setDate(endSprint.getDate() + 7); // ends in 7 days

      sprintRepo.findOne.mockResolvedValue({
        ...mockSprints[0],
        startDate: midSprint.toISOString().split('T')[0],
        endDate: endSprint.toISOString().split('T')[0],
      });
      // 20 total points, all done very early - remaining = 0, ideal at day 7 of 14 = 10
      const stories = [
        {
          ...mockStories[0],
          sprintId: sprintId1,
          storyPoints: 12,
          status: StoryStatus.DONE,
          updatedAt: new Date(midSprint.getTime() + 1000 * 60 * 60 * 24), // done day 1
        },
        {
          ...mockStories[1],
          sprintId: sprintId1,
          storyPoints: 8,
          status: StoryStatus.DONE,
          updatedAt: new Date(midSprint.getTime() + 1000 * 60 * 60 * 24 * 2), // done day 2
        },
      ];
      storyRepo.find.mockResolvedValue(stories);

      const result = await service.getBurndownData(projectId, sprintId1);

      // remaining=0, ideal at midpoint ~10, tolerance ~2, 0 < 10-2 => ahead
      expect(result.status).toBe('ahead');
    });

    it('should throw NotFoundException for invalid sprintId', async () => {
      sprintRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getBurndownData(projectId, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle sprint with no stories (zero total points)', async () => {
      sprintRepo.findOne.mockResolvedValue(mockSprints[0]);
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getBurndownData(projectId, sprintId1);

      expect(result.totalPoints).toBe(0);
      expect(result.remainingPoints).toBe(0);
      expect(result.completedPoints).toBe(0);
    });

    it('should throw BadRequestException for sprint without dates', async () => {
      sprintRepo.findOne.mockResolvedValue({
        ...mockSprints[0],
        startDate: null,
        endDate: null,
      });

      await expect(
        service.getBurndownData(projectId, sprintId1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate totalDays and remainingDays correctly', async () => {
      sprintRepo.findOne.mockResolvedValue(mockSprints[0]);
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getBurndownData(projectId, sprintId1);

      expect(result.totalDays).toBe(13); // Jan 1 to Jan 14 = 13 days
    });
  });

  // ============================================================================
  // Throughput Tests
  // ============================================================================
  describe('getThroughputData', () => {
    it('should group completed stories by week', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getMany.mockResolvedValue(completedStories);

      const result = await service.getThroughputData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.dataPoints.length).toBeGreaterThan(0);
      for (const dp of result.dataPoints) {
        expect(typeof dp.weekStartDate).toBe('string');
        expect(typeof dp.storiesCompleted).toBe('number');
      }
    });

    it('should calculate trend as increasing/decreasing/stable', async () => {
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getMany.mockResolvedValue([
        { ...mockStories[0], updatedAt: new Date('2026-01-05') },
        { ...mockStories[1], updatedAt: new Date('2026-01-06') },
        { ...mockStories[2], updatedAt: new Date('2026-01-19') },
      ]);

      const result = await service.getThroughputData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend);
    });

    it('should calculate trend percentage correctly', async () => {
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getThroughputData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(typeof result.trendPercentage).toBe('number');
      expect(isNaN(result.trendPercentage)).toBe(false);
    });

    it('should handle date range with no completed stories', async () => {
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getThroughputData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.averageThroughput).toBe(0);
      expect(result.trend).toBe('stable');
      expect(result.trendPercentage).toBe(0);
    });

    it('should return valid average throughput', async () => {
      const queryBuilder = storyRepo.createQueryBuilder();
      queryBuilder.getMany.mockResolvedValue(
        mockStories.filter(s => s.status === StoryStatus.DONE),
      );

      const result = await service.getThroughputData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.averageThroughput).toBeGreaterThanOrEqual(0);
      expect(isNaN(result.averageThroughput)).toBe(false);
    });
  });

  // ============================================================================
  // Cycle Time Tests
  // ============================================================================
  describe('getCycleTimeData', () => {
    it('should calculate average cycle time for completed stories', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);

      const result = await service.getCycleTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.overallAverageDays).toBeGreaterThan(0);
      expect(result.overallAverageHours).toBeGreaterThan(0);
      expect(result.totalStories).toBe(3);
    });

    it('should break down by priority', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);

      const result = await service.getCycleTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.byPriority.length).toBeGreaterThan(0);
      for (const bp of result.byPriority) {
        expect(typeof bp.priority).toBe('string');
        expect(typeof bp.averageDays).toBe('number');
        expect(typeof bp.averageHours).toBe('number');
        expect(typeof bp.count).toBe('number');
      }
    });

    it('should calculate distribution ranges correctly', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);

      const result = await service.getCycleTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.distribution).toHaveLength(5);
      expect(result.distribution.map(d => d.range)).toEqual([
        '0-1 days',
        '1-2 days',
        '2-5 days',
        '5-10 days',
        '10+ days',
      ]);

      // Sum of distribution counts should equal total stories
      const totalInDistribution = result.distribution.reduce((sum, d) => sum + d.count, 0);
      expect(totalInDistribution).toBe(result.totalStories);
    });

    it('should return zero for no completed stories', async () => {
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getCycleTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.overallAverageDays).toBe(0);
      expect(result.overallAverageHours).toBe(0);
      expect(result.totalStories).toBe(0);
    });

    it('should handle NaN when dividing by zero', async () => {
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getCycleTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(isNaN(result.overallAverageDays)).toBe(false);
      expect(isNaN(result.overallAverageHours)).toBe(false);
    });
  });

  // ============================================================================
  // Lead Time Tests
  // ============================================================================
  describe('getLeadTimeData', () => {
    it('should calculate lead time from creation to completion', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);
      sprintRepo.createQueryBuilder().getMany.mockResolvedValue(mockSprints);

      const result = await service.getLeadTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.overallAverageDays).toBeGreaterThan(0);
      expect(result.overallAverageHours).toBeGreaterThan(0);
    });

    it('should provide cycle time comparison', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);
      sprintRepo.createQueryBuilder().getMany.mockResolvedValue(mockSprints);

      const result = await service.getLeadTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.cycleTimeComparison.leadTime).toBeGreaterThan(0);
      expect(result.cycleTimeComparison.cycleTime).toBeGreaterThan(0);
      expect(result.cycleTimeComparison.waitTime).toBeGreaterThanOrEqual(0);
    });

    it('should show trend by sprint', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);
      sprintRepo.createQueryBuilder().getMany.mockResolvedValue(mockSprints);

      const result = await service.getLeadTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(Array.isArray(result.trend)).toBe(true);
      for (const t of result.trend) {
        expect(typeof t.sprintNumber).toBe('number');
        expect(typeof t.sprintName).toBe('string');
        expect(typeof t.averageDays).toBe('number');
      }
    });

    it('should calculate wait time as leadTime - cycleTime', async () => {
      const completedStories = mockStories.filter(s => s.status === StoryStatus.DONE);
      storyRepo.find.mockResolvedValue(completedStories);
      sprintRepo.createQueryBuilder().getMany.mockResolvedValue(mockSprints);

      const result = await service.getLeadTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      const { leadTime, cycleTime, waitTime } = result.cycleTimeComparison;
      expect(waitTime).toBeCloseTo(leadTime - cycleTime, 1);
    });

    it('should return empty data when no completed stories', async () => {
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getLeadTimeData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.overallAverageDays).toBe(0);
      expect(result.trend).toEqual([]);
    });
  });

  // ============================================================================
  // Agent Utilization Tests
  // ============================================================================
  describe('getAgentUtilizationData', () => {
    it('should calculate utilization percentage per agent type', async () => {
      agentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getAgentUtilizationData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.utilizationPercentage).toBeGreaterThanOrEqual(0);
        expect(entry.utilizationPercentage).toBeLessThanOrEqual(100);
        expect(typeof entry.agentType).toBe('string');
      }
    });

    it('should handle projects with no agent tasks', async () => {
      agentRepo.find.mockResolvedValue([]);

      const result = await service.getAgentUtilizationData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.entries).toEqual([]);
      expect(result.totalActiveHours).toBe(0);
      expect(result.averageUtilization).toBe(0);
    });

    it('should return total active hours', async () => {
      agentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getAgentUtilizationData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.totalActiveHours).toBeGreaterThan(0);
      expect(isNaN(result.totalActiveHours)).toBe(false);
    });
  });

  // ============================================================================
  // Cumulative Flow Tests
  // ============================================================================
  describe('getCumulativeFlowData', () => {
    it('should return daily status counts', async () => {
      storyRepo.find.mockResolvedValue(mockStories);

      const result = await service.getCumulativeFlowData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-03'),
      );

      expect(result.dataPoints.length).toBe(3);
      for (const dp of result.dataPoints) {
        expect(typeof dp.date).toBe('string');
        expect(typeof dp.backlog).toBe('number');
        expect(typeof dp.in_progress).toBe('number');
        expect(typeof dp.review).toBe('number');
        expect(typeof dp.done).toBe('number');
      }
    });

    it('should include all status columns even if zero', async () => {
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getCumulativeFlowData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-01'),
      );

      expect(result.dataPoints.length).toBe(1);
      const dp = result.dataPoints[0];
      expect(dp.backlog).toBe(0);
      expect(dp.in_progress).toBe(0);
      expect(dp.review).toBe(0);
      expect(dp.done).toBe(0);
    });

    it('should handle empty project', async () => {
      storyRepo.find.mockResolvedValue([]);

      const result = await service.getCumulativeFlowData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-07'),
      );

      expect(result.dataPoints.length).toBe(7);
      expect(result.dateRange.startDate).toBe('2026-01-01');
      expect(result.dateRange.endDate).toBe('2026-01-07');
    });
  });

  // ============================================================================
  // Agent Heatmap Tests
  // ============================================================================
  describe('getAgentHeatmapData', () => {
    it('should return hours by day-of-week and agent type', async () => {
      agentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getAgentHeatmapData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.cells.length).toBeGreaterThan(0);
      for (const cell of result.cells) {
        expect(typeof cell.agentType).toBe('string');
        expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(cell.dayOfWeek);
        expect(typeof cell.hours).toBe('number');
        expect(cell.hours).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate maxHours correctly', async () => {
      agentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getAgentHeatmapData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      const maxFromCells = Math.max(...result.cells.map(c => c.hours));
      expect(result.maxHours).toBe(Math.round(maxFromCells * 100) / 100);
    });

    it('should return agent summary totals', async () => {
      agentRepo.find.mockResolvedValue(mockAgents);

      const result = await service.getAgentHeatmapData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(typeof result.agentSummary).toBe('object');
      // Should have entries for all agent types
      for (const agentType of Object.values(AgentType)) {
        expect(agentType in result.agentSummary).toBe(true);
        expect(typeof result.agentSummary[agentType]).toBe('number');
      }
    });

    it('should return zero hours for agents with no tasks', async () => {
      agentRepo.find.mockResolvedValue([]);

      const result = await service.getAgentHeatmapData(
        projectId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.maxHours).toBe(0);
      for (const cell of result.cells) {
        expect(cell.hours).toBe(0);
      }
    });
  });
});
