import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
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
import { StoriesService } from './stories.service';
import {
  CreateStoryDto,
  UpdateStoryDto,
  UpdateStoryStatusDto,
  AssignStoryDto,
  StoryListQueryDto,
  StoryResponseDto,
  StoryListResponseDto,
} from './dto/story.dto';

@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/stories')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('Stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  /**
   * List stories for a project with optional filters
   */
  @Get()
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'List stories for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of stories',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async listStories(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: StoryListQueryDto,
  ): Promise<StoryListResponseDto> {
    return this.storiesService.listStories(workspaceId, projectId, query);
  }

  /**
   * Get a single story by ID
   */
  @Get(':storyId')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get a single story' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Story details',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async getStory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
  ): Promise<StoryResponseDto> {
    return this.storiesService.getStory(workspaceId, projectId, storyId);
  }

  /**
   * Create a new story
   */
  @Post()
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Create a new story' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 201,
    description: 'Story created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires Developer role or higher' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async createStory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() createDto: CreateStoryDto,
  ): Promise<StoryResponseDto> {
    return this.storiesService.createStory(workspaceId, projectId, createDto);
  }

  /**
   * Update a story's fields
   */
  @Patch(':storyId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update a story' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async updateStory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
    @Body() updateDto: UpdateStoryDto,
  ): Promise<StoryResponseDto> {
    return this.storiesService.updateStory(workspaceId, projectId, storyId, updateDto);
  }

  /**
   * Update a story's status
   */
  @Patch(':storyId/status')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update story status' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async updateStoryStatus(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
    @Body() statusDto: UpdateStoryStatusDto,
  ): Promise<StoryResponseDto> {
    return this.storiesService.updateStoryStatus(workspaceId, projectId, storyId, statusDto);
  }

  /**
   * Assign or unassign an agent to a story
   */
  @Patch(':storyId/assign')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Assign agent to story' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story assignment updated' })
  @ApiResponse({ status: 400, description: 'Invalid agent ID' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async assignStory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
    @Body() assignDto: AssignStoryDto,
  ): Promise<StoryResponseDto> {
    return this.storiesService.assignStory(workspaceId, projectId, storyId, assignDto);
  }

  /**
   * Delete a story
   */
  @Delete(':storyId')
  @RequireRole(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete a story' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'storyId', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires Admin or Owner role' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async deleteStory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('storyId', ParseUUIDPipe) storyId: string,
  ): Promise<{ message: string }> {
    await this.storiesService.deleteStory(workspaceId, projectId, storyId);
    return { message: 'Story deleted successfully' };
  }
}
