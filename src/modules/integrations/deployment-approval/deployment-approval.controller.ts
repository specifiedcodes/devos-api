import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { DeploymentApprovalService } from './deployment-approval.service';
import {
  UpdateApprovalSettingsDto,
  CreateDeploymentApprovalDto,
  RejectDeploymentDto,
  DeploymentApprovalListQueryDto,
  ApprovalSettingsResponseDto,
  DeploymentApprovalResponseDto,
  DeploymentApprovalListResponseDto,
  PendingCountResponseDto,
} from './dto/deployment-approval.dto';

/**
 * DeploymentApprovalController
 * Story 6.9: Manual Deployment Approval
 *
 * Provides REST endpoints for managing deployment approval workflow:
 * - Settings: Get/update deployment approval mode per project
 * - Create: Create new approval request (called by system/DevOps Agent)
 * - List: Paginated list of approval requests with status filter
 * - Detail: Get full detail of a single approval
 * - Approve/Reject: Action endpoints to approve or reject pending deployments
 * - Pending Count: For notification badge in the UI
 *
 * NOTE: Static routes (/settings, /pending-count) are declared BEFORE
 * parameterized routes (/:approvalId) to prevent NestJS route shadowing.
 */
@ApiTags('Deployments')
@ApiBearerAuth('JWT-auth')
@Controller(
  'api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals',
)
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DeploymentApprovalController {
  private readonly logger = new Logger(DeploymentApprovalController.name);

  constructor(
    private readonly deploymentApprovalService: DeploymentApprovalService,
  ) {}

  /**
   * Get deployment approval settings for a project
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/settings
   *
   * NOTE: Declared BEFORE /:approvalId to prevent route shadowing
   */
  @Get('settings')
  async getSettings(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ApprovalSettingsResponseDto> {
    this.logger.log(
      `Getting approval settings for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.getApprovalSettings(
      workspaceId,
      projectId,
    );
  }

  /**
   * Update deployment approval settings for a project
   * PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/settings
   *
   * NOTE: Declared BEFORE /:approvalId to prevent route shadowing
   */
  @Patch('settings')
  async updateSettings(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateApprovalSettingsDto,
    @Req() req: any,
  ): Promise<ApprovalSettingsResponseDto> {
    this.logger.log(
      `Updating approval settings for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.updateApprovalSettings(
      workspaceId,
      projectId,
      req.user.userId,
      dto,
    );
  }

  /**
   * Get pending approval count for notification badge
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/pending-count
   *
   * NOTE: Declared BEFORE /:approvalId to prevent route shadowing
   */
  @Get('pending-count')
  async getPendingCount(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<PendingCountResponseDto> {
    this.logger.log(
      `Getting pending count for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.getPendingCount(
      workspaceId,
      projectId,
    );
  }

  /**
   * Create deployment approval request
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createApprovalRequest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDeploymentApprovalDto,
    @Req() req: any,
  ): Promise<DeploymentApprovalResponseDto> {
    this.logger.log(
      `Creating approval request for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.createApprovalRequest(
      workspaceId,
      projectId,
      req.user.userId,
      dto,
    );
  }

  /**
   * List deployment approval requests
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals
   */
  @Get()
  async listApprovalRequests(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DeploymentApprovalListQueryDto,
  ): Promise<DeploymentApprovalListResponseDto> {
    this.logger.log(
      `Listing approval requests for project ${projectId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.listApprovalRequests(
      workspaceId,
      projectId,
      {
        status: query.status,
        page: query.page,
        perPage: query.perPage,
      },
    );
  }

  /**
   * Get single approval detail
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/:approvalId
   *
   * NOTE: Declared AFTER static routes (/settings, /pending-count) to prevent shadowing
   */
  @Get(':approvalId')
  async getApprovalDetail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
  ): Promise<DeploymentApprovalResponseDto> {
    this.logger.log(
      `Getting approval detail ${approvalId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.getApprovalDetail(
      workspaceId,
      projectId,
      approvalId,
    );
  }

  /**
   * Approve a pending deployment
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/:approvalId/approve
   */
  @Post(':approvalId/approve')
  async approveDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Req() req: any,
  ): Promise<DeploymentApprovalResponseDto> {
    this.logger.log(
      `Approving deployment ${approvalId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.approveDeployment(
      workspaceId,
      projectId,
      approvalId,
      req.user.userId,
    );
  }

  /**
   * Reject a pending deployment
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/deployment-approvals/:approvalId/reject
   */
  @Post(':approvalId/reject')
  async rejectDeployment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Body() dto: RejectDeploymentDto,
    @Req() req: any,
  ): Promise<DeploymentApprovalResponseDto> {
    this.logger.log(
      `Rejecting deployment ${approvalId.substring(0, 8)}...`,
    );

    return this.deploymentApprovalService.rejectDeployment(
      workspaceId,
      projectId,
      approvalId,
      req.user.userId,
      dto.reason,
    );
  }
}
