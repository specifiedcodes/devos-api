import {
  Controller,
  Get,
  Post,
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

@Controller('api/v1/workspaces/:workspaceId/projects')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth()
@ApiTags('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
    return this.projectsService.findAllByWorkspace(workspaceId);
  }

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
    return this.projectsService.findOne(projectId, workspaceId);
  }

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
}
