import {
  Controller,
  Get,
  Query,
  Request,
  Response,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { AnalyticsQueryDto, AnalyticsExportQueryDto } from '../dto/analytics-query.dto';

/**
 * AdminAnalyticsController
 * Story 14.7: Admin Analytics Dashboard (AC3)
 *
 * All endpoints require @PlatformAdmin() decorator.
 * Provides 6 analytics endpoints with audit logging.
 */
@Controller('api/admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly analyticsService: AdminAnalyticsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/admin/analytics/overview
   * Returns combined metrics with previous period comparison
   */
  @Get('overview')
  @PlatformAdmin()
  async getOverview(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const adminId = req.user?.userId || req.user?.id;
    this.logView(adminId,'overview', req);

    const data = await this.analyticsService.getOverviewMetrics(startDate, endDate);
    return {
      data,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  /**
   * GET /api/admin/analytics/users
   * Returns user metrics
   */
  @Get('users')
  @PlatformAdmin()
  async getUserMetrics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const adminId = req.user?.userId || req.user?.id;
    this.logView(adminId,'users', req);

    const data = await this.analyticsService.getUserMetrics(startDate, endDate);
    return {
      data,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  /**
   * GET /api/admin/analytics/projects
   * Returns project metrics
   */
  @Get('projects')
  @PlatformAdmin()
  async getProjectMetrics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const adminId = req.user?.userId || req.user?.id;
    this.logView(adminId,'projects', req);

    const data = await this.analyticsService.getProjectMetrics(startDate, endDate);
    return {
      data,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  /**
   * GET /api/admin/analytics/agents
   * Returns agent metrics
   */
  @Get('agents')
  @PlatformAdmin()
  async getAgentMetrics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const adminId = req.user?.userId || req.user?.id;
    this.logView(adminId,'agents', req);

    const data = await this.analyticsService.getAgentMetrics(startDate, endDate);
    return {
      data,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  /**
   * GET /api/admin/analytics/ai-usage
   * Returns AI usage metrics
   */
  @Get('ai-usage')
  @PlatformAdmin()
  async getAiUsageMetrics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const adminId = req.user?.userId || req.user?.id;
    this.logView(adminId,'ai-usage', req);

    const data = await this.analyticsService.getAiUsageMetrics(startDate, endDate);
    return {
      data,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  /**
   * GET /api/admin/analytics/export
   * Returns CSV file download
   */
  @Get('export')
  @PlatformAdmin()
  async exportMetrics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AnalyticsExportQueryDto,
    @Request() req: any,
    @Response() res: ExpressResponse,
  ) {
    const { startDate, endDate } = query.computeDateRange();
    this.validateDateRange(startDate, endDate);

    const metric = query.metric || 'all';
    const adminId = req.user?.userId || req.user?.id;

    this.auditService.logAdminAction(
      adminId,
      AuditAction.ADMIN_ANALYTICS_EXPORTED,
      'platform',
      { metric, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      req,
    ).catch(() => { /* fire-and-forget: don't block export response */ });

    const csv = await this.analyticsService.exportToCsv(metric, startDate, endDate);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `devos-analytics-${metric}-${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * Validate date range (max 365 days, start before end)
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
    const maxDays = 365;
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxDays) {
      throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
    }
  }

  /**
   * Log analytics view audit action (fire-and-forget to avoid blocking response)
   */
  private logView(adminId: string, section: string, req: any): void {
    this.auditService.logAdminAction(
      adminId,
      AuditAction.ADMIN_ANALYTICS_VIEWED,
      'platform',
      { section },
      req,
    ).catch((err) => {
      // AuditService.log already has try/catch, but guard against unexpected errors
      // to prevent unhandled promise rejections
      void err;
    });
  }
}
