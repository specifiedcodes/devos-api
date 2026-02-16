import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { ProjectAnalyticsService } from '../services/project-analytics.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

/**
 * ProjectAnalyticsController
 * Story 16.8: Frontend Analytics Data Verification
 *
 * Provides 8 analytics endpoints matching the frontend API client URL patterns:
 * GET /api/v1/workspaces/:workspaceId/projects/:projectId/analytics/{metric}
 */
@ApiTags('Project Analytics')
@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/analytics')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
export class ProjectAnalyticsController {
  constructor(private readonly analyticsService: ProjectAnalyticsService) {}

  @Get('velocity')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get velocity data - story points completed per sprint' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'sprintCount', required: false, type: 'number', description: 'Number of sprints (default: 6)' })
  @ApiResponse({ status: 200, description: 'Velocity data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid sprintCount parameter' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getVelocity(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('sprintCount') sprintCount?: string,
  ) {
    const count = sprintCount ? parseInt(sprintCount, 10) : 6;
    if (isNaN(count) || count < 1 || count > 50) {
      throw new BadRequestException('sprintCount must be between 1 and 50');
    }
    const data = await this.analyticsService.getVelocityData(projectId, count);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('throughput')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get throughput data - stories completed per week' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Throughput data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getThroughput(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getThroughputData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('burndown/:sprintId')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get burndown data for a sprint' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sprintId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Burndown data returned successfully' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getBurndown(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
  ) {
    const data = await this.analyticsService.getBurndownData(projectId, sprintId);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('cycle-time')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get cycle time data - In Progress to Done duration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Cycle time data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getCycleTime(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getCycleTimeData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('lead-time')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get lead time data - Backlog to Done duration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Lead time data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getLeadTime(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getLeadTimeData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('agent-utilization')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get agent utilization data' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Agent utilization data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getAgentUtilization(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getAgentUtilizationData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('cumulative-flow')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get cumulative flow diagram data' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Cumulative flow data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getCumulativeFlow(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getCumulativeFlowData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  @Get('agent-heatmap')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get agent activity heatmap data' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'startDate', required: true, type: 'string', description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: true, type: 'string', description: 'ISO 8601 end date' })
  @ApiResponse({ status: 200, description: 'Agent heatmap data returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getAgentHeatmap(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const data = await this.analyticsService.getAgentHeatmapData(projectId, start, end);
    return { data, generatedAt: new Date().toISOString(), projectId };
  }

  /**
   * Validate date range query parameters
   * - Both dates must be valid ISO 8601
   * - startDate must be before or equal to endDate
   * - Max range is 365 days
   */
  private validateDateRange(startDateStr: string, endDateStr: string): { start: Date; end: Date } {
    if (!startDateStr || !endDateStr) {
      throw new BadRequestException('startDate and endDate query parameters are required');
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime())) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }

    if (isNaN(end.getTime())) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    if (start > end) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const maxRangeMs = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new BadRequestException('Date range must not exceed 365 days');
    }

    return { start, end };
  }
}
