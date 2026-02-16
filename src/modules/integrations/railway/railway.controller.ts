import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { RailwayService } from './railway.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  CreateRailwayProjectDto,
  TriggerDeploymentDto,
  SetEnvironmentVariablesDto,
  DeploymentListQueryDto,
  RailwayProjectResponseDto,
  DeploymentResponseDto,
  DeploymentListResponseDto,
  SetVariablesResponseDto,
} from './dto/railway.dto';

/**
 * RailwayController
 * Story 6.5: Railway Deployment Integration
 *
 * Handles Railway project creation, deployment triggering, status polling,
 * and environment variable management for project-linked Railway deployments.
 */
@ApiTags('Deployments')
@ApiBearerAuth('JWT-auth')
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/railway',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class RailwayController {
  private readonly logger = new Logger(RailwayController.name);

  constructor(
    private readonly railwayService: RailwayService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Shared helper to load project and get Railway token.
   * DRY across all Railway endpoints.
   */
  private async getRailwayContext(
    workspaceId: string,
    projectId: string,
  ): Promise<{ token: string; project: Project }> {
    // Load project by id and workspaceId
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    // Get decrypted Railway token
    let token: string;
    try {
      token = await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        IntegrationProvider.RAILWAY,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'Railway integration not connected for this workspace',
        );
      }
      throw error;
    }

    return { token, project };
  }

  /**
   * Create a Railway project
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/projects
   */
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  async createProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateRailwayProjectDto,
    @Req() req: any,
  ): Promise<RailwayProjectResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating Railway project "${dto.name}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getRailwayContext(
      workspaceId,
      projectId,
    );

    const result = await this.railwayService.createProject(token, {
      name: dto.name,
      description: dto.description,
    });

    // Link GitHub repo if requested and available
    if (
      (dto.linkGitHubRepo === undefined || dto.linkGitHubRepo) &&
      project.githubRepoUrl
    ) {
      try {
        const urlParts = project.githubRepoUrl
          .replace(/^https?:\/\/(www\.)?github\.com\//, '')
          .replace(/\.git$/, '')
          .replace(/\/+$/, '')
          .split('/')
          .filter((part) => part.length > 0);
        const owner = urlParts[0];
        const repo = urlParts[1];

        if (owner && repo) {
          await this.railwayService.linkGitHubRepoToProject(
            token,
            result.id,
            `${owner}/${repo}`,
          );
        }
      } catch (linkError) {
        this.logger.warn(
          `Failed to link GitHub repo to Railway project: ${(linkError as Error).message}`,
        );
      }
    }

    // Store Railway project ID in project entity
    try {
      project.railwayProjectId = result.id;
      await this.projectRepository.save(project);
    } catch (saveError) {
      this.logger.error(
        `Failed to save Railway project ID to project: ${(saveError as Error).message}`,
      );
    }

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        result.id,
        {
          action: 'integration.railway.project_created',
          railwayProjectName: dto.name,
          railwayProjectId: result.id,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Railway project creation: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'railway_project_created',
        title: `Railway Project Created: ${dto.name}`,
        message: `Railway project "${dto.name}" created and linked to project`,
        metadata: {
          railwayProjectId: result.id,
          railwayProjectUrl: result.projectUrl,
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Railway project creation: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * Trigger a deployment
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/deployments
   */
  @Post('deployments')
  @HttpCode(HttpStatus.CREATED)
  async triggerDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: TriggerDeploymentDto,
    @Req() req: any,
  ): Promise<DeploymentResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Triggering deployment for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getRailwayContext(
      workspaceId,
      projectId,
    );

    if (!project.railwayProjectId) {
      throw new BadRequestException(
        'No Railway project linked to this project',
      );
    }

    const result = await this.railwayService.triggerDeployment(token, {
      projectId: project.railwayProjectId,
      environmentId: dto.environmentId,
      branch: dto.branch || 'main',
    });

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_TRIGGERED,
        'integration',
        result.id,
        {
          action: 'integration.railway.deployment_triggered',
          railwayProjectId: project.railwayProjectId,
          branch: dto.branch || 'main',
          environmentId: dto.environmentId,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for deployment trigger: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'deployment_triggered',
        title: `Deployment Triggered: ${project.name}`,
        message: `Deployment triggered for ${project.name} on branch ${dto.branch || 'main'}`,
        metadata: {
          deploymentId: result.id,
          railwayProjectId: project.railwayProjectId,
          branch: dto.branch || 'main',
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for deployment trigger: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * List deployments
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/deployments
   * NOTE: Must be declared BEFORE the :deploymentId route to prevent NestJS route shadowing
   */
  @Get('deployments')
  async listDeployments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DeploymentListQueryDto,
  ): Promise<DeploymentListResponseDto> {
    this.logger.log(
      `Listing deployments for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getRailwayContext(
      workspaceId,
      projectId,
    );

    if (!project.railwayProjectId) {
      throw new BadRequestException(
        'No Railway project linked to this project',
      );
    }

    const perPage = query.perPage || 10;
    const page = query.page || 1;

    // Railway uses cursor-based pagination; compute offset cursor from page number
    // For page > 1, we use an offset-style cursor string
    const after = page > 1 ? String((page - 1) * perPage) : undefined;

    return this.railwayService.listDeployments(
      token,
      project.railwayProjectId,
      {
        environmentId: query.environmentId,
        first: perPage,
        after,
      },
    );
  }

  /**
   * Get deployment status
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/deployments/:deploymentId
   */
  @Get('deployments/:deploymentId')
  async getDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('deploymentId') deploymentId: string,
  ): Promise<DeploymentResponseDto> {
    this.logger.log(
      `Getting deployment ${deploymentId} for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const result = await this.railwayService.getDeployment(
      token,
      deploymentId,
    );

    if (!result) {
      throw new NotFoundException('Deployment not found');
    }

    return result;
  }

  /**
   * Set environment variables
   * PUT /api/v1/workspaces/:workspaceId/projects/:projectId/railway/environments/:environmentId/variables
   */
  @Put('environments/:environmentId/variables')
  async setEnvironmentVariables(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: SetEnvironmentVariablesDto,
    @Req() req: any,
  ): Promise<SetVariablesResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Setting env vars for project ${projectId.substring(0, 8)}... environment ${environmentId}`,
    );

    // Validate variable names
    const variableNameRegex = /^[A-Z_][A-Z0-9_]*$/;
    const keys = Object.keys(dto.variables);

    if (keys.length > 50) {
      throw new BadRequestException(
        'Maximum 50 environment variables allowed per request',
      );
    }

    for (const key of keys) {
      if (!variableNameRegex.test(key)) {
        throw new BadRequestException(
          `Invalid variable name: "${key}". Must match ^[A-Z_][A-Z0-9_]*$`,
        );
      }
      if (key.length > 256) {
        throw new BadRequestException(
          `Variable name "${key}" exceeds maximum length of 256 characters`,
        );
      }
      if (dto.variables[key] != null && dto.variables[key].length > 10000) {
        throw new BadRequestException(
          `Variable value for "${key}" exceeds maximum length of 10000 characters`,
        );
      }
    }

    const { token, project } = await this.getRailwayContext(
      workspaceId,
      projectId,
    );

    if (!project.railwayProjectId) {
      throw new BadRequestException(
        'No Railway project linked to this project',
      );
    }

    await this.railwayService.upsertEnvironmentVariables(
      token,
      project.railwayProjectId,
      environmentId,
      dto.variables,
    );

    // Log audit event with variable NAMES only (never values for security)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        project.railwayProjectId,
        {
          action: 'integration.railway.env_vars_updated',
          railwayProjectId: project.railwayProjectId,
          environmentId,
          variableNames: keys,
          variableCount: keys.length,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for env vars update: ${(auditError as Error).message}`,
      );
    }

    return {
      success: true,
      variableCount: keys.length,
      environmentId,
    };
  }
}
