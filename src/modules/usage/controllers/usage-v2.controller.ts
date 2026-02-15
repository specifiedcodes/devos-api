import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Header,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { UsageService } from '../services/usage.service';
import { CsvExportService } from '../services/csv-export.service';
import { RecordUsageDto } from '../dto/record-usage.dto';
import { UsageQueryDto } from '../dto/usage-query.dto';
import { ExportUsageDto } from '../dto/export-usage.dto';
import { CostBreakdownQueryDto, CostGroupBy } from '../dto/cost-breakdown-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService } from '../../../shared/audit/audit.service';

/**
 * Controller for real-time cost tracking and usage aggregation
 * Provides endpoints for recording usage and querying aggregations
 */
@Controller('api/v1/workspaces/:workspaceId/usage')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class UsageV2Controller {
  constructor(
    private readonly usageService: UsageService,
    private readonly csvExportService: CsvExportService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Record API usage transaction
   * POST /api/v1/workspaces/:workspaceId/usage
   *
   * SECURITY: Rate limited to prevent abuse
   * Limit: 100 requests per minute (high limit for agent usage tracking)
   *
   * @param workspaceId - Workspace ID from route
   * @param dto - Usage data
   * @returns Created usage record with calculated cost
   */
  @Post()
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @HttpCode(HttpStatus.CREATED)
  async recordUsage(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RecordUsageDto,
  ) {
    const usage = await this.usageService.recordUsage(
      workspaceId,
      dto.projectId || null,
      dto.provider,
      dto.model,
      dto.inputTokens,
      dto.outputTokens,
      dto.byokKeyId,
      dto.agentId,
      dto.cachedTokens,
      dto.taskType,
      dto.routingReason,
    );

    return {
      id: usage.id,
      costUsd: usage.costUsd,
      createdAt: usage.createdAt,
    };
  }

  /**
   * Get usage summary for workspace
   * GET /api/v1/workspaces/:workspaceId/usage/summary
   *
   * @param workspaceId - Workspace ID
   * @param query - Date range query params
   * @returns Aggregated usage summary
   */
  @Get('summary')
  async getWorkspaceUsageSummary(
    @Param('workspaceId') workspaceId: string,
    @Query() query: UsageQueryDto,
  ) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getDefaultStartDate();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getDefaultEndDate();

    return this.usageService.getWorkspaceUsageSummary(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Get usage breakdown by project
   * GET /api/v1/workspaces/:workspaceId/usage/by-project
   *
   * @param workspaceId - Workspace ID
   * @param query - Date range query params
   * @returns Project usage breakdown
   */
  @Get('by-project')
  async getProjectUsageBreakdown(
    @Param('workspaceId') workspaceId: string,
    @Query() query: UsageQueryDto,
  ) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getDefaultStartDate();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getDefaultEndDate();

    return this.usageService.getProjectUsageBreakdown(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Get usage breakdown by model
   * GET /api/v1/workspaces/:workspaceId/usage/by-model
   *
   * @param workspaceId - Workspace ID
   * @param query - Date range query params
   * @returns Model usage breakdown
   */
  @Get('by-model')
  async getModelUsageBreakdown(
    @Param('workspaceId') workspaceId: string,
    @Query() query: UsageQueryDto,
  ) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getDefaultStartDate();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getDefaultEndDate();

    return this.usageService.getModelUsageBreakdown(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Get daily usage breakdown for charting
   * GET /api/v1/workspaces/:workspaceId/usage/daily?days=30
   *
   * @param workspaceId - Workspace ID
   * @param days - Number of days to query (1-365, default: 30)
   * @returns Array of daily usage with date and cost
   */
  @Get('daily')
  async getDailyUsage(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: number,
  ) {
    const daysToQuery = days ? parseInt(days.toString(), 10) : 30;

    if (isNaN(daysToQuery) || daysToQuery < 1 || daysToQuery > 365) {
      throw new BadRequestException('Days must be between 1 and 365');
    }

    return this.usageService.getDailyUsage(workspaceId, daysToQuery);
  }

  /**
   * Get cost breakdown with dynamic groupBy dimension
   * GET /api/v1/workspaces/:workspaceId/usage/breakdown?groupBy=model&startDate=...&endDate=...
   *
   * @param workspaceId - Workspace ID
   * @param query - CostBreakdownQueryDto with groupBy, startDate, endDate
   * @returns CostBreakdownResponse with breakdown array and totals
   */
  @Get('breakdown')
  async getCostBreakdown(
    @Param('workspaceId') workspaceId: string,
    @Query() query: CostBreakdownQueryDto,
  ) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getDefaultStartDate();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getDefaultEndDate();
    const groupBy = query.groupBy || CostGroupBy.MODEL;

    return this.usageService.getCostBreakdown(
      workspaceId,
      startDate,
      endDate,
      groupBy,
    );
  }

  /**
   * Get provider-level cost breakdown with nested model detail
   * GET /api/v1/workspaces/:workspaceId/usage/by-provider?startDate=...&endDate=...
   *
   * @param workspaceId - Workspace ID
   * @param query - Date range query params
   * @returns Array of ProviderBreakdownItem with nested models
   */
  @Get('by-provider')
  async getProviderBreakdown(
    @Param('workspaceId') workspaceId: string,
    @Query() query: UsageQueryDto,
  ) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getDefaultStartDate();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getDefaultEndDate();

    return this.usageService.getProviderBreakdown(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Export usage data as CSV
   * GET /api/v1/workspaces/:workspaceId/usage/export?startDate=2024-01-01&endDate=2024-01-31
   *
   * SECURITY: Rate limited to prevent DoS attacks via streaming queries
   * Limit: 10 exports per minute per workspace
   *
   * @param workspaceId - Workspace ID
   * @param query - Export query parameters with date range
   * @param req - Express request object for user context
   * @param res - Express response object for streaming
   * @returns CSV file stream
   */
  @Get('export')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Header('Content-Type', 'text/csv')
  async exportUsageData(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ExportUsageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    // Format filename to match AC specification: devos-usage-{workspace}-{date}.csv
    const dateFormat = `${query.startDate}-to-${query.endDate}`;
    const filename = `devos-usage-${workspaceId.substring(0, 8)}-${dateFormat}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Get estimated row count for logging
    const estimatedRows = await this.csvExportService.getEstimatedRowCount(
      workspaceId,
      startDate,
      endDate,
    );

    // Log export action to audit trail
    await this.auditService.log(
      workspaceId,
      (req as any).user?.id || 'system',
      'usage_export' as any,
      'usage',
      workspaceId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        estimatedRows,
      },
    );

    if (estimatedRows === 0) {
      // Return empty CSV with headers matching AC spec
      res.send('Date,Project,Agent,Model,Input Tokens,Output Tokens,Cost (USD)\n');
      return;
    }

    // Generate and stream CSV
    const csvStream = await this.csvExportService.generateCsvStream(
      workspaceId,
      startDate,
      endDate,
    );

    // Pipe CSV stream to response
    csvStream.pipe(res);
  }

  /**
   * Get default start date (beginning of current month)
   */
  private getDefaultStartDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Get default end date (end of current month)
   */
  private getDefaultEndDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}
