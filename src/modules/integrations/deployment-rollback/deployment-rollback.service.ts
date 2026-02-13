import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeploymentRollback,
  DeploymentRollbackStatus,
  DeploymentRollbackTriggerType,
} from '../../../database/entities/deployment-rollback.entity';
import { Project } from '../../../database/entities/project.entity';
import { RailwayService } from '../railway/railway.service';
import { VercelService } from '../vercel/vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { DeploymentMonitoringService } from '../deployment-monitoring/deployment-monitoring.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  CreateManualRollbackDto,
  CreateAutoRollbackDto,
  DeploymentRollbackResponseDto,
  DeploymentRollbackListResponseDto,
  RollbackSummaryResponseDto,
} from './dto/deployment-rollback.dto';

/**
 * DeploymentRollbackService
 * Story 6.10: Deployment Rollback
 *
 * Orchestrates deployment rollback workflow for Railway and Vercel platforms.
 * Supports both manual (user-initiated) and automatic (smoke test failure) rollbacks.
 * Persists rollback records, sends notifications, and logs audit events.
 */
@Injectable()
export class DeploymentRollbackService {
  private readonly logger = new Logger(DeploymentRollbackService.name);

  constructor(
    @InjectRepository(DeploymentRollback)
    private readonly rollbackRepository: Repository<DeploymentRollback>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly railwayService: RailwayService,
    private readonly vercelService: VercelService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    private readonly deploymentMonitoringService: DeploymentMonitoringService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get decrypted platform token for rollback operations
   * Throws BadRequestException if platform integration not connected
   */
  private async getPlatformToken(
    workspaceId: string,
    platform: string,
  ): Promise<string> {
    const provider =
      platform === 'railway'
        ? IntegrationProvider.RAILWAY
        : IntegrationProvider.VERCEL;

    try {
      return await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        provider,
      );
    } catch (error) {
      throw new BadRequestException(
        `${platform} integration not connected for this workspace`,
      );
    }
  }

  /**
   * Find the most recent successful deployment before the current one
   * Uses DeploymentMonitoringService to query platform deployments
   */
  private async findPreviousSuccessfulDeployment(
    workspaceId: string,
    projectId: string,
    platform: string,
    currentDeploymentId: string,
  ): Promise<string> {
    const result =
      await this.deploymentMonitoringService.getUnifiedDeployments(
        workspaceId,
        projectId,
        { platform, perPage: 50 },
      );

    // Filter for successful deployments excluding the current one,
    // then sort by startedAt descending to ensure the most recent is selected
    const successfulDeployments = result.deployments
      .filter(
        (d) =>
          d.normalizedStatus === 'success' && d.id !== currentDeploymentId,
      )
      .sort((a, b) => {
        const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return timeB - timeA; // descending (most recent first)
      });

    if (successfulDeployments.length === 0) {
      throw new BadRequestException(
        'No previous successful deployment found to rollback to',
      );
    }

    return successfulDeployments[0].id;
  }

  /**
   * Execute platform-specific rollback (redeploy)
   */
  private async executeRollback(
    token: string,
    platform: string,
    targetDeploymentId: string,
    project: Project,
  ): Promise<{ newDeploymentId: string }> {
    if (platform === 'railway') {
      const result = await this.railwayService.redeployDeployment(
        token,
        targetDeploymentId,
      );
      return { newDeploymentId: result.id };
    }

    if (platform === 'vercel') {
      const result = await this.vercelService.redeployDeployment(
        token,
        targetDeploymentId,
        project.name,
      );
      return { newDeploymentId: result.id };
    }

    throw new BadRequestException(`Unsupported platform: ${platform}`);
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(
    rollback: DeploymentRollback,
  ): DeploymentRollbackResponseDto {
    return {
      id: rollback.id,
      projectId: rollback.projectId,
      platform: rollback.platform,
      deploymentId: rollback.deploymentId,
      targetDeploymentId: rollback.targetDeploymentId || undefined,
      newDeploymentId: rollback.newDeploymentId || undefined,
      environment: rollback.environment,
      status: rollback.status,
      reason: rollback.reason || undefined,
      triggerType: rollback.triggerType,
      initiatedBy: rollback.initiatedBy,
      initiatedAt: rollback.initiatedAt.toISOString(),
      completedAt: rollback.completedAt
        ? rollback.completedAt.toISOString()
        : undefined,
      errorMessage: rollback.errorMessage || undefined,
    };
  }

  /**
   * Core rollback orchestration logic shared by manual and automatic rollbacks.
   * Handles: project validation, token retrieval, target resolution, record creation,
   * platform execution, status updates, notifications, and audit logging.
   */
  private async performRollback(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: { platform: string; deploymentId: string; environment: string; reason?: string },
    options: {
      triggerType: DeploymentRollbackTriggerType;
      targetDeploymentId?: string;
      notificationTitlePrefix: string;
      notificationMessagePrefix?: string;
    },
  ): Promise<DeploymentRollbackResponseDto> {
    const triggerLabel = options.triggerType === DeploymentRollbackTriggerType.AUTOMATIC ? 'automatic' : 'manual';

    this.logger.log(
      `Initiating ${triggerLabel} rollback for project ${projectId.substring(0, 8)}... platform=${dto.platform}`,
    );

    // Load project
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    // Get platform token
    const token = await this.getPlatformToken(workspaceId, dto.platform);

    // Resolve target deployment ID
    const targetDeploymentId =
      options.targetDeploymentId ||
      (await this.findPreviousSuccessfulDeployment(
        workspaceId,
        projectId,
        dto.platform,
        dto.deploymentId,
      ));

    // Create rollback record
    const rollback = this.rollbackRepository.create({
      projectId,
      workspaceId,
      platform: dto.platform,
      deploymentId: dto.deploymentId,
      targetDeploymentId,
      environment: dto.environment,
      status: DeploymentRollbackStatus.IN_PROGRESS,
      reason: dto.reason,
      triggerType: options.triggerType,
      initiatedBy: userId,
    });

    await this.rollbackRepository.save(rollback);

    // Log audit event: rollback initiated
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DEPLOYMENT_ROLLBACK_INITIATED,
        'deployment_rollback',
        rollback.id,
        {
          platform: dto.platform,
          deploymentId: dto.deploymentId,
          targetDeploymentId,
          environment: dto.environment,
          triggerType: triggerLabel,
          ...(dto.reason ? { reason: dto.reason } : {}),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log rollback initiated audit event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Execute platform rollback
    try {
      const result = await this.executeRollback(
        token,
        dto.platform,
        targetDeploymentId,
        project,
      );

      // Update rollback record: success
      rollback.status = DeploymentRollbackStatus.SUCCESS;
      rollback.newDeploymentId = result.newDeploymentId;
      rollback.completedAt = new Date();
      await this.rollbackRepository.save(rollback);

      // Build success notification message
      const successMessage = options.notificationMessagePrefix
        ? `${options.notificationMessagePrefix} Rollback on ${dto.platform} (${dto.environment}) completed successfully.`
        : `Rollback on ${dto.platform} (${dto.environment}) completed successfully. New deployment: ${result.newDeploymentId}`;

      // Send success notification
      try {
        await this.notificationService.create({
          workspaceId,
          type: 'deployment_rollback_completed',
          title: `${options.notificationTitlePrefix} Rollback Completed`,
          message: successMessage,
          metadata: {
            rollbackId: rollback.id,
            platform: dto.platform,
            environment: dto.environment,
            newDeploymentId: result.newDeploymentId,
            ...(options.triggerType === DeploymentRollbackTriggerType.AUTOMATIC
              ? { triggerType: 'automatic', reason: dto.reason }
              : {}),
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send rollback success notification: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Log audit event: rollback completed
      try {
        await this.auditService.log(
          workspaceId,
          userId,
          AuditAction.DEPLOYMENT_ROLLBACK_COMPLETED,
          'deployment_rollback',
          rollback.id,
          {
            platform: dto.platform,
            newDeploymentId: result.newDeploymentId,
            status: 'success',
            ...(options.triggerType === DeploymentRollbackTriggerType.AUTOMATIC
              ? { triggerType: 'automatic' }
              : {}),
          },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to log rollback completed audit event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      // Update rollback record: failed
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      rollback.status = DeploymentRollbackStatus.FAILED;
      rollback.errorMessage = errorMessage;
      rollback.completedAt = new Date();
      await this.rollbackRepository.save(rollback);

      // Build failure notification message
      const failureMessage = options.notificationMessagePrefix
        ? `${options.notificationMessagePrefix} Rollback on ${dto.platform} (${dto.environment}) failed: ${errorMessage}`
        : `Rollback on ${dto.platform} (${dto.environment}) failed: ${errorMessage}`;

      // Send failure notification
      try {
        await this.notificationService.create({
          workspaceId,
          type: 'deployment_rollback_failed',
          title: `${options.notificationTitlePrefix} Rollback Failed`,
          message: failureMessage,
          metadata: {
            rollbackId: rollback.id,
            platform: dto.platform,
            environment: dto.environment,
            error: errorMessage,
            ...(options.triggerType === DeploymentRollbackTriggerType.AUTOMATIC
              ? { triggerType: 'automatic', reason: dto.reason }
              : {}),
          },
        });
      } catch (notifError) {
        this.logger.warn(
          `Failed to send rollback failure notification: ${notifError instanceof Error ? notifError.message : String(notifError)}`,
        );
      }

      // Log audit event: rollback failed
      try {
        await this.auditService.log(
          workspaceId,
          userId,
          AuditAction.DEPLOYMENT_ROLLBACK_FAILED,
          'deployment_rollback',
          rollback.id,
          {
            platform: dto.platform,
            error: errorMessage,
            status: 'failed',
            ...(options.triggerType === DeploymentRollbackTriggerType.AUTOMATIC
              ? { triggerType: 'automatic' }
              : {}),
          },
        );
      } catch (auditError) {
        this.logger.warn(
          `Failed to log rollback failed audit event: ${auditError instanceof Error ? auditError.message : String(auditError)}`,
        );
      }
    }

    return this.mapToResponseDto(rollback);
  }

  /**
   * Initiate a manual rollback (user-triggered)
   */
  async initiateManualRollback(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: CreateManualRollbackDto,
  ): Promise<DeploymentRollbackResponseDto> {
    return this.performRollback(workspaceId, projectId, userId, dto, {
      triggerType: DeploymentRollbackTriggerType.MANUAL,
      targetDeploymentId: dto.targetDeploymentId,
      notificationTitlePrefix: 'Deployment',
    });
  }

  /**
   * Initiate an automatic rollback (system/DevOps Agent triggered)
   */
  async initiateAutoRollback(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: CreateAutoRollbackDto,
  ): Promise<DeploymentRollbackResponseDto> {
    return this.performRollback(workspaceId, projectId, userId, dto, {
      triggerType: DeploymentRollbackTriggerType.AUTOMATIC,
      notificationTitlePrefix: 'Automatic',
      notificationMessagePrefix: `Automatic rollback triggered: ${dto.reason}.`,
    });
  }

  /**
   * List rollback history with pagination and filters
   */
  async listRollbacks(
    workspaceId: string,
    projectId: string,
    options: {
      platform?: string;
      status?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<DeploymentRollbackListResponseDto> {
    // Validate project exists
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    const page = options.page || 1;
    const perPage = options.perPage || 10;

    const queryBuilder = this.rollbackRepository
      .createQueryBuilder('rollback')
      .where('rollback.projectId = :projectId', { projectId })
      .andWhere('rollback.workspaceId = :workspaceId', { workspaceId });

    if (options.platform) {
      queryBuilder.andWhere('rollback.platform = :platform', {
        platform: options.platform,
      });
    }

    if (options.status) {
      queryBuilder.andWhere('rollback.status = :status', {
        status: options.status,
      });
    }

    const total = await queryBuilder.getCount();

    const rollbacks = await queryBuilder
      .orderBy('rollback.initiatedAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getMany();

    return {
      rollbacks: rollbacks.map((r) => this.mapToResponseDto(r)),
      total,
      page,
      perPage,
    };
  }

  /**
   * Get rollback detail by ID
   */
  async getRollbackDetail(
    workspaceId: string,
    projectId: string,
    rollbackId: string,
  ): Promise<DeploymentRollbackResponseDto> {
    const rollback = await this.rollbackRepository.findOne({
      where: {
        id: rollbackId,
        projectId,
        workspaceId,
      },
    });

    if (!rollback) {
      throw new NotFoundException('Rollback not found');
    }

    return this.mapToResponseDto(rollback);
  }

  /**
   * Get rollback summary statistics for a project
   */
  async getRollbackSummary(
    workspaceId: string,
    projectId: string,
  ): Promise<RollbackSummaryResponseDto> {
    // Validate project exists
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    // Single aggregation query for all counts and average duration
    const summaryResult = await this.rollbackRepository
      .createQueryBuilder('rollback')
      .select('COUNT(*)', 'totalRollbacks')
      .addSelect(
        `COUNT(*) FILTER (WHERE rollback.status = '${DeploymentRollbackStatus.SUCCESS}')`,
        'successCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE rollback.status = '${DeploymentRollbackStatus.FAILED}')`,
        'failedCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE rollback.trigger_type = '${DeploymentRollbackTriggerType.MANUAL}')`,
        'manualCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE rollback.trigger_type = '${DeploymentRollbackTriggerType.AUTOMATIC}')`,
        'automaticCount',
      )
      .addSelect(
        `AVG(EXTRACT(EPOCH FROM (rollback.completed_at - rollback.initiated_at))) FILTER (WHERE rollback.status = '${DeploymentRollbackStatus.SUCCESS}' AND rollback.completed_at IS NOT NULL)`,
        'avgDuration',
      )
      .where('rollback.projectId = :projectId', { projectId })
      .andWhere('rollback.workspaceId = :workspaceId', { workspaceId })
      .getRawOne();

    const totalRollbacks = parseInt(summaryResult?.totalRollbacks || '0', 10);
    const successCount = parseInt(summaryResult?.successCount || '0', 10);
    const failedCount = parseInt(summaryResult?.failedCount || '0', 10);
    const manualCount = parseInt(summaryResult?.manualCount || '0', 10);
    const automaticCount = parseInt(summaryResult?.automaticCount || '0', 10);
    const avg = parseFloat(summaryResult?.avgDuration);
    const averageDurationSeconds = isNaN(avg) ? null : Math.round(avg);

    // Get most recent rollback (separate query needed for full entity)
    const lastRollbackEntity = await this.rollbackRepository.findOne({
      where: { projectId, workspaceId },
      order: { initiatedAt: 'DESC' },
    });

    const lastRollback = lastRollbackEntity
      ? {
          id: lastRollbackEntity.id,
          platform: lastRollbackEntity.platform,
          status: lastRollbackEntity.status,
          triggerType: lastRollbackEntity.triggerType,
          initiatedAt: lastRollbackEntity.initiatedAt.toISOString(),
          completedAt: lastRollbackEntity.completedAt
            ? lastRollbackEntity.completedAt.toISOString()
            : undefined,
        }
      : null;

    return {
      totalRollbacks,
      successCount,
      failedCount,
      manualCount,
      automaticCount,
      averageDurationSeconds,
      lastRollback,
    };
  }
}
