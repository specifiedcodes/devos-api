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
} from '@nestjs/common';
import { Response } from 'express';
import { UsageService } from '../services/usage.service';
import { CsvExportService } from '../services/csv-export.service';
import { RecordUsageDto } from '../dto/record-usage.dto';
import { UsageQueryDto } from '../dto/usage-query.dto';
import { ExportUsageDto } from '../dto/export-usage.dto';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

/**
 * Controller for real-time cost tracking and usage aggregation
 * Provides endpoints for recording usage and querying aggregations
 */
@Controller('api/v1/workspaces/:workspaceId/usage')
@UseGuards(WorkspaceAccessGuard)
export class UsageV2Controller {
  constructor(
    private readonly usageService: UsageService,
    private readonly csvExportService: CsvExportService,
  ) {}

  /**
   * Record API usage transaction
   * POST /api/v1/workspaces/:workspaceId/usage
   *
   * @param workspaceId - Workspace ID from route
   * @param dto - Usage data
   * @returns Created usage record with calculated cost
   */
  @Post()
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

    if (daysToQuery < 1 || daysToQuery > 365) {
      throw new Error('Days must be between 1 and 365');
    }

    return this.usageService.getDailyUsage(workspaceId, daysToQuery);
  }

  /**
   * Export usage data as CSV
   * GET /api/v1/workspaces/:workspaceId/usage/export?startDate=2024-01-01&endDate=2024-01-31
   *
   * @param workspaceId - Workspace ID
   * @param query - Export query parameters with date range
   * @param res - Express response object for streaming
   * @returns CSV file stream
   */
  @Get('export')
  @Header('Content-Type', 'text/csv')
  async exportUsageData(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ExportUsageDto,
    @Res() res: Response,
  ) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    // Set filename with date range
    const filename = `usage-export-${query.startDate}-to-${query.endDate}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Get estimated row count for logging
    const estimatedRows = await this.csvExportService.getEstimatedRowCount(
      workspaceId,
      startDate,
      endDate,
    );

    if (estimatedRows === 0) {
      // Return empty CSV with headers
      res.send('Timestamp,Provider,Model,Project,Input Tokens,Output Tokens,Cost (USD),Agent ID\n');
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
