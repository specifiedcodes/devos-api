import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SharedLinksService } from '../services/shared-links.service';
import { CreateSharedLinkDto } from '../dto/create-shared-link.dto';
import { SharedLinkResponseDto } from '../dto/shared-link-response.dto';
import { plainToInstance } from 'class-transformer';

@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/shared-links')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth()
@ApiTags('shared-links')
export class SharedLinksController {
  constructor(private readonly sharedLinksService: SharedLinksService) {}

  /**
   * Create a new shareable link for a project
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @param createDto - Link creation options (expiration, password)
   * @param req - Request object containing authenticated user
   * @returns The created shared link with token and URL
   * @throws NotFoundException if project does not exist or belong to workspace
   * @throws ForbiddenException if user doesn't have Owner/Admin role
   */
  @Post()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create a shareable link for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 201,
    type: SharedLinkResponseDto,
    description: 'Shared link created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Owner/Admin role',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found or does not belong to workspace',
  })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() createDto: CreateSharedLinkDto,
    @Req() req: any,
  ): Promise<SharedLinkResponseDto> {
    const sharedLink = await this.sharedLinksService.create(
      projectId,
      workspaceId,
      req.user.id,
      createDto,
    );

    return this.toResponseDto(sharedLink);
  }

  /**
   * Get all active shared links for a project
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @returns Array of active shared links (excludes revoked links)
   * @throws ForbiddenException if user is not a member of the workspace
   */
  @Get()
  @RequireRole(
    WorkspaceRole.VIEWER,
    WorkspaceRole.DEVELOPER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.OWNER,
  )
  @ApiOperation({ summary: 'Get all shared links for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 200,
    type: [SharedLinkResponseDto],
    description: 'List of shared links',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ): Promise<SharedLinkResponseDto[]> {
    const links = await this.sharedLinksService.findAllByProject(
      projectId,
      workspaceId,
    );

    return links.map((link) => this.toResponseDto(link));
  }

  /**
   * Get details of a specific shared link
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @param linkId - UUID of the shared link
   * @returns The shared link details including full token
   * @throws NotFoundException if shared link does not exist
   * @throws ForbiddenException if user doesn't have Owner/Admin role
   */
  @Get(':linkId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Get a specific shared link by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiParam({ name: 'linkId', description: 'Shared Link UUID' })
  @ApiResponse({
    status: 200,
    type: SharedLinkResponseDto,
    description: 'Shared link details',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Owner/Admin role',
  })
  @ApiResponse({ status: 404, description: 'Shared link not found' })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('linkId') linkId: string,
  ): Promise<SharedLinkResponseDto> {
    const link = await this.sharedLinksService.findById(linkId, workspaceId);
    return this.toResponseDto(link);
  }

  /**
   * Revoke (deactivate) a shared link
   *
   * @param workspaceId - UUID of the workspace
   * @param projectId - UUID of the project
   * @param linkId - UUID of the shared link to revoke
   * @returns No content on success
   * @throws NotFoundException if shared link does not exist
   * @throws ForbiddenException if user doesn't have Owner/Admin role
   */
  @Delete(':linkId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a shared link' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiParam({ name: 'linkId', description: 'Shared Link UUID to revoke' })
  @ApiResponse({
    status: 204,
    description: 'Shared link revoked successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires Owner/Admin role',
  })
  @ApiResponse({ status: 404, description: 'Shared link not found' })
  async revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('linkId') linkId: string,
  ): Promise<void> {
    await this.sharedLinksService.revoke(linkId, workspaceId);
  }

  /**
   * Transform SharedLink entity to SharedLinkResponseDto
   * Adds full URL and hasPassword flag, removes password hash
   */
  private toResponseDto(sharedLink: any): SharedLinkResponseDto {
    const frontendUrl = process.env.FRONTEND_URL || 'https://devos.com';
    const url = `${frontendUrl}/share/${sharedLink.token}`;

    const dto = plainToInstance(
      SharedLinkResponseDto,
      {
        ...sharedLink,
        url,
        hasPassword: !!sharedLink.passwordHash,
        expiresAt: sharedLink.expiresAt || null,
        lastViewedAt: sharedLink.lastViewedAt || null,
      },
      { excludeExtraneousValues: true },
    );

    return dto;
  }
}
