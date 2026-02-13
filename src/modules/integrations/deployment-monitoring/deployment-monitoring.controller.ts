import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { DeploymentMonitoringService } from './deployment-monitoring.service';
import {
  UnifiedDeploymentListQueryDto,
  DeploymentDetailQueryDto,
  UnifiedDeploymentListResponseDto,
  ActiveDeploymentsResponseDto,
  DeploymentSummaryResponseDto,
  UnifiedDeploymentDto,
} from './dto/deployment-monitoring.dto';

/**
 * DeploymentMonitoringController
 * Story 6.8: Deployment Status Monitoring
 *
 * Provides unified deployment monitoring endpoints that aggregate
 * deployment data from Railway and Vercel. Supports listing,
 * detail view, active deployment polling, and deployment summary.
 *
 * NOTE: Route prefix uses /deployments (no platform prefix) to
 * distinguish from platform-specific endpoints (/railway/deployments,
 * /vercel/deployments).
 */
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/deployments',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DeploymentMonitoringController {
  private readonly logger = new Logger(DeploymentMonitoringController.name);

  constructor(
    private readonly deploymentMonitoringService: DeploymentMonitoringService,
  ) {}

  /**
   * List unified deployments
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployments
   */
  @Get()
  async listDeployments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: UnifiedDeploymentListQueryDto,
  ): Promise<UnifiedDeploymentListResponseDto> {
    this.logger.log(
      `Listing unified deployments for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentMonitoringService.getUnifiedDeployments(
      workspaceId,
      projectId,
      {
        platform: query.platform,
        status: query.status,
        page: query.page,
        perPage: query.perPage,
      },
    );
  }

  /**
   * Get active deployments (for polling)
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployments/active
   *
   * NOTE: Must be declared BEFORE /:deploymentId to prevent NestJS route shadowing
   */
  @Get('active')
  async getActiveDeployments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ActiveDeploymentsResponseDto> {
    this.logger.log(
      `Getting active deployments for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentMonitoringService.getActiveDeployments(
      workspaceId,
      projectId,
    );
  }

  /**
   * Get deployment summary statistics
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployments/summary
   *
   * NOTE: Must be declared BEFORE /:deploymentId to prevent NestJS route shadowing
   */
  @Get('summary')
  async getDeploymentSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<DeploymentSummaryResponseDto> {
    this.logger.log(
      `Getting deployment summary for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentMonitoringService.getDeploymentSummary(
      workspaceId,
      projectId,
    );
  }

  /**
   * Get deployment detail
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployments/:deploymentId
   *
   * NOTE: Must be declared AFTER static routes (/active, /summary)
   */
  @Get(':deploymentId')
  async getDeploymentDetail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('deploymentId') deploymentId: string,
    @Query() query: DeploymentDetailQueryDto,
  ): Promise<UnifiedDeploymentDto> {
    this.logger.log(
      `Getting deployment detail ${deploymentId} for project ${projectId.substring(0, 8)}...`,
    );

    // Validate deploymentId format (alphanumeric with hyphens/underscores, max 100 chars)
    if (
      !deploymentId ||
      deploymentId.length > 100 ||
      !/^[a-zA-Z0-9_-]+$/.test(deploymentId)
    ) {
      throw new BadRequestException(
        'Invalid deployment ID format. Must be alphanumeric with hyphens/underscores, max 100 characters.',
      );
    }

    if (!query.platform) {
      throw new BadRequestException(
        'platform query parameter is required (railway or vercel)',
      );
    }

    const result =
      await this.deploymentMonitoringService.getDeploymentDetail(
        workspaceId,
        projectId,
        deploymentId,
        query.platform,
      );

    if (!result) {
      throw new NotFoundException('Deployment not found');
    }

    return result;
  }
}
