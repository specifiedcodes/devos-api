import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
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
import { VercelService } from './vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  CreateVercelProjectDto,
  TriggerVercelDeploymentDto,
  SetVercelEnvironmentVariablesDto,
  VercelDeploymentListQueryDto,
  VercelProjectResponseDto,
  VercelDeploymentResponseDto,
  VercelDeploymentListResponseDto,
  SetVercelVariablesResponseDto,
} from './dto/vercel.dto';
import { DeprecationInterceptor } from './deprecation.interceptor';

/**
 * @deprecated Vercel deployment integration is deprecated. Use Railway instead. See Epic 28.
 * Scheduled for removal after sunset period (90 days from 2026-03-01).
 *
 * VercelController
 * Story 6.6: Vercel Deployment Integration (Alternative)
 *
 * Handles Vercel project creation, deployment triggering, status polling,
 * and environment variable management for project-linked Vercel deployments.
 *
 * DEPRECATED: All endpoints return `Deprecation: true` and `Sunset` headers.
 * TODO(epic-28-cleanup): Remove after sunset period
 */
@ApiTags('Deployments')
@ApiBearerAuth('JWT-auth')
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/vercel',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
@UseInterceptors(new DeprecationInterceptor('vercel'))
export class VercelController {
  private readonly logger = new Logger(VercelController.name);

  constructor(
    private readonly vercelService: VercelService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Shared helper to load project and get Vercel token.
   * DRY across all Vercel endpoints.
   */
  private async getVercelContext(
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

    // Get decrypted Vercel token
    let token: string;
    try {
      token = await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        IntegrationProvider.VERCEL,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'Vercel integration not connected for this workspace',
        );
      }
      throw error;
    }

    return { token, project };
  }

  /**
   * Create a Vercel project
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/vercel/projects
   */
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  async createProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateVercelProjectDto,
    @Req() req: any,
  ): Promise<VercelProjectResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating Vercel project "${dto.name}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getVercelContext(
      workspaceId,
      projectId,
    );

    // Build gitRepository object if linkGitHubRepo and project has githubRepoUrl
    let gitRepository: { type: string; repo: string } | undefined;
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
          gitRepository = { type: 'github', repo: `${owner}/${repo}` };
        }
      } catch (linkError) {
        this.logger.warn(
          `Failed to parse GitHub repo URL for Vercel project: ${(linkError as Error).message}`,
        );
      }
    }

    const result = await this.vercelService.createProject(token, {
      name: dto.name,
      framework: dto.framework,
      buildCommand: dto.buildCommand,
      outputDirectory: dto.outputDirectory,
      installCommand: dto.installCommand,
      gitRepository,
    });

    // Store Vercel project ID in project entity (critical - must not fail silently)
    project.vercelProjectId = result.id;
    await this.projectRepository.save(project);

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        result.id,
        {
          action: 'integration.vercel.project_created',
          vercelProjectName: dto.name,
          vercelProjectId: result.id,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Vercel project creation: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'vercel_project_created',
        title: `Vercel Project Created: ${dto.name}`,
        message: `Vercel project "${dto.name}" created and linked to project`,
        metadata: {
          vercelProjectId: result.id,
          vercelProjectUrl: result.projectUrl,
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Vercel project creation: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * Trigger a deployment
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/vercel/deployments
   */
  @Post('deployments')
  @HttpCode(HttpStatus.CREATED)
  async triggerDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: TriggerVercelDeploymentDto,
    @Req() req: any,
  ): Promise<VercelDeploymentResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Triggering Vercel deployment for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getVercelContext(
      workspaceId,
      projectId,
    );

    if (!project.vercelProjectId) {
      throw new BadRequestException(
        'No Vercel project linked to this project',
      );
    }

    const result = await this.vercelService.triggerDeployment(token, {
      projectId: project.vercelProjectId,
      name: project.name,
      target: dto.target || 'production',
      ref: dto.ref || 'main',
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
          action: 'integration.vercel.deployment_triggered',
          vercelProjectId: project.vercelProjectId,
          target: dto.target || 'production',
          ref: dto.ref || 'main',
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Vercel deployment trigger: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'deployment_triggered',
        title: `Deployment Triggered: ${project.name}`,
        message: `Vercel deployment triggered for ${project.name} on ${dto.ref || 'main'}`,
        metadata: {
          deploymentId: result.id,
          vercelProjectId: project.vercelProjectId,
          target: dto.target || 'production',
          ref: dto.ref || 'main',
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Vercel deployment trigger: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * List deployments
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/vercel/deployments
   * NOTE: Must be declared BEFORE the :deploymentId route to prevent NestJS route shadowing
   */
  @Get('deployments')
  async listDeployments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: VercelDeploymentListQueryDto,
  ): Promise<VercelDeploymentListResponseDto> {
    this.logger.log(
      `Listing Vercel deployments for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getVercelContext(
      workspaceId,
      projectId,
    );

    if (!project.vercelProjectId) {
      throw new BadRequestException(
        'No Vercel project linked to this project',
      );
    }

    const perPage = query.perPage || 10;

    return this.vercelService.listDeployments(
      token,
      project.vercelProjectId,
      {
        target: query.target,
        state: query.state,
        limit: perPage,
      },
    );
  }

  /**
   * Get deployment status
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/vercel/deployments/:deploymentId
   */
  @Get('deployments/:deploymentId')
  async getDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('deploymentId') deploymentId: string,
  ): Promise<VercelDeploymentResponseDto> {
    // Validate deploymentId format (Vercel IDs are alphanumeric with underscores/hyphens, max 100 chars)
    if (!deploymentId || deploymentId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(deploymentId)) {
      throw new BadRequestException('Invalid deployment ID format');
    }

    this.logger.log(
      `Getting Vercel deployment ${deploymentId} for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getVercelContext(workspaceId, projectId);

    const result = await this.vercelService.getDeployment(
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
   * PUT /api/v1/workspaces/:workspaceId/projects/:projectId/vercel/environments/variables
   */
  @Put('environments/variables')
  async setEnvironmentVariables(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SetVercelEnvironmentVariablesDto,
    @Req() req: any,
  ): Promise<SetVercelVariablesResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Setting Vercel env vars for project ${projectId.substring(0, 8)}...`,
    );

    // Validate variable keys
    const variableNameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
    for (const variable of dto.variables) {
      if (!variableNameRegex.test(variable.key)) {
        throw new BadRequestException(
          `Invalid variable name: "${variable.key}". Must match ^[A-Za-z_][A-Za-z0-9_]*$`,
        );
      }
    }

    const { token, project } = await this.getVercelContext(
      workspaceId,
      projectId,
    );

    if (!project.vercelProjectId) {
      throw new BadRequestException(
        'No Vercel project linked to this project',
      );
    }

    await this.vercelService.upsertEnvironmentVariables(
      token,
      project.vercelProjectId,
      dto.variables.map((v) => ({
        key: v.key,
        value: v.value,
        target: v.target,
        type: v.type,
      })),
    );

    // Log audit event with variable NAMES only (never values for security)
    const variableNames = dto.variables.map((v) => v.key);
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        project.vercelProjectId,
        {
          action: 'integration.vercel.env_vars_updated',
          vercelProjectId: project.vercelProjectId,
          variableNames,
          variableCount: variableNames.length,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Vercel env vars update: ${(auditError as Error).message}`,
      );
    }

    return {
      success: true,
      variableCount: dto.variables.length,
      projectId: project.vercelProjectId,
    };
  }
}
