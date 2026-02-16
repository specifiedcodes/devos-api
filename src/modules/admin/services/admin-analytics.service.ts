import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';

/**
 * AdminAnalyticsService
 * Story 14.7: Admin Analytics Dashboard (AC1)
 *
 * Provides platform-wide analytics aggregations using raw SQL queries
 * against existing database tables. Results are cached in Redis for 5 minutes.
 */

// --- Metric Interfaces ---

export interface UserMetrics {
  totalUsers: number;
  newRegistrations: number;
  activeUsers: number;
  suspendedUsers: number;
  churnedUsers: number;
  onboardingCompletionRate: number;
  dailyActiveUsers: { date: string; count: number }[];
  registrationTrend: { date: string; count: number }[];
}

export interface ProjectMetrics {
  totalProjects: number;
  activeProjects: number;
  projectsByTemplate: { template: string; count: number }[];
  averageStoriesPerProject: number;
  projectCreationTrend: { date: string; count: number }[];
  topProjectsByActivity: { id: string; name: string; workspaceName: string; storyCount: number }[];
}

export interface AgentMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  tasksByAgentType: { type: string; total: number; completed: number; failed: number }[];
  averageDurationByType: { type: string; avgDurationMs: number }[];
  agentTaskTrend: { date: string; count: number }[];
  failureReasons: { reason: string; count: number }[];
}

export interface AiUsageMetrics {
  totalApiCalls: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costByProvider: { provider: string; cost: number; requests: number }[];
  costByModel: { model: string; cost: number; requests: number }[];
  dailyCostTrend: { date: string; cost: number; requests: number }[];
  topWorkspacesByCost: { workspaceId: string; workspaceName: string; cost: number; requests: number }[];
}

export interface OverviewMetrics {
  users: UserMetrics;
  projects: ProjectMetrics;
  agents: AgentMetrics;
  aiUsage: AiUsageMetrics;
  previousPeriod: {
    users: { totalUsers: number; newRegistrations: number; activeUsers: number };
    projects: { totalProjects: number; activeProjects: number };
    agents: { totalTasks: number; successRate: number };
    aiUsage: { totalCostUsd: number; totalApiCalls: number };
  };
}

const CACHE_TTL = 300; // 5 minutes in seconds

@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get user metrics for the given date range
   */
  async getUserMetrics(startDate: Date, endDate: Date): Promise<UserMetrics> {
    const cacheKey = `admin:analytics:users:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Total users (not deleted)
      const [totalResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.users WHERE deleted_at IS NULL`,
      );
      const totalUsers = parseInt(totalResult?.count || '0', 10);

      // New registrations in date range
      const [newResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.users WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL`,
        [startDate, endDate],
      );
      const newRegistrations = parseInt(newResult?.count || '0', 10);

      // Active users (last login within date range)
      const [activeResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.users WHERE last_login_at >= $1 AND last_login_at <= $2 AND deleted_at IS NULL`,
        [startDate, endDate],
      );
      const activeUsers = parseInt(activeResult?.count || '0', 10);

      // Suspended users
      const [suspendedResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.users WHERE suspended_at IS NOT NULL AND deleted_at IS NULL`,
      );
      const suspendedUsers = parseInt(suspendedResult?.count || '0', 10);

      // Churned users (last login > 30 days ago, not deleted)
      const [churnedResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.users WHERE last_login_at < NOW() - INTERVAL '30 days' AND last_login_at IS NOT NULL AND deleted_at IS NULL`,
      );
      const churnedUsers = parseInt(churnedResult?.count || '0', 10);

      // Onboarding completion rate
      let onboardingCompletionRate = 0;
      try {
        const [totalOnboarding] = await this.dataSource.query(
          `SELECT COUNT(*) as total FROM public.onboarding_status`,
        );
        const [completedOnboarding] = await this.dataSource.query(
          `SELECT COUNT(*) as completed FROM public.onboarding_status WHERE status = 'COMPLETED'`,
        );
        const totalOb = parseInt(totalOnboarding?.total || '0', 10);
        const completedOb = parseInt(completedOnboarding?.completed || '0', 10);
        onboardingCompletionRate = totalOb > 0 ? Math.round((completedOb / totalOb) * 100) : 0;
      } catch {
        // onboarding_status table may not exist, default to 0
        this.logger.warn('Could not query onboarding_status table');
      }

      // Daily active users grouped by date
      const dauRows = await this.dataSource.query(
        `SELECT DATE(last_login_at) as date, COUNT(DISTINCT id) as count
         FROM public.users
         WHERE last_login_at >= $1 AND last_login_at <= $2 AND deleted_at IS NULL
         GROUP BY DATE(last_login_at)
         ORDER BY date ASC`,
        [startDate, endDate],
      );
      const dailyActiveUsers = dauRows.map((row: any) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        count: parseInt(row.count || '0', 10),
      }));

      // Registration trend grouped by date
      const regRows = await this.dataSource.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM public.users
         WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [startDate, endDate],
      );
      const registrationTrend = regRows.map((row: any) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        count: parseInt(row.count || '0', 10),
      }));

      const result: UserMetrics = {
        totalUsers,
        newRegistrations,
        activeUsers,
        suspendedUsers,
        churnedUsers,
        onboardingCompletionRate,
        dailyActiveUsers,
        registrationTrend,
      };

      await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
      return result;
    } catch (error) {
      this.logger.error('Failed to get user metrics', error);
      return {
        totalUsers: 0,
        newRegistrations: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        churnedUsers: 0,
        onboardingCompletionRate: 0,
        dailyActiveUsers: [],
        registrationTrend: [],
      };
    }
  }

  /**
   * Get project metrics for the given date range
   */
  async getProjectMetrics(startDate: Date, endDate: Date): Promise<ProjectMetrics> {
    const cacheKey = `admin:analytics:projects:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Total projects (not deleted)
      const [totalResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.projects WHERE deleted_at IS NULL`,
      );
      const totalProjects = parseInt(totalResult?.count || '0', 10);

      // Active projects (stories updated within last 7 days)
      const [activeResult] = await this.dataSource.query(
        `SELECT COUNT(DISTINCT p.id) as count
         FROM public.projects p
         INNER JOIN public.stories s ON s.project_id = p.id
         WHERE p.deleted_at IS NULL
         AND s.updated_at >= NOW() - INTERVAL '7 days'`,
      );
      const activeProjects = parseInt(activeResult?.count || '0', 10);

      // Projects by template
      const templateRows = await this.dataSource.query(
        `SELECT COALESCE(template_id, 'none') as template, COUNT(*) as count
         FROM public.projects
         WHERE deleted_at IS NULL
         GROUP BY template_id
         ORDER BY count DESC`,
      );
      const projectsByTemplate = templateRows.map((row: any) => ({
        template: String(row.template || 'none'),
        count: parseInt(row.count || '0', 10),
      }));

      // Average stories per project
      const [avgResult] = await this.dataSource.query(
        `SELECT COALESCE(AVG(story_count), 0) as avg_stories FROM (
           SELECT p.id, COUNT(s.id) as story_count
           FROM public.projects p
           LEFT JOIN public.stories s ON s.project_id = p.id
           WHERE p.deleted_at IS NULL
           GROUP BY p.id
         ) sub`,
      );
      const averageStoriesPerProject = parseFloat(avgResult?.avg_stories || '0');

      // Project creation trend
      const creationRows = await this.dataSource.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM public.projects
         WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [startDate, endDate],
      );
      const projectCreationTrend = creationRows.map((row: any) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        count: parseInt(row.count || '0', 10),
      }));

      // Top 10 projects by activity (story count)
      const topRows = await this.dataSource.query(
        `SELECT p.id, p.name, w.name as workspace_name, COUNT(s.id) as story_count
         FROM public.projects p
         LEFT JOIN public.stories s ON s.project_id = p.id
         LEFT JOIN public.workspaces w ON w.id = p.workspace_id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id, p.name, w.name
         ORDER BY story_count DESC
         LIMIT 10`,
      );
      const topProjectsByActivity = topRows.map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ''),
        workspaceName: String(row.workspace_name || ''),
        storyCount: parseInt(row.story_count || '0', 10),
      }));

      const result: ProjectMetrics = {
        totalProjects,
        activeProjects,
        projectsByTemplate,
        averageStoriesPerProject: Math.round(averageStoriesPerProject * 10) / 10,
        projectCreationTrend,
        topProjectsByActivity,
      };

      await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
      return result;
    } catch (error) {
      this.logger.error('Failed to get project metrics', error);
      return {
        totalProjects: 0,
        activeProjects: 0,
        projectsByTemplate: [],
        averageStoriesPerProject: 0,
        projectCreationTrend: [],
        topProjectsByActivity: [],
      };
    }
  }

  /**
   * Get agent metrics for the given date range
   */
  async getAgentMetrics(startDate: Date, endDate: Date): Promise<AgentMetrics> {
    const cacheKey = `admin:analytics:agents:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Total, completed, and failed tasks in range
      const [totalResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.agents WHERE created_at >= $1 AND created_at <= $2`,
        [startDate, endDate],
      );
      const totalTasks = parseInt(totalResult?.count || '0', 10);

      const [completedResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.agents WHERE status = 'completed' AND created_at >= $1 AND created_at <= $2`,
        [startDate, endDate],
      );
      const completedTasks = parseInt(completedResult?.count || '0', 10);

      const [failedResult] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM public.agents WHERE status = 'failed' AND created_at >= $1 AND created_at <= $2`,
        [startDate, endDate],
      );
      const failedTasks = parseInt(failedResult?.count || '0', 10);

      const denominator = completedTasks + failedTasks;
      const successRate = denominator > 0 ? Math.round((completedTasks / denominator) * 100 * 10) / 10 : 0;

      // Tasks by agent type
      const typeRows = await this.dataSource.query(
        `SELECT type,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM public.agents
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY type
         ORDER BY total DESC`,
        [startDate, endDate],
      );
      const tasksByAgentType = typeRows.map((row: any) => ({
        type: String(row.type || 'unknown'),
        total: parseInt(row.total || '0', 10),
        completed: parseInt(row.completed || '0', 10),
        failed: parseInt(row.failed || '0', 10),
      }));

      // Average duration by type
      const durationRows = await this.dataSource.query(
        `SELECT type,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_duration_ms
         FROM public.agents
         WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
         AND created_at >= $1 AND created_at <= $2
         GROUP BY type
         ORDER BY avg_duration_ms DESC`,
        [startDate, endDate],
      );
      const averageDurationByType = durationRows.map((row: any) => ({
        type: String(row.type || 'unknown'),
        avgDurationMs: Math.round(parseFloat(row.avg_duration_ms || '0')),
      }));

      // Agent task trend by date
      const trendRows = await this.dataSource.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM public.agents
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [startDate, endDate],
      );
      const agentTaskTrend = trendRows.map((row: any) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        count: parseInt(row.count || '0', 10),
      }));

      // Top failure reasons (truncated to 100 chars)
      const failureRows = await this.dataSource.query(
        `SELECT LEFT(error_message, 100) as reason, COUNT(*) as count
         FROM public.agents
         WHERE status = 'failed' AND error_message IS NOT NULL
         AND created_at >= $1 AND created_at <= $2
         GROUP BY LEFT(error_message, 100)
         ORDER BY count DESC
         LIMIT 10`,
        [startDate, endDate],
      );
      const failureReasons = failureRows.map((row: any) => ({
        reason: String(row.reason || 'Unknown'),
        count: parseInt(row.count || '0', 10),
      }));

      const result: AgentMetrics = {
        totalTasks,
        completedTasks,
        failedTasks,
        successRate,
        tasksByAgentType,
        averageDurationByType,
        agentTaskTrend,
        failureReasons,
      };

      await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
      return result;
    } catch (error) {
      this.logger.error('Failed to get agent metrics', error);
      return {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        successRate: 0,
        tasksByAgentType: [],
        averageDurationByType: [],
        agentTaskTrend: [],
        failureReasons: [],
      };
    }
  }

  /**
   * Get AI usage metrics for the given date range (platform-wide, no workspace filter)
   */
  async getAiUsageMetrics(startDate: Date, endDate: Date): Promise<AiUsageMetrics> {
    const cacheKey = `admin:analytics:ai-usage:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Total API calls, cost, and tokens
      const [totalsResult] = await this.dataSource.query(
        `SELECT
           COUNT(*) as total_calls,
           COALESCE(SUM(cost_usd), 0) as total_cost,
           COALESCE(SUM(input_tokens), 0) as total_input_tokens,
           COALESCE(SUM(output_tokens), 0) as total_output_tokens
         FROM public.api_usage
         WHERE created_at >= $1 AND created_at <= $2`,
        [startDate, endDate],
      );
      const totalApiCalls = parseInt(totalsResult?.total_calls || '0', 10);
      const totalCostUsd = parseFloat(totalsResult?.total_cost || '0');
      const totalInputTokens = parseInt(totalsResult?.total_input_tokens || '0', 10);
      const totalOutputTokens = parseInt(totalsResult?.total_output_tokens || '0', 10);

      // Cost by provider
      const providerRows = await this.dataSource.query(
        `SELECT provider, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as requests
         FROM public.api_usage
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY provider
         ORDER BY cost DESC`,
        [startDate, endDate],
      );
      const costByProvider = providerRows.map((row: any) => ({
        provider: String(row.provider || 'unknown'),
        cost: parseFloat(row.cost || '0'),
        requests: parseInt(row.requests || '0', 10),
      }));

      // Cost by model
      const modelRows = await this.dataSource.query(
        `SELECT model, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as requests
         FROM public.api_usage
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY model
         ORDER BY cost DESC`,
        [startDate, endDate],
      );
      const costByModel = modelRows.map((row: any) => ({
        model: String(row.model || 'unknown'),
        cost: parseFloat(row.cost || '0'),
        requests: parseInt(row.requests || '0', 10),
      }));

      // Daily cost trend
      const dailyRows = await this.dataSource.query(
        `SELECT DATE(created_at) as date, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as requests
         FROM public.api_usage
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [startDate, endDate],
      );
      const dailyCostTrend = dailyRows.map((row: any) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        cost: parseFloat(row.cost || '0'),
        requests: parseInt(row.requests || '0', 10),
      }));

      // Top 10 workspaces by cost
      const wsRows = await this.dataSource.query(
        `SELECT u.workspace_id, w.name as workspace_name, COALESCE(SUM(u.cost_usd), 0) as cost, COUNT(*) as requests
         FROM public.api_usage u
         LEFT JOIN public.workspaces w ON w.id = u.workspace_id
         WHERE u.created_at >= $1 AND u.created_at <= $2
         GROUP BY u.workspace_id, w.name
         ORDER BY cost DESC
         LIMIT 10`,
        [startDate, endDate],
      );
      const topWorkspacesByCost = wsRows.map((row: any) => ({
        workspaceId: String(row.workspace_id || ''),
        workspaceName: String(row.workspace_name || 'Unknown'),
        cost: parseFloat(row.cost || '0'),
        requests: parseInt(row.requests || '0', 10),
      }));

      const result: AiUsageMetrics = {
        totalApiCalls,
        totalCostUsd: Math.round(totalCostUsd * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        costByProvider,
        costByModel,
        dailyCostTrend,
        topWorkspacesByCost,
      };

      await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
      return result;
    } catch (error) {
      this.logger.error('Failed to get AI usage metrics', error);
      return {
        totalApiCalls: 0,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        costByProvider: [],
        costByModel: [],
        dailyCostTrend: [],
        topWorkspacesByCost: [],
      };
    }
  }

  /**
   * Get lightweight previous-period summary (totals only, no trends/breakdowns).
   * Runs only the scalar-count queries needed for KPI delta comparison,
   * avoiding expensive GROUP BY DATE and JOIN queries.
   */
  private async getPreviousPeriodSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<OverviewMetrics['previousPeriod']> {
    const cacheKey = `admin:analytics:prev-summary:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // User totals (3 queries instead of 9)
      const [[totalUsersRow], [newRegsRow], [activeUsersRow]] = await Promise.all([
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.users WHERE deleted_at IS NULL`,
        ),
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.users WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL`,
          [startDate, endDate],
        ),
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.users WHERE last_login_at >= $1 AND last_login_at <= $2 AND deleted_at IS NULL`,
          [startDate, endDate],
        ),
      ]);

      // Project totals (2 queries instead of 6)
      const [[totalProjectsRow], [activeProjectsRow]] = await Promise.all([
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.projects WHERE deleted_at IS NULL`,
        ),
        this.dataSource.query(
          `SELECT COUNT(DISTINCT p.id) as count
           FROM public.projects p
           INNER JOIN public.stories s ON s.project_id = p.id
           WHERE p.deleted_at IS NULL
           AND s.updated_at >= NOW() - INTERVAL '7 days'`,
        ),
      ]);

      // Agent totals (3 queries instead of 7)
      const [[totalTasksRow], [completedTasksRow], [failedTasksRow]] = await Promise.all([
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.agents WHERE created_at >= $1 AND created_at <= $2`,
          [startDate, endDate],
        ),
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.agents WHERE status = 'completed' AND created_at >= $1 AND created_at <= $2`,
          [startDate, endDate],
        ),
        this.dataSource.query(
          `SELECT COUNT(*) as count FROM public.agents WHERE status = 'failed' AND created_at >= $1 AND created_at <= $2`,
          [startDate, endDate],
        ),
      ]);

      // AI usage totals (1 query instead of 5)
      const [aiTotalsRow] = await this.dataSource.query(
        `SELECT COUNT(*) as total_calls, COALESCE(SUM(cost_usd), 0) as total_cost
         FROM public.api_usage
         WHERE created_at >= $1 AND created_at <= $2`,
        [startDate, endDate],
      );

      const completedTasks = parseInt(completedTasksRow?.count || '0', 10);
      const failedTasks = parseInt(failedTasksRow?.count || '0', 10);
      const denominator = completedTasks + failedTasks;

      const summary: OverviewMetrics['previousPeriod'] = {
        users: {
          totalUsers: parseInt(totalUsersRow?.count || '0', 10),
          newRegistrations: parseInt(newRegsRow?.count || '0', 10),
          activeUsers: parseInt(activeUsersRow?.count || '0', 10),
        },
        projects: {
          totalProjects: parseInt(totalProjectsRow?.count || '0', 10),
          activeProjects: parseInt(activeProjectsRow?.count || '0', 10),
        },
        agents: {
          totalTasks: parseInt(totalTasksRow?.count || '0', 10),
          successRate: denominator > 0 ? Math.round((completedTasks / denominator) * 100 * 10) / 10 : 0,
        },
        aiUsage: {
          totalCostUsd: Math.round(parseFloat(aiTotalsRow?.total_cost || '0') * 100) / 100,
          totalApiCalls: parseInt(aiTotalsRow?.total_calls || '0', 10),
        },
      };

      await this.redisService.set(cacheKey, JSON.stringify(summary), CACHE_TTL);
      return summary;
    } catch (error) {
      this.logger.error('Failed to get previous period summary', error);
      return {
        users: { totalUsers: 0, newRegistrations: 0, activeUsers: 0 },
        projects: { totalProjects: 0, activeProjects: 0 },
        agents: { totalTasks: 0, successRate: 0 },
        aiUsage: { totalCostUsd: 0, totalApiCalls: 0 },
      };
    }
  }

  /**
   * Get overview metrics with all categories and previous period comparison
   */
  async getOverviewMetrics(startDate: Date, endDate: Date): Promise<OverviewMetrics> {
    const cacheKey = `admin:analytics:overview:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate previous period (same duration, shifted back)
    const durationMs = endDate.getTime() - startDate.getTime();
    const prevEndDate = new Date(startDate.getTime());
    const prevStartDate = new Date(startDate.getTime() - durationMs);

    // Fetch current period full metrics AND previous period summary in parallel
    const [users, projects, agents, aiUsage, previousPeriod] = await Promise.all([
      this.getUserMetrics(startDate, endDate),
      this.getProjectMetrics(startDate, endDate),
      this.getAgentMetrics(startDate, endDate),
      this.getAiUsageMetrics(startDate, endDate),
      this.getPreviousPeriodSummary(prevStartDate, prevEndDate),
    ]);

    const result: OverviewMetrics = {
      users,
      projects,
      agents,
      aiUsage,
      previousPeriod,
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
    return result;
  }

  /**
   * Export metrics to CSV string
   */
  async exportToCsv(metric: string, startDate: Date, endDate: Date): Promise<string> {
    const escapeCSV = (field: any): string => {
      if (field === null || field === undefined) return '';
      let value = String(field);
      if (value.startsWith('=') || value.startsWith('+') || value.startsWith('-') || value.startsWith('@')) {
        value = `'${value}`;
      }
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows: string[][] = [];

    if (metric === 'users' || metric === 'all') {
      const data = await this.getUserMetrics(startDate, endDate);
      rows.push(['User Metrics', '', '', '']);
      rows.push(['Metric', 'Value', '', '']);
      rows.push(['Total Users', String(data.totalUsers), '', '']);
      rows.push(['New Registrations', String(data.newRegistrations), '', '']);
      rows.push(['Active Users', String(data.activeUsers), '', '']);
      rows.push(['Suspended Users', String(data.suspendedUsers), '', '']);
      rows.push(['Churned Users', String(data.churnedUsers), '', '']);
      rows.push(['Onboarding Completion Rate', `${data.onboardingCompletionRate}%`, '', '']);
      rows.push(['', '', '', '']);
      rows.push(['Registration Trend', '', '', '']);
      rows.push(['Date', 'Count', '', '']);
      data.registrationTrend.forEach((d) => rows.push([d.date, String(d.count), '', '']));
      rows.push(['', '', '', '']);
    }

    if (metric === 'projects' || metric === 'all') {
      const data = await this.getProjectMetrics(startDate, endDate);
      rows.push(['Project Metrics', '', '', '']);
      rows.push(['Metric', 'Value', '', '']);
      rows.push(['Total Projects', String(data.totalProjects), '', '']);
      rows.push(['Active Projects', String(data.activeProjects), '', '']);
      rows.push(['Avg Stories/Project', String(data.averageStoriesPerProject), '', '']);
      rows.push(['', '', '', '']);
      rows.push(['Top Projects by Activity', '', '', '']);
      rows.push(['Name', 'Workspace', 'Stories', '']);
      data.topProjectsByActivity.forEach((p) =>
        rows.push([p.name, p.workspaceName, String(p.storyCount), '']),
      );
      rows.push(['', '', '', '']);
    }

    if (metric === 'agents' || metric === 'all') {
      const data = await this.getAgentMetrics(startDate, endDate);
      rows.push(['Agent Metrics', '', '', '']);
      rows.push(['Metric', 'Value', '', '']);
      rows.push(['Total Tasks', String(data.totalTasks), '', '']);
      rows.push(['Completed Tasks', String(data.completedTasks), '', '']);
      rows.push(['Failed Tasks', String(data.failedTasks), '', '']);
      rows.push(['Success Rate', `${data.successRate}%`, '', '']);
      rows.push(['', '', '', '']);
      rows.push(['Tasks by Agent Type', '', '', '']);
      rows.push(['Type', 'Total', 'Completed', 'Failed']);
      data.tasksByAgentType.forEach((t) =>
        rows.push([t.type, String(t.total), String(t.completed), String(t.failed)]),
      );
      rows.push(['', '', '', '']);
    }

    if (metric === 'ai-usage' || metric === 'all') {
      const data = await this.getAiUsageMetrics(startDate, endDate);
      rows.push(['AI Usage Metrics', '', '', '']);
      rows.push(['Metric', 'Value', '', '']);
      rows.push(['Total API Calls', String(data.totalApiCalls), '', '']);
      rows.push(['Total Cost (USD)', `$${data.totalCostUsd}`, '', '']);
      rows.push(['Total Input Tokens', String(data.totalInputTokens), '', '']);
      rows.push(['Total Output Tokens', String(data.totalOutputTokens), '', '']);
      rows.push(['', '', '', '']);
      rows.push(['Cost by Provider', '', '', '']);
      rows.push(['Provider', 'Cost', 'Requests', '']);
      data.costByProvider.forEach((p) =>
        rows.push([p.provider, String(p.cost), String(p.requests), '']),
      );
      rows.push(['', '', '', '']);
    }

    return rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
  }
}
