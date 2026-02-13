import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  Logger,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { DeploymentRollbackService } from './deployment-rollback.service';
import {
  CreateManualRollbackDto,
  CreateAutoRollbackDto,
  DeploymentRollbackListQueryDto,
  DeploymentRollbackResponseDto,
  DeploymentRollbackListResponseDto,
  RollbackSummaryResponseDto,
} from './dto/deployment-rollback.dto';

/**
 * DeploymentRollbackController
 * Story 6.10: Deployment Rollback
 *
 * Provides REST endpoints for managing deployment rollback workflow:
 * - Manual rollback: User-triggered rollback to a previous deployment
 * - Auto rollback: System/DevOps Agent-triggered rollback on smoke test failure
 * - List: Paginated rollback history with filters
 * - Detail: Get full detail of a single rollback
 * - Summary: Rollback statistics for the project dashboard
 *
 * NOTE: Static routes (/summary, /auto) are declared BEFORE
 * parameterized routes (/:rollbackId) to prevent NestJS route shadowing.
 */
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DeploymentRollbackController {
  private readonly logger = new Logger(DeploymentRollbackController.name);

  constructor(
    private readonly deploymentRollbackService: DeploymentRollbackService,
  ) {}

  /**
   * Get rollback summary statistics
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks/summary
   *
   * NOTE: Declared BEFORE /:rollbackId to prevent route shadowing
   */
  @Get('summary')
  async getRollbackSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RollbackSummaryResponseDto> {
    this.logger.log(
      `Getting rollback summary for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentRollbackService.getRollbackSummary(
      workspaceId,
      projectId,
    );
  }

  /**
   * Trigger automatic rollback (system/DevOps Agent)
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks/auto
   *
   * NOTE: Declared BEFORE /:rollbackId to prevent route shadowing
   */
  @Post('auto')
  @HttpCode(HttpStatus.CREATED)
  async initiateAutoRollback(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateAutoRollbackDto,
    @Req() req: any,
  ): Promise<DeploymentRollbackResponseDto> {
    this.logger.log(
      `Initiating auto rollback for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentRollbackService.initiateAutoRollback(
      workspaceId,
      projectId,
      req.user.userId,
      dto,
    );
  }

  /**
   * Trigger manual rollback
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async initiateManualRollback(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateManualRollbackDto,
    @Req() req: any,
  ): Promise<DeploymentRollbackResponseDto> {
    this.logger.log(
      `Initiating manual rollback for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentRollbackService.initiateManualRollback(
      workspaceId,
      projectId,
      req.user.userId,
      dto,
    );
  }

  /**
   * List rollback history
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks
   */
  @Get()
  async listRollbacks(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DeploymentRollbackListQueryDto,
  ): Promise<DeploymentRollbackListResponseDto> {
    this.logger.log(
      `Listing rollbacks for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentRollbackService.listRollbacks(
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
   * Get single rollback detail
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-rollbacks/:rollbackId
   *
   * NOTE: Declared AFTER static routes (/summary, /auto) to prevent shadowing
   */
  @Get(':rollbackId')
  async getRollbackDetail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('rollbackId', ParseUUIDPipe) rollbackId: string,
  ): Promise<DeploymentRollbackResponseDto> {
    this.logger.log(
      `Getting rollback detail ${rollbackId.substring(0, 8)}...`,
    );

    return this.deploymentRollbackService.getRollbackDetail(
      workspaceId,
      projectId,
      rollbackId,
    );
  }
}
