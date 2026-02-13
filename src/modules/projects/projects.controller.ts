import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { CreateProjectPreferencesDto } from './dto/create-project-preferences.dto';
import { UpdateProjectPreferencesDto } from './dto/update-project-preferences.dto';
import {
  UpdateAiConfigDto,
  AiConfigResponseDto,
  AVAILABLE_PROVIDERS,
} from './dto/update-ai-config.dto';

@Controller('api/v1/workspaces/:workspaceId/projects')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth()
@ApiTags('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Get all available AI providers and models
   *
   * Returns a list of supported providers and their models.
   * This is a reference/static data endpoint.
   *
   * IMPORTANT: This static route MUST be declared before any :projectId
   * parameterized routes to prevent NestJS from matching "available-models"
   * as a projectId parameter.
   */
  @Get('available-models/list')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get available AI providers and models' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'List of available AI providers and models',
  })
  async getAvailableModels() {
    return { providers: AVAILABLE_PROVIDERS };
  }

  /**
   * Create a new project within a workspace
   *
   * @param workspaceId - UUID of the workspace to create the project in
   * @param createDto - Project creation data (name, description, etc.)
   * @param preferencesDto - Optional project preferences (code style, git workflow, etc.)
   * @param req - Request object containing authenticated user
   * @returns The created project with preferences
   * @throws ConflictException if project name already exists in workspace
   * @throws ForbiddenException if user doesn't have Developer+ role
   */
  @Post()
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Create a new project in workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 201,
    type: ProjectResponseDto,
    description: 'Project created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Developer role or higher',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - project name already exists',
  })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() createDto: CreateProjectDto,
    @Body('preferences') preferencesDto: CreateProjectPreferencesDto,
    @Req() req: any,
  ) {
    return this.projectsService.create(
      req.user.id,
      workspaceId,
      createDto,
      preferencesDto,
    );
  }

  /**
   * Get all active projects in a workspace
   *
   * @param workspaceId - UUID of the workspace
   * @returns Array of projects in the workspace (filtered to ACTIVE status only)
   * @throws ForbiddenException if user is not a member of the workspace
   */
  @Get()
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get all projects in workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    type: [ProjectResponseDto],
    description: 'List of projects',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async findAll(@Param('workspaceId') workspaceId: string) {
    const projects = await this.projectsService.findAllByWorkspace(workspaceId);

    // Add activeAgentCount field (placeholder until agent system is implemented)
    return projects.map(project => ({
      ...project,
      activeAgentCount: 0, // TODO: Integrate with agent system in Epic 5
      createdBy: {
        id: project.createdBy.id,
        name: project.createdBy.email.split('@')[0], // Temporary: use email prefix as name
        email: project.createdBy.email,
        avatarUrl: undefined, // TODO: Add avatar support in user profile
      },
    }));
  }

  /**
   * Get a single project by ID with workspace isolation
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @returns Project details with preferences and creator information
   * @throws NotFoundException if project doesn't exist or doesn't belong to workspace
   * @throws ForbiddenException if user is not a member of the workspace
   */
  @Get(':projectId')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get a single project by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    type: ProjectResponseDto,
    description: 'Project details',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    const project = await this.projectsService.findOne(projectId, workspaceId);

    // Add activeAgentCount field (placeholder until agent system is implemented)
    return {
      ...project,
      activeAgentCount: 0, // TODO: Integrate with agent system in Epic 5
      createdBy: {
        id: project.createdBy.id,
        name: project.createdBy.email.split('@')[0], // Temporary: use email prefix as name
        email: project.createdBy.email,
        avatarUrl: undefined, // TODO: Add avatar support in user profile
      },
    };
  }

  /**
   * Update project metadata
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project to update
   * @param updateDto - Updated project data (name, description, etc.)
   * @returns Updated project
   * @throws NotFoundException if project doesn't exist
   * @throws ConflictException if new name conflicts with existing project
   * @throws ForbiddenException if user doesn't have Developer+ role
   */
  @Patch(':projectId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    type: ProjectResponseDto,
    description: 'Project updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Developer role or higher',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - project name already exists',
  })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() updateDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(projectId, workspaceId, updateDto);
  }

  /**
   * Soft delete a project (sets deleted_at timestamp)
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project to delete
   * @returns void (204 No Content)
   * @throws NotFoundException if project doesn't exist
   * @throws ForbiddenException if user doesn't have Developer+ role
   */
  @Delete(':projectId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a project (soft delete)' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 204, description: 'Project deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Developer role or higher',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.softDelete(projectId, workspaceId);
  }

  /**
   * Get project preferences
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @returns Project preferences (code style, git workflow, testing strategy, etc.)
   * @throws NotFoundException if project doesn't exist
   * @throws ForbiddenException if user is not a workspace member
   */
  @Get(':projectId/preferences')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get project preferences' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project preferences',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getPreferences(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    const project = await this.projectsService.findOne(projectId, workspaceId);
    return project.preferences;
  }

  /**
   * Update project preferences
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @param preferencesDto - Updated preferences (repository structure, code style, etc.)
   * @returns Updated preferences
   * @throws NotFoundException if project or preferences don't exist
   * @throws ForbiddenException if user doesn't have Developer+ role
   */
  @Patch(':projectId/preferences')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update project preferences' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Developer role or higher',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updatePreferences(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() preferencesDto: UpdateProjectPreferencesDto,
  ) {
    return this.projectsService.updatePreferences(
      projectId,
      workspaceId,
      preferencesDto,
    );
  }

  /**
   * Get AI configuration for a project
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @returns Current AI provider and model configuration
   */
  @Get(':projectId/ai-config')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get AI configuration for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'AI configuration',
    type: AiConfigResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getAiConfig(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.getAiConfig(projectId, workspaceId);
  }

  /**
   * Update AI configuration for a project
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @param dto - AI configuration update (provider + model)
   * @returns Updated AI configuration
   * @throws BadRequestException if model is invalid for provider
   */
  @Put(':projectId/ai-config')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update AI configuration for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'AI configuration updated successfully',
    type: AiConfigResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid model for provider',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Developer role or higher',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updateAiConfig(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateAiConfigDto,
    @Req() req: any,
  ) {
    return this.projectsService.updateAiConfig(projectId, workspaceId, dto, req.user.id);
  }

}
