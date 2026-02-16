import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectAnalyticsController } from '../controllers/project-analytics.controller';
import { ProjectAnalyticsService } from '../services/project-analytics.service';

// Mock guards to avoid dependency resolution in unit tests
jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

jest.mock('../../../common/guards/role.guard', () => ({
  RoleGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
  RequireRole: (..._roles: string[]) => jest.fn(),
}));
import type {
  VelocityData,
  BurndownData,
  ThroughputData,
  CycleTimeData,
  LeadTimeData,
  AgentUtilizationData,
  CumulativeFlowData,
  HeatmapData,
} from '../services/project-analytics.service';

describe('ProjectAnalyticsController', () => {
  let controller: ProjectAnalyticsController;
  let service: jest.Mocked<ProjectAnalyticsService>;

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';
  const sprintId = '33333333-3333-3333-3333-333333333333';

  const mockVelocityData: VelocityData = {
    dataPoints: [
      { sprintNumber: 1, sprintName: 'Sprint 1', points: 10, isCurrentSprint: false },
      { sprintNumber: 2, sprintName: 'Sprint 2', points: 15, isCurrentSprint: true },
    ],
    averageVelocity: 12.5,
    totalSprints: 2,
  };

  const mockBurndownData: BurndownData = {
    dataPoints: [
      { date: '2026-01-01', remainingPoints: 20, idealPoints: 20, dayNumber: 0 },
      { date: '2026-01-14', remainingPoints: 0, idealPoints: 0, dayNumber: 13 },
    ],
    sprintId,
    sprintName: 'Sprint 1',
    totalPoints: 20,
    remainingPoints: 0,
    completedPoints: 20,
    remainingDays: 0,
    totalDays: 13,
    status: 'ahead',
  };

  const mockThroughputData: ThroughputData = {
    dataPoints: [{ weekStartDate: '2026-01-06', storiesCompleted: 3 }],
    averageThroughput: 3,
    trend: 'stable',
    trendPercentage: 0,
  };

  const mockCycleTimeData: CycleTimeData = {
    overallAverageDays: 5.5,
    overallAverageHours: 132,
    byPriority: [{ priority: 'high', averageDays: 3, averageHours: 72, count: 2 }],
    distribution: [
      { range: '0-1 days', count: 0 },
      { range: '1-2 days', count: 0 },
      { range: '2-5 days', count: 1 },
      { range: '5-10 days', count: 1 },
      { range: '10+ days', count: 0 },
    ],
    totalStories: 2,
  };

  const mockLeadTimeData: LeadTimeData = {
    overallAverageDays: 7,
    overallAverageHours: 168,
    cycleTimeComparison: { leadTime: 7, cycleTime: 4.9, waitTime: 2.1 },
    trend: [{ sprintNumber: 1, sprintName: 'Sprint 1', averageDays: 7 }],
  };

  const mockAgentUtilizationData: AgentUtilizationData = {
    entries: [{ agentType: 'dev', utilizationPercentage: 45, activeHours: 10, totalAvailableHours: 22 }],
    totalActiveHours: 10,
    averageUtilization: 45,
  };

  const mockCumulativeFlowData: CumulativeFlowData = {
    dataPoints: [{ date: '2026-01-01', backlog: 5, in_progress: 2, review: 1, done: 3 }],
    dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
  };

  const mockHeatmapData: HeatmapData = {
    cells: [{ agentType: 'dev', dayOfWeek: 'Mon', hours: 5 }],
    maxHours: 5,
    agentSummary: { dev: 5, qa: 0, planner: 0, devops: 0, orchestrator: 0 },
  };

  beforeEach(async () => {
    const mockService = {
      getVelocityData: jest.fn(),
      getBurndownData: jest.fn(),
      getThroughputData: jest.fn(),
      getCycleTimeData: jest.fn(),
      getLeadTimeData: jest.fn(),
      getAgentUtilizationData: jest.fn(),
      getCumulativeFlowData: jest.fn(),
      getAgentHeatmapData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectAnalyticsController],
      providers: [
        { provide: ProjectAnalyticsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ProjectAnalyticsController>(ProjectAnalyticsController);
    service = module.get(ProjectAnalyticsService) as jest.Mocked<ProjectAnalyticsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Velocity Endpoint Tests
  // ============================================================================
  describe('GET /analytics/velocity', () => {
    it('should return velocity data with AnalyticsResponse wrapper', async () => {
      service.getVelocityData.mockResolvedValue(mockVelocityData);

      const result = await controller.getVelocity(workspaceId, projectId);

      expect(result.data).toEqual(mockVelocityData);
      expect(result.projectId).toBe(projectId);
      expect(typeof result.generatedAt).toBe('string');
    });

    it('should validate sprintCount range (1-50)', async () => {
      await expect(
        controller.getVelocity(workspaceId, projectId, '0'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getVelocity(workspaceId, projectId, '51'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getVelocity(workspaceId, projectId, 'abc'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default sprintCount to 6', async () => {
      service.getVelocityData.mockResolvedValue(mockVelocityData);

      await controller.getVelocity(workspaceId, projectId);

      expect(service.getVelocityData).toHaveBeenCalledWith(projectId, 6);
    });

    it('should accept valid sprintCount', async () => {
      service.getVelocityData.mockResolvedValue(mockVelocityData);

      await controller.getVelocity(workspaceId, projectId, '10');

      expect(service.getVelocityData).toHaveBeenCalledWith(projectId, 10);
    });
  });

  // ============================================================================
  // Burndown Endpoint Tests
  // ============================================================================
  describe('GET /analytics/burndown/:sprintId', () => {
    it('should return burndown data for valid sprint', async () => {
      service.getBurndownData.mockResolvedValue(mockBurndownData);

      const result = await controller.getBurndown(workspaceId, projectId, sprintId);

      expect(result.data).toEqual(mockBurndownData);
      expect(result.projectId).toBe(projectId);
    });

    it('should return 404 for non-existent sprint', async () => {
      service.getBurndownData.mockRejectedValue(
        new NotFoundException('Sprint not found'),
      );

      await expect(
        controller.getBurndown(workspaceId, projectId, sprintId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // Throughput Endpoint Tests
  // ============================================================================
  describe('GET /analytics/throughput', () => {
    it('should return throughput data for valid date range', async () => {
      service.getThroughputData.mockResolvedValue(mockThroughputData);

      const result = await controller.getThroughput(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data).toEqual(mockThroughputData);
    });

    it('should require startDate and endDate', async () => {
      await expect(
        controller.getThroughput(workspaceId, projectId, '', '2026-01-31'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getThroughput(workspaceId, projectId, '2026-01-01', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid date format', async () => {
      await expect(
        controller.getThroughput(workspaceId, projectId, 'not-a-date', '2026-01-31'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject startDate > endDate', async () => {
      await expect(
        controller.getThroughput(workspaceId, projectId, '2026-02-01', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject date range > 365 days', async () => {
      await expect(
        controller.getThroughput(workspaceId, projectId, '2025-01-01', '2026-12-31'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // Cycle Time Endpoint Tests
  // ============================================================================
  describe('GET /analytics/cycle-time', () => {
    it('should return cycle time data with distribution', async () => {
      service.getCycleTimeData.mockResolvedValue(mockCycleTimeData);

      const result = await controller.getCycleTime(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data).toEqual(mockCycleTimeData);
      expect(result.data.distribution).toHaveLength(5);
    });

    it('should validate date parameters', async () => {
      await expect(
        controller.getCycleTime(workspaceId, projectId, 'invalid', '2026-01-31'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // Lead Time Endpoint Tests
  // ============================================================================
  describe('GET /analytics/lead-time', () => {
    it('should return lead time with cycle time comparison', async () => {
      service.getLeadTimeData.mockResolvedValue(mockLeadTimeData);

      const result = await controller.getLeadTime(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data.cycleTimeComparison).toBeDefined();
      expect(result.data.cycleTimeComparison.waitTime).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Agent Utilization Endpoint Tests
  // ============================================================================
  describe('GET /analytics/agent-utilization', () => {
    it('should return utilization per agent type', async () => {
      service.getAgentUtilizationData.mockResolvedValue(mockAgentUtilizationData);

      const result = await controller.getAgentUtilization(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data.entries.length).toBeGreaterThan(0);
      expect(result.data.totalActiveHours).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Cumulative Flow Endpoint Tests
  // ============================================================================
  describe('GET /analytics/cumulative-flow', () => {
    it('should return daily status distribution', async () => {
      service.getCumulativeFlowData.mockResolvedValue(mockCumulativeFlowData);

      const result = await controller.getCumulativeFlow(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data.dataPoints.length).toBeGreaterThan(0);
      const dp = result.data.dataPoints[0];
      expect(typeof dp.backlog).toBe('number');
      expect(typeof dp.in_progress).toBe('number');
      expect(typeof dp.review).toBe('number');
      expect(typeof dp.done).toBe('number');
    });
  });

  // ============================================================================
  // Agent Heatmap Endpoint Tests
  // ============================================================================
  describe('GET /analytics/agent-heatmap', () => {
    it('should return heatmap cells by day and agent type', async () => {
      service.getAgentHeatmapData.mockResolvedValue(mockHeatmapData);

      const result = await controller.getAgentHeatmap(
        workspaceId,
        projectId,
        '2026-01-01',
        '2026-01-31',
      );

      expect(result.data.cells.length).toBeGreaterThan(0);
      expect(typeof result.data.maxHours).toBe('number');
      expect(typeof result.data.agentSummary).toBe('object');
    });
  });

  // ============================================================================
  // Date Validation Tests (applies to all date-based endpoints)
  // ============================================================================
  describe('Date validation (shared)', () => {
    it('should accept same start and end date', async () => {
      service.getThroughputData.mockResolvedValue(mockThroughputData);

      const result = await controller.getThroughput(
        workspaceId,
        projectId,
        '2026-01-15',
        '2026-01-15',
      );

      expect(result.data).toEqual(mockThroughputData);
    });

    it('should accept ISO datetime format', async () => {
      service.getCycleTimeData.mockResolvedValue(mockCycleTimeData);

      const result = await controller.getCycleTime(
        workspaceId,
        projectId,
        '2026-01-01T00:00:00Z',
        '2026-01-31T23:59:59Z',
      );

      expect(result.data).toEqual(mockCycleTimeData);
    });

    it('should reject range exceeding 365 days from any date endpoint', async () => {
      await expect(
        controller.getLeadTime(workspaceId, projectId, '2024-01-01', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getAgentUtilization(workspaceId, projectId, '2024-01-01', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getCumulativeFlow(workspaceId, projectId, '2024-01-01', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getAgentHeatmap(workspaceId, projectId, '2024-01-01', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // Response Format Tests
  // ============================================================================
  describe('Response format', () => {
    it('should wrap all responses in AnalyticsResponse format', async () => {
      service.getVelocityData.mockResolvedValue(mockVelocityData);
      service.getThroughputData.mockResolvedValue(mockThroughputData);
      service.getBurndownData.mockResolvedValue(mockBurndownData);

      const v = await controller.getVelocity(workspaceId, projectId);
      const t = await controller.getThroughput(workspaceId, projectId, '2026-01-01', '2026-01-31');
      const b = await controller.getBurndown(workspaceId, projectId, sprintId);

      for (const result of [v, t, b]) {
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('generatedAt');
        expect(result).toHaveProperty('projectId');
        expect(result.projectId).toBe(projectId);
      }
    });
  });
});
