import { AdminAnalyticsService } from '../services/admin-analytics.service';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let mockDataSource: any;
  let mockRedisService: any;

  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2026-01-31T23:59:59.000Z');

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new AdminAnalyticsService(mockDataSource, mockRedisService);
  });

  describe('getUserMetrics', () => {
    it('should return total user count from users table', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }]) // total
        .mockResolvedValueOnce([{ count: '25' }])  // new
        .mockResolvedValueOnce([{ count: '80' }])  // active
        .mockResolvedValueOnce([{ count: '5' }])   // suspended
        .mockResolvedValueOnce([{ count: '10' }])  // churned
        .mockResolvedValueOnce([{ total: '100' }])  // onboarding total
        .mockResolvedValueOnce([{ completed: '75' }]) // onboarding completed
        .mockResolvedValueOnce([])  // DAU
        .mockResolvedValueOnce([]); // registration trend

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.totalUsers).toBe(150);
    });

    it('should return new registrations within date range', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.newRegistrations).toBe(25);
    });

    it('should return active users (lastLoginAt within range)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.activeUsers).toBe(80);
    });

    it('should return suspended user count', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.suspendedUsers).toBe(5);
    });

    it('should return churned user count (inactive > 30 days)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.churnedUsers).toBe(10);
    });

    it('should return onboarding completion rate from onboarding_status table', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.onboardingCompletionRate).toBe(75);
    });

    it('should return daily active users grouped by date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([
          { date: '2026-01-15', count: '42' },
          { date: '2026-01-16', count: '38' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.dailyActiveUsers).toEqual([
        { date: '2026-01-15', count: 42 },
        { date: '2026-01-16', count: 38 },
      ]);
    });

    it('should return registration trend grouped by date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { date: '2026-01-15', count: '5' },
          { date: '2026-01-16', count: '3' },
        ]);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.registrationTrend).toEqual([
        { date: '2026-01-15', count: 5 },
        { date: '2026-01-16', count: 3 },
      ]);
    });

    it('should cache results in Redis with 5-minute TTL', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '150' }])
        .mockResolvedValueOnce([{ count: '25' }])
        .mockResolvedValueOnce([{ count: '80' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([{ completed: '75' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getUserMetrics(startDate, endDate);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('admin:analytics:users:'),
        expect.any(String),
        300,
      );
    });

    it('should return cached results on second call', async () => {
      const cachedData = JSON.stringify({
        totalUsers: 200,
        newRegistrations: 30,
        activeUsers: 100,
        suspendedUsers: 2,
        churnedUsers: 5,
        onboardingCompletionRate: 80,
        dailyActiveUsers: [],
        registrationTrend: [],
      });
      mockRedisService.get.mockResolvedValue(cachedData);

      const result = await service.getUserMetrics(startDate, endDate);
      expect(result.totalUsers).toBe(200);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('getProjectMetrics', () => {
    it('should return total project count (excluding soft-deleted)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])    // total
        .mockResolvedValueOnce([{ count: '15' }])    // active
        .mockResolvedValueOnce([])                    // by template
        .mockResolvedValueOnce([{ avg_stories: '3.5' }]) // avg stories
        .mockResolvedValueOnce([])                    // creation trend
        .mockResolvedValueOnce([]);                   // top projects

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.totalProjects).toBe(42);
    });

    it('should return active projects (with recent story activity)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ avg_stories: '3.5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.activeProjects).toBe(15);
    });

    it('should return projects grouped by template', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([
          { template: 'nextjs', count: '20' },
          { template: 'react', count: '15' },
        ])
        .mockResolvedValueOnce([{ avg_stories: '3.5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.projectsByTemplate).toEqual([
        { template: 'nextjs', count: 20 },
        { template: 'react', count: 15 },
      ]);
    });

    it('should return average stories per project', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ avg_stories: '3.5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.averageStoriesPerProject).toBe(3.5);
    });

    it('should return project creation trend by date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ avg_stories: '3.5' }])
        .mockResolvedValueOnce([
          { date: '2026-01-10', count: '3' },
          { date: '2026-01-15', count: '5' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.projectCreationTrend).toEqual([
        { date: '2026-01-10', count: 3 },
        { date: '2026-01-15', count: 5 },
      ]);
    });

    it('should return top 10 projects by activity', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '42' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ avg_stories: '3.5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'p1', name: 'Project A', workspace_name: 'WS1', story_count: '20' },
          { id: 'p2', name: 'Project B', workspace_name: 'WS2', story_count: '15' },
        ]);

      const result = await service.getProjectMetrics(startDate, endDate);
      expect(result.topProjectsByActivity).toEqual([
        { id: 'p1', name: 'Project A', workspaceName: 'WS1', storyCount: 20 },
        { id: 'p2', name: 'Project B', workspaceName: 'WS2', storyCount: 15 },
      ]);
    });
  });

  describe('getAgentMetrics', () => {
    it('should return total, completed, and failed task counts', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }]) // total
        .mockResolvedValueOnce([{ count: '85' }])  // completed
        .mockResolvedValueOnce([{ count: '10' }])  // failed
        .mockResolvedValueOnce([])   // by type
        .mockResolvedValueOnce([])   // duration
        .mockResolvedValueOnce([])   // trend
        .mockResolvedValueOnce([]);  // failures

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.totalTasks).toBe(100);
      expect(result.completedTasks).toBe(85);
      expect(result.failedTasks).toBe(10);
    });

    it('should return success rate as percentage', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([{ count: '85' }])
        .mockResolvedValueOnce([{ count: '15' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.successRate).toBe(85);
    });

    it('should return tasks breakdown by agent type', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([{ count: '85' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([
          { type: 'dev', total: '50', completed: '45', failed: '3' },
          { type: 'qa', total: '30', completed: '25', failed: '4' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.tasksByAgentType).toEqual([
        { type: 'dev', total: 50, completed: 45, failed: 3 },
        { type: 'qa', total: 30, completed: 25, failed: 4 },
      ]);
    });

    it('should return average duration by agent type', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([{ count: '85' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { type: 'dev', avg_duration_ms: '45000.5' },
          { type: 'qa', avg_duration_ms: '30000.2' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.averageDurationByType).toEqual([
        { type: 'dev', avgDurationMs: 45001 },
        { type: 'qa', avgDurationMs: 30000 },
      ]);
    });

    it('should return agent task trend by date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([{ count: '85' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { date: '2026-01-15', count: '12' },
          { date: '2026-01-16', count: '8' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.agentTaskTrend).toEqual([
        { date: '2026-01-15', count: 12 },
        { date: '2026-01-16', count: 8 },
      ]);
    });

    it('should return top failure reasons (truncated to 100 chars)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '100' }])
        .mockResolvedValueOnce([{ count: '85' }])
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { reason: 'Connection timeout', count: '5' },
          { reason: 'Out of memory', count: '3' },
        ]);

      const result = await service.getAgentMetrics(startDate, endDate);
      expect(result.failureReasons).toEqual([
        { reason: 'Connection timeout', count: 5 },
        { reason: 'Out of memory', count: 3 },
      ]);
    });
  });

  describe('getAiUsageMetrics', () => {
    it('should return total API calls and cost (platform-wide, no workspace filter)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([])  // by provider
        .mockResolvedValueOnce([])  // by model
        .mockResolvedValueOnce([])  // daily
        .mockResolvedValueOnce([]); // top workspaces

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.totalApiCalls).toBe(500);
      expect(result.totalCostUsd).toBe(125.5);
    });

    it('should return total input/output tokens', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.totalInputTokens).toBe(100000);
      expect(result.totalOutputTokens).toBe(50000);
    });

    it('should return cost breakdown by provider', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([
          { provider: 'anthropic', cost: '100.00', requests: '300' },
          { provider: 'openai', cost: '25.50', requests: '200' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.costByProvider).toEqual([
        { provider: 'anthropic', cost: 100, requests: 300 },
        { provider: 'openai', cost: 25.5, requests: 200 },
      ]);
    });

    it('should return cost breakdown by model', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { model: 'claude-3-opus', cost: '80.00', requests: '200' },
          { model: 'gpt-4', cost: '45.50', requests: '300' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.costByModel).toEqual([
        { model: 'claude-3-opus', cost: 80, requests: 200 },
        { model: 'gpt-4', cost: 45.5, requests: 300 },
      ]);
    });

    it('should return daily cost trend', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { date: '2026-01-15', cost: '10.50', requests: '30' },
          { date: '2026-01-16', cost: '8.25', requests: '25' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.dailyCostTrend).toEqual([
        { date: '2026-01-15', cost: 10.5, requests: 30 },
        { date: '2026-01-16', cost: 8.25, requests: 25 },
      ]);
    });

    it('should return top 10 workspaces by cost with workspace name', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total_calls: '500', total_cost: '125.50', total_input_tokens: '100000', total_output_tokens: '50000' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { workspace_id: 'ws-1', workspace_name: 'Workspace A', cost: '50.00', requests: '150' },
          { workspace_id: 'ws-2', workspace_name: 'Workspace B', cost: '30.00', requests: '100' },
        ]);

      const result = await service.getAiUsageMetrics(startDate, endDate);
      expect(result.topWorkspacesByCost).toEqual([
        { workspaceId: 'ws-1', workspaceName: 'Workspace A', cost: 50, requests: 150 },
        { workspaceId: 'ws-2', workspaceName: 'Workspace B', cost: 30, requests: 100 },
      ]);
    });
  });

  describe('getOverviewMetrics', () => {
    it('should return all four metric categories', async () => {
      // Mock Redis to return null (no cache)
      mockRedisService.get.mockResolvedValue(null);

      // Mock all queries for both current and previous periods
      // Each metric method calls multiple queries, and they will all be called
      // We mock all to return minimal data
      mockDataSource.query.mockResolvedValue([{ count: '0', total_calls: '0', total_cost: '0', total_input_tokens: '0', total_output_tokens: '0', avg_stories: '0', total: '0', completed: '0' }]);

      const result = await service.getOverviewMetrics(startDate, endDate);
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('projects');
      expect(result).toHaveProperty('agents');
      expect(result).toHaveProperty('aiUsage');
    });

    it('should return previous period comparison data', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0', total_calls: '0', total_cost: '0', total_input_tokens: '0', total_output_tokens: '0', avg_stories: '0', total: '0', completed: '0' }]);

      const result = await service.getOverviewMetrics(startDate, endDate);
      expect(result.previousPeriod).toHaveProperty('users');
      expect(result.previousPeriod).toHaveProperty('projects');
      expect(result.previousPeriod).toHaveProperty('agents');
      expect(result.previousPeriod).toHaveProperty('aiUsage');
    });

    it('should calculate previous period with same duration shifted back', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0', total_calls: '0', total_cost: '0', total_input_tokens: '0', total_output_tokens: '0', avg_stories: '0', total: '0', completed: '0' }]);

      const result = await service.getOverviewMetrics(startDate, endDate);
      expect(result.previousPeriod.users).toHaveProperty('totalUsers');
      expect(result.previousPeriod.users).toHaveProperty('newRegistrations');
      expect(result.previousPeriod.users).toHaveProperty('activeUsers');
    });
  });

  describe('empty database handling', () => {
    it('should handle empty database gracefully (return zero/empty values)', async () => {
      // getUserMetrics: 9 queries in order
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])   // total users
        .mockResolvedValueOnce([{ count: '0' }])   // new registrations
        .mockResolvedValueOnce([{ count: '0' }])   // active users
        .mockResolvedValueOnce([{ count: '0' }])   // suspended
        .mockResolvedValueOnce([{ count: '0' }])   // churned
        .mockResolvedValueOnce([{ total: '0' }])   // onboarding total
        .mockResolvedValueOnce([{ completed: '0' }]) // onboarding completed
        .mockResolvedValueOnce([])                  // DAU (empty)
        .mockResolvedValueOnce([]);                 // registration trend (empty)

      const userResult = await service.getUserMetrics(startDate, endDate);
      expect(userResult.totalUsers).toBe(0);
      expect(userResult.dailyActiveUsers).toEqual([]);
      expect(userResult.registrationTrend).toEqual([]);

      // getProjectMetrics: 6 queries
      mockRedisService.get.mockResolvedValue(null);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])   // total
        .mockResolvedValueOnce([{ count: '0' }])   // active
        .mockResolvedValueOnce([])                  // by template
        .mockResolvedValueOnce([{ avg_stories: '0' }]) // avg stories
        .mockResolvedValueOnce([])                  // creation trend
        .mockResolvedValueOnce([]);                 // top projects

      const projectResult = await service.getProjectMetrics(startDate, endDate);
      expect(projectResult.totalProjects).toBe(0);
    });
  });

  describe('date range edge cases', () => {
    it('should handle same day range', async () => {
      const sameDay = new Date('2026-01-15T00:00:00.000Z');
      const sameDayEnd = new Date('2026-01-15T23:59:59.000Z');

      mockDataSource.query.mockResolvedValue([{ count: '0', total: '0', completed: '0' }]);

      const result = await service.getUserMetrics(sameDay, sameDayEnd);
      expect(result).toBeDefined();
      expect(mockDataSource.query).toHaveBeenCalled();
    });
  });

  describe('exportToCsv', () => {
    it('should generate valid CSV string for users', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '10' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ count: '8' }])
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([{ total: '10' }])
        .mockResolvedValueOnce([{ completed: '7' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const csv = await service.exportToCsv('users', startDate, endDate);
      expect(csv).toContain('User Metrics');
      expect(csv).toContain('Total Users');
    });

    it('should generate valid CSV string for all metrics', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0', total: '0', completed: '0', total_calls: '0', total_cost: '0', total_input_tokens: '0', total_output_tokens: '0', avg_stories: '0' }]);

      const csv = await service.exportToCsv('all', startDate, endDate);
      expect(csv).toContain('User Metrics');
      expect(csv).toContain('Project Metrics');
      expect(csv).toContain('Agent Metrics');
      expect(csv).toContain('AI Usage Metrics');
    });
  });
});
