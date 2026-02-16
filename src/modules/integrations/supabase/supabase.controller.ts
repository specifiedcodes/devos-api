import {
  Controller,
  Post,
  Get,
  Body,
  Param,
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
import { SupabaseService } from './supabase.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  CreateSupabaseProjectDto,
  SupabaseProjectResponseDto,
  SupabaseConnectionStringResponseDto,
  SupabaseOrganizationListResponseDto,
  SupabasePauseResumeResponseDto,
} from './dto/supabase.dto';

/**
 * SupabaseController
 * Story 6.7: Supabase Database Provisioning
 *
 * Handles Supabase project creation, database provisioning, status polling,
 * connection string retrieval, and project lifecycle management (pause/resume).
 */
@ApiTags('Deployments')
@ApiBearerAuth('JWT-auth')
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/supabase',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class SupabaseController {
  private readonly logger = new Logger(SupabaseController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Shared helper to load project and get Supabase token.
   * DRY across all Supabase endpoints.
   */
  private async getSupabaseContext(
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

    // Get decrypted Supabase token
    let token: string;
    try {
      token = await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        IntegrationProvider.SUPABASE,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'Supabase integration not connected for this workspace',
        );
      }
      throw error;
    }

    return { token, project };
  }

  /**
   * Create a Supabase project (provision database)
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/projects
   */
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  async createProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateSupabaseProjectDto,
    @Req() req: any,
  ): Promise<SupabaseProjectResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating Supabase project "${dto.name}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getSupabaseContext(
      workspaceId,
      projectId,
    );

    const result = await this.supabaseService.createProject(token, {
      name: dto.name,
      organizationId: dto.organizationId,
      region: dto.region,
      dbPassword: dto.dbPassword,
      plan: dto.plan,
    });

    // Store Supabase project ref in project entity (critical - must not fail silently)
    project.supabaseProjectRef = result.id;
    await this.projectRepository.save(project);

    // Log audit event (non-blocking) - NEVER log dbPassword
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        result.id,
        {
          action: 'integration.supabase.project_created',
          supabaseProjectName: dto.name,
          supabaseProjectRef: result.id,
          region: dto.region || 'us-east-1',
          plan: dto.plan || 'free',
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Supabase project creation: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'supabase_project_created',
        title: `Supabase Database Created: ${dto.name}`,
        message: `Supabase database "${dto.name}" created and linked to project`,
        metadata: {
          supabaseProjectRef: result.id,
          supabaseProjectUrl: result.projectUrl,
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Supabase project creation: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * Get Supabase project status
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/projects/:supabaseProjectRef
   */
  @Get('projects/:supabaseProjectRef')
  async getProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('supabaseProjectRef') supabaseProjectRef: string,
  ): Promise<SupabaseProjectResponseDto> {
    this.validateProjectRef(supabaseProjectRef);

    this.logger.log(
      `Getting Supabase project ${supabaseProjectRef} for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getSupabaseContext(workspaceId, projectId);

    const result = await this.supabaseService.getProject(
      token,
      supabaseProjectRef,
    );

    if (!result) {
      throw new NotFoundException('Supabase project not found');
    }

    return result;
  }

  /**
   * Get database connection string info
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/connection-string
   */
  @Get('connection-string')
  async getConnectionString(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<SupabaseConnectionStringResponseDto> {
    this.logger.log(
      `Getting connection string for project ${projectId.substring(0, 8)}...`,
    );

    const { token, project } = await this.getSupabaseContext(
      workspaceId,
      projectId,
    );

    if (!project.supabaseProjectRef) {
      throw new BadRequestException('No Supabase project linked');
    }

    const supabaseProjectRef = project.supabaseProjectRef;

    // Get project details to determine region for pooler host
    const projectDetails = await this.supabaseService.getProject(
      token,
      supabaseProjectRef,
    );
    const region = projectDetails?.region || 'us-east-1';

    // Get API keys for the project
    const apiKeys = await this.supabaseService.getProjectApiKeys(
      token,
      supabaseProjectRef,
    );

    const anonKey = apiKeys.find((k) => k.name === 'anon')?.apiKey;

    // Build connection info - NEVER return database password
    // Pooler host uses actual project region (not hardcoded)
    return {
      host: `db.${supabaseProjectRef}.supabase.co`,
      port: 5432,
      poolerHost: `aws-0-${region}.pooler.supabase.com`,
      poolerPort: 6543,
      database: 'postgres',
      user: 'postgres',
      supabaseProjectRef,
      supabaseUrl: `https://${supabaseProjectRef}.supabase.co`,
      anonKey,
    };
  }

  /**
   * List Supabase organizations
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/organizations
   */
  @Get('organizations')
  async listOrganizations(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<SupabaseOrganizationListResponseDto> {
    this.logger.log(
      `Listing Supabase organizations for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getSupabaseContext(workspaceId, projectId);

    return this.supabaseService.listOrganizations(token);
  }

  /**
   * Validate supabaseProjectRef format to prevent path traversal / injection
   */
  private validateProjectRef(supabaseProjectRef: string): void {
    if (
      !supabaseProjectRef ||
      supabaseProjectRef.length > 100 ||
      !/^[a-zA-Z0-9_-]+$/.test(supabaseProjectRef)
    ) {
      throw new BadRequestException('Invalid Supabase project ref format');
    }
  }

  /**
   * Pause a Supabase project
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/projects/:supabaseProjectRef/pause
   */
  @Post('projects/:supabaseProjectRef/pause')
  async pauseProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('supabaseProjectRef') supabaseProjectRef: string,
    @Req() req: any,
  ): Promise<SupabasePauseResumeResponseDto> {
    this.validateProjectRef(supabaseProjectRef);
    const userId = req.user.userId;

    this.logger.log(
      `Pausing Supabase project ${supabaseProjectRef} for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getSupabaseContext(workspaceId, projectId);

    await this.supabaseService.pauseProject(token, supabaseProjectRef);

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        supabaseProjectRef,
        {
          action: 'integration.supabase.project_paused',
          supabaseProjectRef,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Supabase project pause: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'supabase_project_paused',
        title: `Supabase Project Paused`,
        message: `Supabase project ${supabaseProjectRef} has been paused`,
        metadata: {
          supabaseProjectRef,
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Supabase project pause: ${(notifError as Error).message}`,
      );
    }

    return {
      success: true,
      message: 'Supabase project paused',
    };
  }

  /**
   * Resume a Supabase project
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/supabase/projects/:supabaseProjectRef/resume
   */
  @Post('projects/:supabaseProjectRef/resume')
  async resumeProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('supabaseProjectRef') supabaseProjectRef: string,
    @Req() req: any,
  ): Promise<SupabasePauseResumeResponseDto> {
    this.validateProjectRef(supabaseProjectRef);
    const userId = req.user.userId;

    this.logger.log(
      `Resuming Supabase project ${supabaseProjectRef} for project ${projectId.substring(0, 8)}...`,
    );

    const { token } = await this.getSupabaseContext(workspaceId, projectId);

    await this.supabaseService.resumeProject(token, supabaseProjectRef);

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        supabaseProjectRef,
        {
          action: 'integration.supabase.project_resumed',
          supabaseProjectRef,
          projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for Supabase project resume: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'supabase_project_resumed',
        title: `Supabase Project Resumed`,
        message: `Supabase project ${supabaseProjectRef} has been resumed`,
        metadata: {
          supabaseProjectRef,
          projectId,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for Supabase project resume: ${(notifError as Error).message}`,
      );
    }

    return {
      success: true,
      message: 'Supabase project resumed',
    };
  }
}
