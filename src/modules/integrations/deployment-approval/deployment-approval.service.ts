import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeploymentApproval,
  DeploymentApprovalStatus,
} from '../../../database/entities/deployment-approval.entity';
import { Project } from '../../../database/entities/project.entity';
import {
  ProjectPreferences,
  DeploymentApprovalMode,
  RepositoryStructure,
  CodeStyle,
  GitWorkflow,
  TestingStrategy,
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_MODEL,
} from '../../../database/entities/project-preferences.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  UpdateApprovalSettingsDto,
  ApprovalSettingsResponseDto,
  CreateDeploymentApprovalDto,
  DeploymentApprovalResponseDto,
  DeploymentApprovalListResponseDto,
} from './dto/deployment-approval.dto';

/**
 * DeploymentApprovalService
 * Story 6.9: Manual Deployment Approval
 *
 * Manages the deployment approval workflow including:
 * - Per-project approval mode settings (automatic, manual, hybrid)
 * - Approval request creation (by system/DevOps Agent)
 * - Approve/reject actions with audit logging and notifications
 * - Pending count for notification badges
 */
@Injectable()
export class DeploymentApprovalService {
  private readonly logger = new Logger(DeploymentApprovalService.name);

  constructor(
    @InjectRepository(DeploymentApproval)
    private readonly approvalRepository: Repository<DeploymentApproval>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectPreferences)
    private readonly preferencesRepository: Repository<ProjectPreferences>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get current approval settings for a project
   */
  async getApprovalSettings(
    workspaceId: string,
    projectId: string,
  ): Promise<ApprovalSettingsResponseDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
      relations: ['preferences'],
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    const mode =
      project.preferences?.deploymentApprovalMode ||
      DeploymentApprovalMode.AUTOMATIC;

    return {
      projectId: project.id,
      approvalMode: mode,
    };
  }

  /**
   * Update approval settings for a project
   */
  async updateApprovalSettings(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: UpdateApprovalSettingsDto,
  ): Promise<ApprovalSettingsResponseDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
      relations: ['preferences'],
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    let preferences = project.preferences;
    const oldMode =
      preferences?.deploymentApprovalMode || DeploymentApprovalMode.AUTOMATIC;

    if (!preferences) {
      preferences = this.preferencesRepository.create({
        projectId: project.id,
        repositoryStructure: RepositoryStructure.MONOREPO,
        codeStyle: CodeStyle.FUNCTIONAL,
        gitWorkflow: GitWorkflow.GITHUB_FLOW,
        testingStrategy: TestingStrategy.BALANCED,
        aiProvider: DEFAULT_AI_PROVIDER,
        aiModel: DEFAULT_AI_MODEL,
        deploymentApprovalMode: dto.approvalMode as DeploymentApprovalMode,
      });
    } else {
      preferences.deploymentApprovalMode =
        dto.approvalMode as DeploymentApprovalMode;
    }

    const saved = await this.preferencesRepository.save(preferences);

    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_APPROVAL_SETTINGS_UPDATED,
        'project',
        projectId,
        { oldMode, newMode: dto.approvalMode },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log audit event for approval settings update: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      projectId: project.id,
      approvalMode: saved.deploymentApprovalMode,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Create a deployment approval request
   */
  async createApprovalRequest(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: CreateDeploymentApprovalDto,
  ): Promise<DeploymentApprovalResponseDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
      relations: ['preferences'],
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    const mode =
      project.preferences?.deploymentApprovalMode ||
      DeploymentApprovalMode.AUTOMATIC;

    if (mode === DeploymentApprovalMode.AUTOMATIC) {
      throw new BadRequestException(
        'Project is configured for automatic deployments. No approval needed.',
      );
    }

    if (
      mode === DeploymentApprovalMode.STAGING_AUTO_PRODUCTION_MANUAL &&
      dto.environment !== 'production'
    ) {
      throw new BadRequestException(
        'Automatic deployment is enabled for non-production environments. No approval needed.',
      );
    }

    const approval = this.approvalRepository.create({
      projectId: project.id,
      workspaceId,
      platform: dto.platform,
      branch: dto.branch,
      commitSha: dto.commitSha,
      environment: dto.environment,
      status: DeploymentApprovalStatus.PENDING,
      storyId: dto.storyId,
      storyTitle: dto.storyTitle,
      changes: dto.changes,
      testResults: dto.testResults,
      requestedBy: userId || 'system',
    });

    const saved = await this.approvalRepository.save(approval);

    try {
      await this.notificationService.create({
        workspaceId,
        type: 'deployment_approval_requested',
        title: 'Deployment Approval Required',
        message: `Deployment to ${dto.platform} (${dto.environment}) is ready for review for ${project.name}`,
        metadata: {
          approvalId: saved.id,
          projectId: project.id,
          platform: dto.platform,
          environment: dto.environment,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create notification for approval request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_APPROVAL_REQUESTED,
        'deployment_approval',
        saved.id,
        {
          projectId: project.id,
          platform: dto.platform,
          environment: dto.environment,
          branch: dto.branch,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log audit event for approval request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.mapToResponseDto(saved);
  }

  /**
   * List deployment approval requests with pagination and optional status filter
   */
  async listApprovalRequests(
    workspaceId: string,
    projectId: string,
    options: { status?: string; page?: number; perPage?: number },
  ): Promise<DeploymentApprovalListResponseDto> {
    // Validate project exists in this workspace before listing approvals
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    const page = options.page || 1;
    const perPage = options.perPage || 10;

    const queryBuilder = this.approvalRepository
      .createQueryBuilder('approval')
      .where('approval.projectId = :projectId', { projectId })
      .andWhere('approval.workspaceId = :workspaceId', { workspaceId });

    if (options.status) {
      queryBuilder.andWhere('approval.status = :status', {
        status: options.status,
      });
    }

    queryBuilder.orderBy('approval.requestedAt', 'DESC');

    const total = await queryBuilder.getCount();

    queryBuilder.skip((page - 1) * perPage).take(perPage);

    const approvals = await queryBuilder.getMany();

    return {
      approvals: approvals.map((a) => this.mapToResponseDto(a)),
      total,
      page,
      perPage,
    };
  }

  /**
   * Get a single approval detail by ID
   */
  async getApprovalDetail(
    workspaceId: string,
    projectId: string,
    approvalId: string,
  ): Promise<DeploymentApprovalResponseDto> {
    const approval = await this.approvalRepository.findOne({
      where: { id: approvalId, projectId, workspaceId },
    });

    if (!approval) {
      throw new NotFoundException('Deployment approval not found');
    }

    return this.mapToResponseDto(approval);
  }

  /**
   * Approve a pending deployment
   */
  async approveDeployment(
    workspaceId: string,
    projectId: string,
    approvalId: string,
    userId: string,
  ): Promise<DeploymentApprovalResponseDto> {
    const approval = await this.approvalRepository.findOne({
      where: { id: approvalId, projectId, workspaceId },
    });

    if (!approval) {
      throw new NotFoundException('Deployment approval not found');
    }

    if (approval.status !== DeploymentApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve deployment. Current status is "${approval.status}". Only pending approvals can be approved.`,
      );
    }

    approval.status = DeploymentApprovalStatus.APPROVED;
    approval.reviewedAt = new Date();
    approval.reviewedBy = userId;

    const saved = await this.approvalRepository.save(approval);

    // Load project name for notification (scoped to workspace for safety)
    let projectName = projectId;
    try {
      const project = await this.projectRepository.findOne({
        where: { id: projectId, workspaceId },
      });
      if (project) {
        projectName = project.name;
      }
    } catch {
      // Ignore - use projectId as fallback
    }

    try {
      await this.notificationService.create({
        workspaceId,
        type: 'deployment_approved',
        title: 'Deployment Approved',
        message: `Deployment to ${saved.platform} (${saved.environment}) has been approved for ${projectName}`,
        metadata: {
          approvalId: saved.id,
          projectId,
          platform: saved.platform,
          environment: saved.environment,
          approvedBy: userId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create notification for deployment approval: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_APPROVED,
        'deployment_approval',
        saved.id,
        {
          projectId,
          platform: saved.platform,
          environment: saved.environment,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log audit event for deployment approval: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.mapToResponseDto(saved);
  }

  /**
   * Reject a pending deployment
   */
  async rejectDeployment(
    workspaceId: string,
    projectId: string,
    approvalId: string,
    userId: string,
    reason?: string,
  ): Promise<DeploymentApprovalResponseDto> {
    const approval = await this.approvalRepository.findOne({
      where: { id: approvalId, projectId, workspaceId },
    });

    if (!approval) {
      throw new NotFoundException('Deployment approval not found');
    }

    if (approval.status !== DeploymentApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject deployment. Current status is "${approval.status}". Only pending approvals can be rejected.`,
      );
    }

    approval.status = DeploymentApprovalStatus.REJECTED;
    approval.reviewedAt = new Date();
    approval.reviewedBy = userId;
    approval.rejectionReason = reason || undefined;

    const saved = await this.approvalRepository.save(approval);

    // Load project name for notification (scoped to workspace for safety)
    let projectName = projectId;
    try {
      const project = await this.projectRepository.findOne({
        where: { id: projectId, workspaceId },
      });
      if (project) {
        projectName = project.name;
      }
    } catch {
      // Ignore - use projectId as fallback
    }

    try {
      const reasonText = reason ? ` Reason: ${reason}` : '';
      await this.notificationService.create({
        workspaceId,
        type: 'deployment_rejected',
        title: 'Deployment Rejected',
        message: `Deployment to ${saved.platform} (${saved.environment}) was rejected for ${projectName}.${reasonText}`,
        metadata: {
          approvalId: saved.id,
          projectId,
          platform: saved.platform,
          environment: saved.environment,
          rejectedBy: userId,
          reason,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create notification for deployment rejection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_REJECTED,
        'deployment_approval',
        saved.id,
        {
          projectId,
          platform: saved.platform,
          environment: saved.environment,
          reason,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log audit event for deployment rejection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.mapToResponseDto(saved);
  }

  /**
   * Get count of pending approvals for notification badge
   *
   * NOTE: Pending approvals currently have no expiration mechanism.
   * A future enhancement should add a cron job or on-read TTL check
   * to transition stale pending approvals to 'expired' status.
   */
  async getPendingCount(
    workspaceId: string,
    projectId: string,
  ): Promise<{ pendingCount: number }> {
    const count = await this.approvalRepository.count({
      where: {
        projectId,
        workspaceId,
        status: DeploymentApprovalStatus.PENDING,
      },
    });

    return { pendingCount: count };
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(
    approval: DeploymentApproval,
  ): DeploymentApprovalResponseDto {
    return {
      id: approval.id,
      projectId: approval.projectId,
      platform: approval.platform,
      branch: approval.branch,
      commitSha: approval.commitSha || undefined,
      environment: approval.environment,
      status: approval.status,
      storyId: approval.storyId || undefined,
      storyTitle: approval.storyTitle || undefined,
      changes: approval.changes || undefined,
      testResults: approval.testResults || undefined,
      requestedAt: approval.requestedAt?.toISOString(),
      requestedBy: approval.requestedBy,
      reviewedAt: approval.reviewedAt?.toISOString() || undefined,
      reviewedBy: approval.reviewedBy || undefined,
      rejectionReason: approval.rejectionReason || undefined,
    };
  }
}
