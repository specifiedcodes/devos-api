/**
 * TemplateAnalyticsService
 *
 * Story 19-9: Template Analytics
 *
 * Handles analytics event tracking for templates, aggregation queries,
 * creator analytics dashboards, and data export functionality.
 *
 * Follows fire-and-forget pattern from AnalyticsEventsService for event tracking.
 * Uses Redis caching with 5-minute TTL for aggregated views.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import {
  TemplateAnalyticsEvent,
  TemplateAnalyticsEventType,
} from '../../../database/entities/template-analytics-event.entity';
import { Template } from '../../../database/entities/template.entity';
import {
  TemplateAnalyticsSummary,
  CreatorAnalyticsResponse,
  TemplatePerformanceSummary,
  DailyTrendPoint,
} from '../dto/template-analytics.dto';

interface TrackEventParams {
  templateId: string;
  workspaceId: string;
  userId: string | null;
  eventType: TemplateAnalyticsEventType;
  referrer?: string | null;
  metadata?: Record<string, any>;
}

// Cache TTL: 5 minutes in seconds
const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_PREFIX = 'template-analytics';

@Injectable()
export class TemplateAnalyticsService {
  private readonly logger = new Logger(TemplateAnalyticsService.name);

  constructor(
    @InjectRepository(TemplateAnalyticsEvent)
    private readonly eventRepo: Repository<TemplateAnalyticsEvent>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Track an analytics event with fire-and-forget pattern.
   * Errors are logged but never thrown to avoid blocking main operations.
   */
  async trackEvent(params: TrackEventParams): Promise<string | null> {
    try {
      const event = this.eventRepo.create({
        templateId: params.templateId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        eventType: params.eventType,
        referrer: params.referrer || null,
        metadata: params.metadata || {},
      });

      const saved = await this.eventRepo.save(event);
      this.logger.debug(
        `Analytics event tracked: ${params.eventType} for template ${params.templateId}`,
      );
      return saved.id;
    } catch (error) {
      this.logger.error(
        `Failed to track analytics event: ${params.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Get analytics summary for a single template (AC3).
   */
  async getTemplateAnalytics(templateId: string): Promise<TemplateAnalyticsSummary> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:template:${templateId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TemplateAnalyticsSummary;
    }

    // Fetch total counts
    const totalsQB = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id = :templateId', { templateId })
      .select(`
        SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)
      `, 'totalViews')
      .addSelect(`
        SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)
      `, 'totalInstallations')
      .addSelect(`
        SUM(CASE WHEN e.event_type = 'install_started' THEN 1 ELSE 0 END)
      `, 'installStarted')
      .addSelect(`
        SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)
      `, 'installCompleted')
      .addSelect(`
        SUM(CASE WHEN e.event_type = 'install_failed' THEN 1 ELSE 0 END)
      `, 'installFailed');

    const totals = await totalsQB.getRawOne();

    const totalViews = parseInt(totals?.totalViews || '0', 10);
    const totalInstallations = parseInt(totals?.totalInstallations || '0', 10);
    const installStarted = parseInt(totals?.installStarted || '0', 10);
    const installCompleted = parseInt(totals?.installCompleted || '0', 10);

    // Fetch all period-specific counts in a single query to avoid N+1 pattern
    const now = new Date();
    const date7d = new Date(now);
    date7d.setDate(date7d.getDate() - 7);
    const date30d = new Date(now);
    date30d.setDate(date30d.getDate() - 30);
    const date90d = new Date(now);
    date90d.setDate(date90d.getDate() - 90);

    const periodQB = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id = :templateId', { templateId })
      .andWhere('e.created_at >= :date90d', { date90d })
      .select(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') AND e.created_at >= :date7d THEN 1 ELSE 0 END)`, 'views7d')
      .addSelect(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') AND e.created_at >= :date30d THEN 1 ELSE 0 END)`, 'views30d')
      .addSelect(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)`, 'views90d')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' AND e.created_at >= :date7d THEN 1 ELSE 0 END)`, 'installations7d')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' AND e.created_at >= :date30d THEN 1 ELSE 0 END)`, 'installations30d')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)`, 'installations90d')
      .setParameters({ date7d, date30d });

    const periodCounts = await periodQB.getRawOne();
    const views7d = parseInt(periodCounts?.views7d || '0', 10);
    const views30d = parseInt(periodCounts?.views30d || '0', 10);
    const views90d = parseInt(periodCounts?.views90d || '0', 10);
    const installations7d = parseInt(periodCounts?.installations7d || '0', 10);
    const installations30d = parseInt(periodCounts?.installations30d || '0', 10);
    const installations90d = parseInt(periodCounts?.installations90d || '0', 10);

    // Get rating from template
    const template = await this.templateRepo.findOne({ where: { id: templateId } });
    const avgRating = template ? Number(template.avgRating) : 0;
    const ratingCount = template ? template.ratingCount : 0;

    // Conversion rate: views -> installations
    const conversionRate = totalViews > 0
      ? Math.round((totalInstallations / totalViews) * 100 * 100) / 100
      : 0;

    // Installation success rate
    const totalInstallAttempts = installStarted;
    const installSuccessRate = totalInstallAttempts > 0
      ? Math.round((installCompleted / totalInstallAttempts) * 100 * 100) / 100
      : 100;

    // Top referrers
    const referrersQB = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id = :templateId', { templateId })
      .andWhere('e.referrer IS NOT NULL')
      .select('e.referrer', 'referrer')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.referrer')
      .orderBy('count', 'DESC')
      .limit(10);

    const referrerRows = await referrersQB.getRawMany();
    const topReferrers = referrerRows.map((r: { referrer: string; count: string }) => ({
      referrer: r.referrer,
      count: parseInt(r.count, 10),
    }));

    const summary: TemplateAnalyticsSummary = {
      totalViews,
      totalInstallations,
      views7d,
      views30d,
      views90d,
      installations7d,
      installations30d,
      installations90d,
      avgRating,
      ratingCount,
      conversionRate,
      topReferrers,
      installSuccessRate,
    };

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(summary), CACHE_TTL_SECONDS);

    return summary;
  }

  /**
   * Get aggregated analytics for all templates owned by a creator (AC4).
   */
  async getCreatorAnalytics(
    userId: string,
    period: string = '30d',
  ): Promise<CreatorAnalyticsResponse> {
    const days = this.parsePeriodDays(period);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get user's templates
    const templates = await this.templateRepo.find({
      where: { createdBy: userId },
    });

    if (templates.length === 0) {
      return {
        topTemplates: [],
        viewsTrend: [],
        installationsTrend: [],
        totalReach: 0,
        totalViews: 0,
        totalInstallations: 0,
      };
    }

    const templateIds = templates.map((t) => t.id);

    // Get per-template performance
    const perfQB = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id IN (:...templateIds)', { templateIds })
      .andWhere('e.created_at >= :since', { since })
      .select('e.template_id', 'templateId')
      .addSelect(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)`, 'totalViews')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)`, 'totalInstallations')
      .groupBy('e.template_id')
      .orderBy('"totalInstallations"', 'DESC');

    const perfRows = await perfQB.getRawMany();

    const templateMap = new Map(templates.map((t) => [t.id, t]));
    const topTemplates: TemplatePerformanceSummary[] = perfRows.map(
      (row: { templateId: string; totalViews: string; totalInstallations: string }) => {
        const t = templateMap.get(row.templateId);
        const views = parseInt(row.totalViews || '0', 10);
        const installs = parseInt(row.totalInstallations || '0', 10);
        return {
          templateId: row.templateId,
          templateName: t?.name || '',
          displayName: t?.displayName || '',
          totalViews: views,
          totalInstallations: installs,
          conversionRate: views > 0 ? Math.round((installs / views) * 100 * 100) / 100 : 0,
        };
      },
    );

    // Build daily trend data
    const viewsTrend = await this.getDailyTrend(templateIds, ['view', 'detail_view'], days);
    const installationsTrend = await this.getDailyTrend(templateIds, ['install_completed'], days);

    // Total reach (unique users)
    const reachQB = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id IN (:...templateIds)', { templateIds })
      .andWhere('e.created_at >= :since', { since })
      .andWhere('e.user_id IS NOT NULL')
      .select('COUNT(DISTINCT e.user_id)', 'uniqueUsers');

    const reachResult = await reachQB.getRawOne();
    const totalReach = parseInt(reachResult?.uniqueUsers || '0', 10);

    // Aggregate totals
    const totalViews = topTemplates.reduce((sum, t) => sum + t.totalViews, 0);
    const totalInstallations = topTemplates.reduce((sum, t) => sum + t.totalInstallations, 0);

    return {
      topTemplates,
      viewsTrend,
      installationsTrend,
      totalReach,
      totalViews,
      totalInstallations,
    };
  }

  /**
   * Get events for CSV export (AC6).
   */
  async getExportData(
    templateId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TemplateAnalyticsEvent[]> {
    // Validate date range (max 365 days)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
      throw new BadRequestException('Date range must not exceed 365 days');
    }

    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }

    // Cap export to 50,000 rows to prevent memory exhaustion on popular templates
    const MAX_EXPORT_ROWS = 50000;

    return this.eventRepo.find({
      where: {
        templateId,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
      take: MAX_EXPORT_ROWS,
    });
  }

  /**
   * Check and enforce export rate limit: 1 export per hour per template (AC6).
   * Uses Redis to track the last export timestamp.
   */
  async checkExportRateLimit(templateId: string): Promise<void> {
    const rateLimitKey = `${CACHE_PREFIX}:export-rate:${templateId}`;
    const lastExport = await this.redisService.get(rateLimitKey);
    if (lastExport) {
      throw new HttpException(
        'Rate limit exceeded. Only 1 export per hour per template is allowed.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Set rate limit key with 1-hour TTL
    await this.redisService.set(rateLimitKey, new Date().toISOString(), 3600);
  }

  /**
   * Parse period string to number of days.
   */
  private parsePeriodDays(period: string): number {
    const match = period.match(/^(\d+)d$/);
    if (match) {
      const days = parseInt(match[1], 10);
      if (days > 0 && days <= 365) return days;
    }
    return 30; // default
  }

  /**
   * Count events for a template in a given number of days.
   */
  private async getEventCount(
    templateId: string,
    eventTypes: string[],
    days: number,
  ): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const qb = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id = :templateId', { templateId })
      .andWhere('e.event_type IN (:...eventTypes)', { eventTypes })
      .andWhere('e.created_at >= :since', { since });

    return qb.getCount();
  }

  /**
   * Build daily trend data for multiple templates over a period.
   */
  private async getDailyTrend(
    templateIds: string[],
    eventTypes: string[],
    days: number,
  ): Promise<DailyTrendPoint[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const qb = this.eventRepo.createQueryBuilder('e')
      .where('e.template_id IN (:...templateIds)', { templateIds })
      .andWhere('e.event_type IN (:...eventTypes)', { eventTypes })
      .andWhere('e.created_at >= :since', { since })
      .select(`DATE(e.created_at)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`DATE(e.created_at)`)
      .orderBy('date', 'ASC');

    const rows = await qb.getRawMany();
    const rowMap = new Map(rows.map((r: { date: string; count: string }) => [r.date, parseInt(r.count, 10)]));

    // Fill in all days
    const trend: DailyTrendPoint[] = [];
    const current = new Date(since);
    const today = new Date();

    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      trend.push({
        date: dateStr,
        count: rowMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return trend;
  }
}
