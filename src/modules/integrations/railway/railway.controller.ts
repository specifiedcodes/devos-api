import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
  ProvisionServiceDto,
  BulkDeployDto,
  RailwayServiceEntityDto,
  ServiceConnectionInfoDto,
  BulkDeploymentResponseDto,
  SetServiceVariablesDto,
  AddDomainDto,
  DomainResponseDto,
  GetLogsQueryDto,
  DeploymentHistoryQueryDto,
  DeploymentHistoryResponseDto,
  ServiceLogsResponseDto,
  HealthCheckResponseDto,
} from './dto/railway.dto';
import { RailwayServiceType } from '../../../database/entities/railway-service.entity';

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

  // ============================================================
  // Story 24-1: Railway Database & Resource Provisioning Endpoints
  // ============================================================

  /**
   * Provision a database or cache service on Railway
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/provision
   */
  @Post('services/provision')
  @HttpCode(HttpStatus.CREATED)
  async provisionService(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ProvisionServiceDto,
    @Req() req: any,
  ): Promise<RailwayServiceEntityDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Provisioning ${dto.serviceType} service "${dto.name}" for project ${projectId.substring(0, 8)}...`,
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

    return this.railwayService.provisionDatabase(token, {
      workspaceId,
      projectId,
      railwayProjectId: project.railwayProjectId,
      userId,
      name: dto.name,
      serviceType: dto.serviceType,
      databaseType: dto.databaseType || this.inferDatabaseType(dto.serviceType),
    });
  }

  /**
   * Get connection info for a Railway service (masked)
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/connection
   */
  @Get('services/:serviceId/connection')
  async getServiceConnection(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Req() req: any,
  ): Promise<ServiceConnectionInfoDto> {
    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.getServiceConnectionInfo(token, serviceEntity);
  }

  /**
   * List all Railway services for a project
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services
   *
   * NOTE: Must be declared AFTER the :serviceId routes to prevent NestJS route shadowing
   */
  @Get('services')
  async listServices(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RailwayServiceEntityDto[]> {
    // Validate project exists (reuses helper, but we only need the project check)
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    return this.railwayService.listServices(projectId, workspaceId);
  }

  // ============================================================
  // Story 24-2: Railway Service Deployment via CLI Endpoints
  // ============================================================

  /**
   * Bulk deploy all services in dependency order
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/deploy
   */
  @Post('deploy')
  @HttpCode(HttpStatus.ACCEPTED)
  async bulkDeploy(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: BulkDeployDto,
    @Req() req: any,
  ): Promise<BulkDeploymentResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Bulk deploying all services for project ${projectId.substring(0, 8)}...`,
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

    return this.railwayService.deployAllServices(token, {
      projectId,
      workspaceId,
      userId,
      environment: dto.environment,
    });
  }

  /**
   * Deploy a single service
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/deploy
   */
  @Post('services/:serviceId/deploy')
  @HttpCode(HttpStatus.CREATED)
  async deploySingleService(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: BulkDeployDto,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.userId;

    this.logger.log(
      `Deploying service ${serviceId.substring(0, 8)}... for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.deployService(token, serviceEntity, {
      workspaceId,
      userId,
      environment: dto.environment,
    });
  }

  /**
   * Redeploy a service
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/redeploy
   */
  @Post('services/:serviceId/redeploy')
  @HttpCode(HttpStatus.OK)
  async redeployServiceEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.userId;

    this.logger.log(
      `Redeploying service ${serviceId.substring(0, 8)}... for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.redeployService(token, serviceEntity, {
      workspaceId,
      userId,
    });
  }

  /**
   * Restart a service without rebuild
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/restart
   */
  @Post('services/:serviceId/restart')
  @HttpCode(HttpStatus.OK)
  async restartServiceEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.userId;

    this.logger.log(
      `Restarting service ${serviceId.substring(0, 8)}... for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.restartService(token, serviceEntity, {
      workspaceId,
      userId,
    });
  }

  // ============================================================
  // Story 24-3: Railway Environment Variable Management Endpoints
  // ============================================================

  /**
   * List environment variables for a service (names only, masked)
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/variables
   */
  @Get('services/:serviceId/variables')
  async listServiceVariables(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Req() req: any,
  ): Promise<Array<{ name: string; masked: boolean; present: boolean }>> {
    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.listServiceVariables(token, serviceEntity);
  }

  /**
   * Set environment variables on a service
   * PUT /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/variables
   */
  @Put('services/:serviceId/variables')
  async setServiceVariablesEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: SetServiceVariablesDto,
    @Req() req: any,
  ): Promise<{ success: boolean; variableCount: number }> {
    const userId = req.user.userId;

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    await this.railwayService.setServiceVariables(
      token,
      serviceEntity,
      dto.variables,
      {
        workspaceId,
        userId,
      },
    );

    return {
      success: true,
      variableCount: Object.keys(dto.variables).length,
    };
  }

  /**
   * Delete an environment variable from a service
   * DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/variables/:variableName
   */
  @Delete('services/:serviceId/variables/:variableName')
  async deleteServiceVariableEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('variableName') variableName: string,
    @Req() req: any,
  ): Promise<{ success: boolean; variableName: string }> {
    const userId = req.user.userId;

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    await this.railwayService.deleteServiceVariable(
      token,
      serviceEntity,
      variableName,
      {
        workspaceId,
        userId,
      },
    );

    return {
      success: true,
      variableName,
    };
  }

  // ============================================================
  // Story 24-4: Railway Domain Management Endpoints
  // ============================================================

  /**
   * Add a domain to a Railway service (custom or generate Railway domain)
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/domains
   */
  @Post('services/:serviceId/domains')
  @HttpCode(HttpStatus.CREATED)
  async addDomain(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: AddDomainDto,
    @Req() req: any,
  ): Promise<DomainResponseDto> {
    const userId = req.user.userId;

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.addDomain(token, serviceEntity, {
      workspaceId,
      userId,
      customDomain: dto.customDomain,
    });
  }

  /**
   * Get all domains for a Railway service
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/domains
   */
  @Get('services/:serviceId/domains')
  async getDomains(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<DomainResponseDto[]> {
    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.getDomains(token, serviceEntity);
  }

  /**
   * Remove a domain from a Railway service
   * DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/domains/:domain
   */
  @Delete('services/:serviceId/domains/:domain')
  async removeDomain(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('domain') domain: string,
    @Req() req: any,
  ): Promise<{ success: boolean }> {
    const userId = req.user.userId;

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    await this.railwayService.removeDomain(token, serviceEntity, {
      workspaceId,
      userId,
      domain,
    });

    return { success: true };
  }

  // ============================================================
  // Story 24-5: Log Streaming & Deployment History Endpoints
  // ============================================================

  /**
   * Get recent logs for a Railway service
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/logs
   */
  @Get('services/:serviceId/logs')
  async getServiceLogs(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Query() query: GetLogsQueryDto,
  ): Promise<ServiceLogsResponseDto> {
    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    const logs = await this.railwayService.streamLogs(token, serviceEntity, {
      buildLogs: query.buildLogs,
      lines: query.lines,
    });

    return {
      logs,
      serviceId: serviceEntity.id,
      serviceName: serviceEntity.name,
    };
  }

  /**
   * List deployment history for a Railway service
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/deployments
   */
  @Get('services/:serviceId/deployments')
  async getServiceDeployments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Query() query: DeploymentHistoryQueryDto,
  ): Promise<DeploymentHistoryResponseDto> {
    // Verify project exists
    await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    const result = await this.railwayService.getDeploymentHistory(
      serviceEntity.id,
      {
        page: query.page,
        limit: query.limit,
        status: query.status,
      },
    );

    return {
      deployments: result.deployments.map((d) => ({
        id: d.id,
        railwayDeploymentId: d.railwayDeploymentId,
        status: d.status,
        deploymentUrl: d.deploymentUrl,
        commitSha: d.commitSha,
        branch: d.branch,
        triggeredBy: d.triggeredBy,
        triggerType: d.triggerType,
        buildDurationSeconds: d.buildDurationSeconds,
        deployDurationSeconds: d.deployDurationSeconds,
        errorMessage: d.errorMessage,
        startedAt: d.startedAt instanceof Date ? d.startedAt.toISOString() : d.startedAt,
        completedAt: d.completedAt instanceof Date ? d.completedAt.toISOString() : d.completedAt,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Get details of a specific deployment
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/deployments/:deploymentId
   */
  @Get('services/:serviceId/deployments/:deploymentId')
  async getDeploymentDetails(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('deploymentId', ParseUUIDPipe) deploymentId: string,
  ): Promise<any> {
    await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    const deployment = await this.railwayService.getDeploymentById(
      deploymentId,
      workspaceId,
    );

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    return deployment;
  }

  /**
   * Rollback a service to a specific deployment
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/railway/services/:serviceId/deployments/:deploymentId/rollback
   */
  @Post('services/:serviceId/deployments/:deploymentId/rollback')
  @HttpCode(HttpStatus.CREATED)
  async rollbackDeploymentEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('deploymentId', ParseUUIDPipe) deploymentId: string,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.userId;

    const { token } = await this.getRailwayContext(workspaceId, projectId);

    const serviceEntity = await this.railwayService.findServiceEntity(
      serviceId,
      workspaceId,
    );

    if (!serviceEntity) {
      throw new NotFoundException('Railway service not found');
    }

    return this.railwayService.rollbackDeployment(
      token,
      serviceEntity,
      deploymentId,
      {
        workspaceId,
        userId,
      },
    );
  }

  /**
   * Check Railway connection health
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/railway/health
   */
  @Get('health')
  async checkHealthEndpoint(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<HealthCheckResponseDto> {
    const { token } = await this.getRailwayContext(workspaceId, projectId);

    return this.railwayService.checkHealth(token);
  }

  // ---- Private Helpers ----

  /**
   * Infer a default database type from service type if not explicitly provided.
   */
  private inferDatabaseType(serviceType: RailwayServiceType): string {
    switch (serviceType) {
      case RailwayServiceType.DATABASE:
        return 'postgres';
      case RailwayServiceType.CACHE:
        return 'redis';
      default:
        return 'postgres';
    }
  }
}
