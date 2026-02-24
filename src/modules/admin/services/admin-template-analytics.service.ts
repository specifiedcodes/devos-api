/**
 * AdminTemplateAnalyticsService
 *
 * Story 19-9: Template Analytics
 *
 * Provides marketplace-wide analytics for platform administrators.
 * Includes top templates, category performance, trending, and featured template metrics.
 */
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import {
  TemplateAnalyticsEvent,
  TemplateAnalyticsEventType,
} from '../../../database/entities/template-analytics-event.entity';
import { Template } from '../../../database/entities/template.entity';
import {
  AdminTemplateAnalyticsResponse,
  TemplatePerformanceSummary,
  CategoryPerformance,
  TrendingTemplate,
} from '../../templates/dto/template-analytics.dto';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_PREFIX = 'admin-template-analytics';

@Injectable()
export class AdminTemplateAnalyticsService {
  private readonly logger = new Logger(AdminTemplateAnalyticsService.name);

  constructor(
    @InjectRepository(TemplateAnalyticsEvent)
    private readonly eventRepo: Repository<TemplateAnalyticsEvent>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get marketplace-wide analytics (AC5).
   */
  async getMarketplaceAnalytics(
    period: string = '30d',
    limit: number = 10,
  ): Promise<AdminTemplateAnalyticsResponse> {
    const cacheKey = `${CACHE_PREFIX}:marketplace:${period}:${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as AdminTemplateAnalyticsResponse;
    }

    const days = this.parsePeriodDays(period);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get total template counts
    const totalTemplates = await this.templateRepo.count();
    const totalPublishedTemplates = await this.templateRepo.count({
      where: { isPublished: true },
    });

    // Top templates by views
    const topByViews = await this.getTopTemplates(since, 'view', limit);

    // Top templates by installations
    const topByInstallations = await this.getTopTemplates(since, 'install_completed', limit);

    // Total marketplace views and installations
    const totalsQB = this.eventRepo.createQueryBuilder('e')
      .where('e.created_at >= :since', { since })
      .select(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)`, 'totalViews')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)`, 'totalInstallations');

    const totals = await totalsQB.getRawOne();
    const totalMarketplaceViews = parseInt(totals?.totalViews || '0', 10);
    const totalMarketplaceInstallations = parseInt(totals?.totalInstallations || '0', 10);

    // Average conversion rate
    const averageConversionRate = totalMarketplaceViews > 0
      ? Math.round((totalMarketplaceInstallations / totalMarketplaceViews) * 100 * 100) / 100
      : 0;

    // Category breakdown
    const categoryBreakdown = await this.getCategoryBreakdown(since);

    // Trending templates (highest growth in recent period vs previous period)
    const trending = await this.getTrendingTemplates(days, limit);

    // Featured template performance
    const featuredPerformance = await this.getFeaturedPerformance(since);

    const result: AdminTemplateAnalyticsResponse = {
      topByViews,
      topByInstallations,
      totalMarketplaceViews,
      totalMarketplaceInstallations,
      totalTemplates,
      totalPublishedTemplates,
      averageConversionRate,
      categoryBreakdown,
      trending,
      featuredPerformance,
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);

    return result;
  }

  /**
   * Get top templates by a specific event type.
   */
  private async getTopTemplates(
    since: Date,
    eventType: string,
    limit: number,
  ): Promise<TemplatePerformanceSummary[]> {
    const viewTypes = eventType === 'view' ? ['view', 'detail_view'] : [eventType];

    const qb = this.eventRepo.createQueryBuilder('e')
      .leftJoin('e.template', 't')
      .where('e.created_at >= :since', { since })
      .andWhere('e.event_type IN (:...viewTypes)', { viewTypes })
      .select('e.template_id', 'templateId')
      .addSelect('t.name', 'templateName')
      .addSelect('t.display_name', 'displayName')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.template_id')
      .addGroupBy('t.name')
      .addGroupBy('t.display_name')
      .orderBy('count', 'DESC')
      .limit(limit);

    const rows = await qb.getRawMany();

    return rows.map((row: { templateId: string; templateName: string; displayName: string; count: string }) => ({
      templateId: row.templateId,
      templateName: row.templateName || '',
      displayName: row.displayName || '',
      totalViews: eventType === 'view' ? parseInt(row.count || '0', 10) : 0,
      totalInstallations: eventType === 'install_completed' ? parseInt(row.count || '0', 10) : 0,
      conversionRate: 0, // Would require a second query to calculate
    }));
  }

  /**
   * Get category performance breakdown.
   */
  private async getCategoryBreakdown(since: Date): Promise<CategoryPerformance[]> {
    const qb = this.eventRepo.createQueryBuilder('e')
      .leftJoin('e.template', 't')
      .where('e.created_at >= :since', { since })
      .select('t.category', 'category')
      .addSelect(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)`, 'totalViews')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)`, 'totalInstallations')
      .addSelect('COUNT(DISTINCT e.template_id)', 'templateCount')
      .groupBy('t.category')
      .orderBy('"totalViews"', 'DESC');

    const rows = await qb.getRawMany();

    return rows.map((row: { category: string; totalViews: string; totalInstallations: string; templateCount: string }) => ({
      category: row.category || 'unknown',
      totalViews: parseInt(row.totalViews || '0', 10),
      totalInstallations: parseInt(row.totalInstallations || '0', 10),
      templateCount: parseInt(row.templateCount || '0', 10),
    }));
  }

  /**
   * Get trending templates (highest growth comparing current period vs previous).
   */
  private async getTrendingTemplates(
    days: number,
    limit: number,
  ): Promise<TrendingTemplate[]> {
    const now = new Date();
    const currentStart = new Date();
    currentStart.setDate(now.getDate() - days);
    const previousStart = new Date();
    previousStart.setDate(now.getDate() - days * 2);

    // Get installations in both current and previous periods in a single query
    const trendQB = this.eventRepo.createQueryBuilder('e')
      .leftJoin('e.template', 't')
      .where('e.event_type = :eventType', { eventType: TemplateAnalyticsEventType.INSTALL_COMPLETED })
      .andWhere('e.created_at >= :previousStart', { previousStart })
      .select('e.template_id', 'templateId')
      .addSelect('t.name', 'templateName')
      .addSelect('t.display_name', 'displayName')
      .addSelect(`SUM(CASE WHEN e.created_at >= :currentStart THEN 1 ELSE 0 END)`, 'recentInstallations')
      .addSelect(`SUM(CASE WHEN e.created_at < :currentStart THEN 1 ELSE 0 END)`, 'previousInstallations')
      .setParameter('currentStart', currentStart)
      .groupBy('e.template_id')
      .addGroupBy('t.name')
      .addGroupBy('t.display_name')
      .orderBy('"recentInstallations"', 'DESC')
      .limit(limit);

    const rows = await trendQB.getRawMany();

    return rows.map((row: { templateId: string; templateName: string; displayName: string; recentInstallations: string; previousInstallations: string }) => {
      const recent = parseInt(row.recentInstallations || '0', 10);
      const previous = parseInt(row.previousInstallations || '0', 10);
      const growthPercentage = previous > 0
        ? Math.round(((recent - previous) / previous) * 100)
        : recent > 0 ? 100 : 0;

      return {
        templateId: row.templateId,
        templateName: row.templateName || '',
        displayName: row.displayName || '',
        growthPercentage,
        recentInstallations: recent,
      };
    });
  }

  /**
   * Get performance of featured templates.
   */
  private async getFeaturedPerformance(since: Date): Promise<TemplatePerformanceSummary[]> {
    const qb = this.eventRepo.createQueryBuilder('e')
      .innerJoin('e.template', 't', 't.is_featured = true')
      .where('e.created_at >= :since', { since })
      .select('e.template_id', 'templateId')
      .addSelect('t.name', 'templateName')
      .addSelect('t.display_name', 'displayName')
      .addSelect(`SUM(CASE WHEN e.event_type IN ('view', 'detail_view') THEN 1 ELSE 0 END)`, 'totalViews')
      .addSelect(`SUM(CASE WHEN e.event_type = 'install_completed' THEN 1 ELSE 0 END)`, 'totalInstallations')
      .groupBy('e.template_id')
      .addGroupBy('t.name')
      .addGroupBy('t.display_name')
      .orderBy('"totalInstallations"', 'DESC');

    const rows = await qb.getRawMany();

    return rows.map((row: { templateId: string; templateName: string; displayName: string; totalViews: string; totalInstallations: string }) => {
      const views = parseInt(row.totalViews || '0', 10);
      const installs = parseInt(row.totalInstallations || '0', 10);
      return {
        templateId: row.templateId,
        templateName: row.templateName || '',
        displayName: row.displayName || '',
        totalViews: views,
        totalInstallations: installs,
        conversionRate: views > 0 ? Math.round((installs / views) * 100 * 100) / 100 : 0,
      };
    });
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
    return 30;
  }
}
