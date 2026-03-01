import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { SprintsService } from './sprints.service';
import { SprintMetricsService } from './services/sprint-metrics.service';
import { VelocityMetricsService } from './services/velocity-metrics.service';
import {
  CreateSprintDto,
  UpdateSprintDto,
  StartSprintDto,
  AddStoryToSprintDto,
  SprintResponseDto,
  SprintListResponseDto,
} from './dto/sprint.dto';
import { BurndownQueryDto, BurndownResponseDto } from './dto/burndown.dto';
import { VelocityQueryDto, VelocityResponseDto } from './dto/velocity.dto';
import { SprintMetricsSummaryDto } from './dto/sprint-metrics-summary.dto';

@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/sprints')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('Sprints')
export class SprintsController {
  constructor(
    private readonly sprintsService: SprintsService,
    private readonly sprintMetricsService: SprintMetricsService,
    private readonly velocityMetricsService: VelocityMetricsService,
  ) {}

  /**
   * List all sprints for a project
   */
  @Get()
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'List sprints for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'List of sprints' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async listSprints(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<SprintListResponseDto> {
    return this.sprintsService.listSprints(workspaceId, projectId);
  }

  /**
   * Get a single sprint by ID
   */
  @Get(':sprintId')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get a single sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint details' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  async getSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.getSprint(workspaceId, projectId, sprintId);
  }

  /**
   * Create a new sprint
   */
  @Post()
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Create a new sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Sprint created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async createSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() createDto: CreateSprintDto,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.createSprint(workspaceId, projectId, createDto);
  }

  /**
   * Update a sprint
   */
  @Patch(':sprintId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  async updateSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Body() updateDto: UpdateSprintDto,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.updateSprint(workspaceId, projectId, sprintId, updateDto);
  }

  /**
   * Start a sprint
   */
  @Post(':sprintId/start')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Start a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint started' })
  @ApiResponse({ status: 400, description: 'Cannot start sprint' })
  @ApiResponse({ status: 409, description: 'Another sprint is already active' })
  async startSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Body() startDto: StartSprintDto,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.startSprint(workspaceId, projectId, sprintId, startDto);
  }

  /**
   * Complete a sprint
   */
  @Post(':sprintId/complete')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Complete a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint completed' })
  @ApiResponse({ status: 400, description: 'Cannot complete sprint' })
  async completeSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.completeSprint(workspaceId, projectId, sprintId);
  }

  /**
   * Delete a sprint
   */
  @Delete(':sprintId')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete sprint' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  async deleteSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
  ): Promise<{ message: string }> {
    await this.sprintsService.deleteSprint(workspaceId, projectId, sprintId);
    return { message: 'Sprint deleted successfully' };
  }

  /**
   * Add a story to a sprint
   */
  @Post(':sprintId/stories')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Add a story to a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Story added to sprint' })
  @ApiResponse({ status: 404, description: 'Sprint or story not found' })
  async addStoryToSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Body() dto: AddStoryToSprintDto,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.addStoryToSprint(
      workspaceId,
      projectId,
      sprintId,
      dto.storyId,
    );
  }

  /**
   * Remove a story from a sprint
   */
  @Delete(':sprintId/stories/:storyId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Remove a story from a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story removed from sprint' })
  @ApiResponse({ status: 404, description: 'Sprint or story not found' })
  async removeStoryFromSprint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
  ): Promise<SprintResponseDto> {
    return this.sprintsService.removeStoryFromSprint(
      workspaceId,
      projectId,
      sprintId,
      storyId,
    );
  }

  /**
   * Get burndown chart data for a sprint
   */
  @Get(':sprintId/burndown')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get burndown chart data for a sprint' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiResponse({ status: 200, description: 'Burndown chart data' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  async getBurndownData(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Query() query: BurndownQueryDto,
  ): Promise<BurndownResponseDto> {
    return this.sprintMetricsService.getBurndownData(
      workspaceId,
      projectId,
      sprintId,
      query.date_from,
      query.date_to,
    );
  }

  /**
   * Get sprint metrics summary
   */
  @Get(':sprintId/metrics')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get sprint metrics summary' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID' })
  @ApiResponse({ status: 200, description: 'Sprint metrics summary' })
  @ApiResponse({ status: 404, description: 'Sprint not found' })
  async getSprintMetrics(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
  ): Promise<SprintMetricsSummaryDto> {
    return this.velocityMetricsService.getSprintMetricsSummary(
      workspaceId,
      projectId,
      sprintId,
    );
  }
}
