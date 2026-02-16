import { BadRequestException } from '@nestjs/common';
import { AdminAnalyticsController } from '../controllers/admin-analytics.controller';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { AnalyticsQueryDto, AnalyticsExportQueryDto } from '../dto/analytics-query.dto';

describe('AdminAnalyticsController', () => {
  let controller: AdminAnalyticsController;
  let mockAnalyticsService: any;
  let mockAuditService: any;

  const mockUserMetrics = {
    totalUsers: 150,
    newRegistrations: 25,
    activeUsers: 80,
    suspendedUsers: 5,
    churnedUsers: 10,
    onboardingCompletionRate: 75,
    dailyActiveUsers: [{ date: '2026-01-15', count: 42 }],
    registrationTrend: [{ date: '2026-01-15', count: 5 }],
  };

  const mockOverviewMetrics = {
    users: mockUserMetrics,
    projects: { totalProjects: 42, activeProjects: 15, projectsByTemplate: [], averageStoriesPerProject: 3.5, projectCreationTrend: [], topProjectsByActivity: [] },
    agents: { totalTasks: 100, completedTasks: 85, failedTasks: 10, successRate: 89.5, tasksByAgentType: [], averageDurationByType: [], agentTaskTrend: [], failureReasons: [] },
    aiUsage: { totalApiCalls: 500, totalCostUsd: 125.50, totalInputTokens: 100000, totalOutputTokens: 50000, costByProvider: [], costByModel: [], dailyCostTrend: [], topWorkspacesByCost: [] },
    previousPeriod: {
      users: { totalUsers: 120, newRegistrations: 20, activeUsers: 70 },
      projects: { totalProjects: 35, activeProjects: 10 },
      agents: { totalTasks: 80, successRate: 87 },
      aiUsage: { totalCostUsd: 100, totalApiCalls: 400 },
    },
  };

  const mockReq = {
    user: { userId: 'admin-1' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  };

  beforeEach(() => {
    mockAnalyticsService = {
      getOverviewMetrics: jest.fn().mockResolvedValue(mockOverviewMetrics),
      getUserMetrics: jest.fn().mockResolvedValue(mockUserMetrics),
      getProjectMetrics: jest.fn().mockResolvedValue(mockOverviewMetrics.projects),
      getAgentMetrics: jest.fn().mockResolvedValue(mockOverviewMetrics.agents),
      getAiUsageMetrics: jest.fn().mockResolvedValue(mockOverviewMetrics.aiUsage),
      exportToCsv: jest.fn().mockResolvedValue('Metric,Value\nTotal Users,150'),
    };

    mockAuditService = {
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AdminAnalyticsController(mockAnalyticsService, mockAuditService);
  });

  describe('GET /api/admin/analytics/overview', () => {
    it('should return overview metrics with default 30d range', async () => {
      const query = new AnalyticsQueryDto();
      query.range = '30d';

      const result = await controller.getOverview(query, mockReq);

      expect(result.data).toEqual(mockOverviewMetrics);
      expect(result.period).toHaveProperty('start');
      expect(result.period).toHaveProperty('end');
      expect(mockAnalyticsService.getOverviewMetrics).toHaveBeenCalled();
    });

    it('should work with custom date range', async () => {
      const query = new AnalyticsQueryDto();
      query.range = 'custom';
      query.startDate = '2026-01-01T00:00:00.000Z';
      query.endDate = '2026-01-31T23:59:59.000Z';

      const result = await controller.getOverview(query, mockReq);

      expect(result.data).toBeDefined();
      expect(mockAnalyticsService.getOverviewMetrics).toHaveBeenCalledWith(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-31T23:59:59.000Z'),
      );
    });

    it('should log audit action ADMIN_ANALYTICS_VIEWED (fire-and-forget)', async () => {
      const query = new AnalyticsQueryDto();
      query.range = '30d';

      await controller.getOverview(query, mockReq);

      // Audit logging is fire-and-forget, allow microtask to settle
      await new Promise((r) => setImmediate(r));

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'admin-1',
        AuditAction.ADMIN_ANALYTICS_VIEWED,
        'platform',
        { section: 'overview' },
        mockReq,
      );
    });
  });

  describe('GET /api/admin/analytics/users', () => {
    it('should return user metrics', async () => {
      const query = new AnalyticsQueryDto();
      query.range = '30d';

      const result = await controller.getUserMetrics(query, mockReq);

      expect(result.data).toEqual(mockUserMetrics);
      expect(mockAnalyticsService.getUserMetrics).toHaveBeenCalled();
    });

    it('should log audit action (fire-and-forget)', async () => {
      const query = new AnalyticsQueryDto();
      await controller.getUserMetrics(query, mockReq);

      // Audit logging is fire-and-forget, allow microtask to settle
      await new Promise((r) => setImmediate(r));

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'admin-1',
        AuditAction.ADMIN_ANALYTICS_VIEWED,
        'platform',
        { section: 'users' },
        mockReq,
      );
    });
  });

  describe('GET /api/admin/analytics/projects', () => {
    it('should return project metrics', async () => {
      const query = new AnalyticsQueryDto();
      const result = await controller.getProjectMetrics(query, mockReq);
      expect(result.data).toEqual(mockOverviewMetrics.projects);
    });
  });

  describe('GET /api/admin/analytics/agents', () => {
    it('should return agent metrics', async () => {
      const query = new AnalyticsQueryDto();
      const result = await controller.getAgentMetrics(query, mockReq);
      expect(result.data).toEqual(mockOverviewMetrics.agents);
    });
  });

  describe('GET /api/admin/analytics/ai-usage', () => {
    it('should return AI usage metrics', async () => {
      const query = new AnalyticsQueryDto();
      const result = await controller.getAiUsageMetrics(query, mockReq);
      expect(result.data).toEqual(mockOverviewMetrics.aiUsage);
    });
  });

  describe('GET /api/admin/analytics/export', () => {
    it('should return CSV with correct headers', async () => {
      const query = new AnalyticsExportQueryDto();
      query.range = '30d';
      query.metric = 'users';

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportMetrics(query, mockReq, mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="devos-analytics-users-'),
      );
      expect(mockRes.send).toHaveBeenCalledWith('Metric,Value\nTotal Users,150');
    });

    it('should export with metric=all', async () => {
      const query = new AnalyticsExportQueryDto();
      query.range = '30d';
      query.metric = 'all';

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportMetrics(query, mockReq, mockRes as any);

      expect(mockAnalyticsService.exportToCsv).toHaveBeenCalledWith(
        'all',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('should log audit action ADMIN_ANALYTICS_EXPORTED (fire-and-forget)', async () => {
      const query = new AnalyticsExportQueryDto();
      query.range = '30d';
      query.metric = 'users';

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportMetrics(query, mockReq, mockRes as any);

      // Audit logging is fire-and-forget, allow microtask to settle
      await new Promise((r) => setImmediate(r));

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'admin-1',
        AuditAction.ADMIN_ANALYTICS_EXPORTED,
        'platform',
        expect.objectContaining({ metric: 'users' }),
        mockReq,
      );
    });
  });

  describe('date validation', () => {
    it('should throw BadRequestException when startDate >= endDate', async () => {
      const query = new AnalyticsQueryDto();
      query.range = 'custom';
      query.startDate = '2026-02-01T00:00:00.000Z';
      query.endDate = '2026-01-01T00:00:00.000Z';

      await expect(controller.getOverview(query, mockReq)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when range exceeds 365 days', async () => {
      const query = new AnalyticsQueryDto();
      query.range = 'custom';
      query.startDate = '2024-01-01T00:00:00.000Z';
      query.endDate = '2026-01-01T00:00:00.000Z';

      await expect(controller.getOverview(query, mockReq)).rejects.toThrow(BadRequestException);
    });
  });
});
