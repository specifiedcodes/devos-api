/**
 * TemplateAnalyticsController
 *
 * Story 19-9: Template Analytics
 *
 * REST API endpoints for template analytics:
 * - GET /api/v1/templates/my/analytics - Creator dashboard analytics
 * - GET /api/v1/templates/:id/analytics - Single template analytics
 * - GET /api/v1/templates/:id/analytics/export - Export analytics data
 */
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateRegistryService } from '../services/template-registry.service';
import {
  TemplateAnalyticsQueryDto,
  AnalyticsExportQueryDto,
  CreatorAnalyticsQueryDto,
  TemplateAnalyticsSummary,
  CreatorAnalyticsResponse,
} from '../dto/template-analytics.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    sub?: string;
    email: string;
    workspaceId?: string;
  };
}

@ApiTags('Template Analytics')
@Controller('api/v1/templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TemplateAnalyticsController {
  constructor(
    private readonly analyticsService: TemplateAnalyticsService,
    private readonly registryService: TemplateRegistryService,
  ) {}

  /**
   * GET /api/v1/templates/my/analytics
   * Get aggregated analytics for all templates owned by the authenticated user (AC4).
   */
  @Get('my/analytics')
  @ApiOperation({
    summary: 'Get creator analytics dashboard',
    description: 'Returns aggregated analytics for all templates owned by the authenticated user.',
  })
  @ApiQuery({ name: 'period', required: false, description: 'Period: 7d, 30d, 90d', example: '30d' })
  @ApiResponse({ status: 200, description: 'Creator analytics returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyAnalytics(
    @Query() query: CreatorAnalyticsQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreatorAnalyticsResponse> {
    const userId = req.user.sub || req.user.id;
    return this.analyticsService.getCreatorAnalytics(userId, query.period);
  }

  /**
   * GET /api/v1/templates/:id/analytics
   * Get analytics summary for a specific template (AC3).
   */
  @Get(':id/analytics')
  @ApiOperation({
    summary: 'Get template analytics summary',
    description: 'Returns views, installations, conversion rate, top referrers, and trend data.',
  })
  @ApiParam({ name: 'id', description: 'Template UUID', format: 'uuid' })
  @ApiQuery({ name: 'period', required: false, description: 'Period: 7d, 30d, 90d', example: '30d' })
  @ApiResponse({ status: 200, description: 'Template analytics returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplateAnalytics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TemplateAnalyticsQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateAnalyticsSummary> {
    // Verify template exists
    const template = await this.registryService.findById(id);
    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return this.analyticsService.getTemplateAnalytics(id);
  }

  /**
   * GET /api/v1/templates/:id/analytics/export
   * Export analytics data for a template as CSV-ready data (AC6).
   * Only template owner or platform admin can export.
   * Rate limited to 1 export per hour per template.
   */
  @Get(':id/analytics/export')
  @ApiOperation({
    summary: 'Export template analytics data',
    description: 'Returns analytics events for CSV export. Requires date range. Only template owner can export. Rate limited to 1 export per hour per template.',
  })
  @ApiParam({ name: 'id', description: 'Template UUID', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Analytics export data returned' })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not authorized to export this template analytics' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded - 1 export per hour per template' })
  async exportAnalytics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AnalyticsExportQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: any[]; templateId: string; exportedAt: string }> {
    // Validate dates
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601.');
    }

    // Verify template exists and user is owner
    const template = await this.registryService.findById(id);
    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    const userId = req.user.sub || req.user.id;
    if (template.createdBy !== userId) {
      throw new ForbiddenException('Only the template owner can export analytics data');
    }

    // Rate limit: 1 export per hour per template (AC6)
    await this.analyticsService.checkExportRateLimit(id);

    const events = await this.analyticsService.getExportData(id, startDate, endDate);

    const data = events.map((e) => ({
      date: e.createdAt.toISOString(),
      eventType: e.eventType,
      referrer: e.referrer || '',
      metadata: JSON.stringify(e.metadata || {}),
    }));

    return {
      data,
      templateId: id,
      exportedAt: new Date().toISOString(),
    };
  }
}
