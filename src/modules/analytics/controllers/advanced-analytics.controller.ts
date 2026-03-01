import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Res,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { AgentPerformanceService } from '../services/agent-performance.service';
import { CostAnalyticsService } from '../services/cost-analytics.service';
import { CumulativeFlowService } from '../services/cumulative-flow.service';
import { ScheduledReportsService } from '../services/scheduled-reports.service';
import { ExportService } from '../services/export.service';
import {
  AgentPerformanceQueryDto,
  AgentPerformanceResponseDto,
} from '../dto/agent-performance.dto';
import {
  CostAnalyticsQueryDto,
  CostAnalyticsResponseDto,
} from '../dto/cost-analytics.dto';
import {
  CumulativeFlowQueryDto,
  CumulativeFlowResponseDto,
} from '../dto/cumulative-flow.dto';
import {
  CreateScheduledReportDto,
  UpdateScheduledReportDto,
  ScheduledReportResponseDto,
} from '../dto/scheduled-report.dto';
import { ExportQueryDto, ExportType } from '../dto/export.dto';

@ApiTags('Advanced Analytics')
@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
export class AdvancedAnalyticsController {
  constructor(
    private readonly agentPerformanceService: AgentPerformanceService,
    private readonly costAnalyticsService: CostAnalyticsService,
    private readonly cumulativeFlowService: CumulativeFlowService,
    private readonly scheduledReportsService: ScheduledReportsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('projects/:projectId/analytics/agent-performance')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get agent performance metrics' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiQuery({ name: 'agent_id', required: false, description: 'Filter by agent ID' })
  @ApiResponse({ status: 200, description: 'Agent performance data' })
  async getAgentPerformance(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: AgentPerformanceQueryDto,
  ): Promise<AgentPerformanceResponseDto> {
    return this.agentPerformanceService.getAgentPerformance(workspaceId, projectId, query);
  }

  @Get('projects/:projectId/analytics/cost')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get cost analytics' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiResponse({ status: 200, description: 'Cost analytics data' })
  async getCostAnalytics(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: CostAnalyticsQueryDto,
  ): Promise<CostAnalyticsResponseDto> {
    return this.costAnalyticsService.getCostAnalytics(workspaceId, projectId, query);
  }

  @Get('projects/:projectId/analytics/cumulative-flow')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get cumulative flow diagram data' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiQuery({ name: 'sprint_id', required: false, description: 'Filter by sprint ID' })
  @ApiResponse({ status: 200, description: 'Cumulative flow data' })
  async getCumulativeFlow(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: CumulativeFlowQueryDto,
  ): Promise<CumulativeFlowResponseDto> {
    return this.cumulativeFlowService.getCumulativeFlowData(workspaceId, projectId, query);
  }

  @Get('projects/:projectId/analytics/export/:type')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Export analytics data' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'type', description: 'Export type', enum: ['velocity', 'burndown', 'agent-performance', 'cost', 'cumulative-flow'] })
  @ApiQuery({ name: 'format', required: true, enum: ['csv', 'pdf'] })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiQuery({ name: 'filters', required: false, description: 'Filters as JSON string' })
  @ApiResponse({ status: 200, description: 'Exported file' })
  async exportAnalytics(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('type') type: ExportType,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    let filters: Record<string, any> | undefined;
    if (query.filters) {
      try {
        filters = JSON.parse(query.filters);
      } catch {
        filters = undefined;
      }
    }

    const result = await this.exportService.exportData(
      workspaceId,
      projectId,
      type,
      query.format,
      query.date_from,
      query.date_to,
      filters,
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }

  @Get('scheduled-reports')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get all scheduled reports for workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'List of scheduled reports', type: [ScheduledReportResponseDto] })
  async getScheduledReports(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<ScheduledReportResponseDto[]> {
    return this.scheduledReportsService.findAll(workspaceId);
  }

  @Post('scheduled-reports')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Create a scheduled report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({ status: 201, description: 'Scheduled report created', type: ScheduledReportResponseDto })
  async createScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateScheduledReportDto,
    @Query('userId') userId: string,
  ): Promise<ScheduledReportResponseDto> {
    return this.scheduledReportsService.create(workspaceId, userId, dto);
  }

  @Get('scheduled-reports/:id')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get a scheduled report by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'id', description: 'Scheduled report ID' })
  @ApiResponse({ status: 200, description: 'Scheduled report', type: ScheduledReportResponseDto })
  @ApiResponse({ status: 404, description: 'Scheduled report not found' })
  async getScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScheduledReportResponseDto> {
    return this.scheduledReportsService.findOne(workspaceId, id);
  }

  @Put('scheduled-reports/:id')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update a scheduled report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'id', description: 'Scheduled report ID' })
  @ApiResponse({ status: 200, description: 'Scheduled report updated', type: ScheduledReportResponseDto })
  @ApiResponse({ status: 404, description: 'Scheduled report not found' })
  async updateScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReportResponseDto> {
    return this.scheduledReportsService.update(workspaceId, id, dto);
  }

  @Delete('scheduled-reports/:id')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete a scheduled report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'id', description: 'Scheduled report ID' })
  @ApiResponse({ status: 204, description: 'Scheduled report deleted' })
  @ApiResponse({ status: 404, description: 'Scheduled report not found' })
  async deleteScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.scheduledReportsService.remove(workspaceId, id);
  }

  @Put('scheduled-reports/:id')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update a scheduled report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'id', description: 'Scheduled report ID' })
  @ApiResponse({ status: 200, description: 'Scheduled report updated', type: ScheduledReportResponseDto })
  @ApiResponse({ status: 404, description: 'Scheduled report not found' })
  async updateScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReportResponseDto> {
    return this.scheduledReportsService.update(workspaceId, id, dto);
  }

  @Delete('scheduled-reports/:id')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete a scheduled report' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'id', description: 'Scheduled report ID' })
  @ApiResponse({ status: 204, description: 'Scheduled report deleted' })
  @ApiResponse({ status: 404, description: 'Scheduled report not found' })
  async deleteScheduledReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.scheduledReportsService.remove(workspaceId, id);
  }
}
