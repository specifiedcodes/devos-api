import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProvisioningStatus,
  ProvisioningStatusEnum,
  StepStatusType,
} from '../../../database/entities/provisioning-status.entity';

/**
 * ProvisioningStatusService
 *
 * Provides data access methods for ProvisioningStatus entity
 * Handles CRUD operations with workspace isolation
 *
 * Part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 */
@Injectable()
export class ProvisioningStatusService {
  private readonly logger = new Logger(ProvisioningStatusService.name);

  constructor(
    @InjectRepository(ProvisioningStatus)
    private readonly provisioningStatusRepository: Repository<ProvisioningStatus>,
  ) {}

  /**
   * Create a new provisioning status record
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID (for isolation)
   * @returns Created provisioning status
   */
  async createProvisioningStatus(
    projectId: string,
    workspaceId: string,
  ): Promise<ProvisioningStatus> {
    this.logger.log(`Creating provisioning status for project ${projectId}`);

    const provisioningStatus = this.provisioningStatusRepository.create({
      projectId,
      workspaceId,
      status: ProvisioningStatusEnum.PENDING,
      steps: {
        github_repo_created: { status: 'pending' },
        database_provisioned: { status: 'pending' },
        deployment_configured: { status: 'pending' },
        project_initialized: { status: 'pending' },
      },
    });

    const saved = await this.provisioningStatusRepository.save(provisioningStatus);
    this.logger.log(`Provisioning status created: ${saved.id}`);

    return saved;
  }

  /**
   * Find provisioning status by project ID
   * @param projectId - Project ID
   * @returns Provisioning status or null if not found
   */
  async findByProjectId(projectId: string): Promise<ProvisioningStatus | null> {
    return this.provisioningStatusRepository.findOne({
      where: { projectId },
    });
  }

  /**
   * Find all provisioning statuses in a workspace
   * @param workspaceId - Workspace ID
   * @returns Array of provisioning statuses
   */
  async findByWorkspaceId(workspaceId: string): Promise<ProvisioningStatus[]> {
    return this.provisioningStatusRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update a specific provisioning step status
   * @param projectId - Project ID
   * @param stepName - Name of the step to update
   * @param status - New status for the step
   * @param error - Optional error message if failed
   * @returns Updated provisioning status
   */
  async updateStepStatus(
    projectId: string,
    stepName: keyof ProvisioningStatus['steps'],
    status: StepStatusType,
    error?: string,
  ): Promise<ProvisioningStatus> {
    const provisioningStatus = await this.findByProjectId(projectId);

    if (!provisioningStatus) {
      throw new NotFoundException(`Provisioning status not found for project ${projectId}`);
    }

    // Update step status
    const timestamp = new Date().toISOString();
    provisioningStatus.steps[stepName] = {
      ...provisioningStatus.steps[stepName],
      status,
      ...(status === 'in_progress' && { startedAt: timestamp }),
      ...(status === 'completed' && { completedAt: timestamp }),
      ...(status === 'failed' && error && { error }),
    };

    // Update current step if in progress
    if (status === 'in_progress') {
      provisioningStatus.currentStep = stepName;
    }

    // Auto-update started_at if first step starts
    if (status === 'in_progress' && !provisioningStatus.startedAt) {
      provisioningStatus.startedAt = new Date();
    }

    const updated = await this.provisioningStatusRepository.save(provisioningStatus);
    this.logger.log(`Step ${stepName} updated to ${status} for project ${projectId}`);

    return updated;
  }

  /**
   * Update overall provisioning status
   * @param projectId - Project ID
   * @param status - New overall status
   * @param errorMessage - Optional error message if failed
   * @returns Updated provisioning status
   */
  async updateOverallStatus(
    projectId: string,
    status: ProvisioningStatusEnum,
    errorMessage?: string,
  ): Promise<ProvisioningStatus> {
    const provisioningStatus = await this.findByProjectId(projectId);

    if (!provisioningStatus) {
      throw new NotFoundException(`Provisioning status not found for project ${projectId}`);
    }

    provisioningStatus.status = status;

    // Set completed_at if status is completed or failed
    if (status === ProvisioningStatusEnum.COMPLETED || status === ProvisioningStatusEnum.FAILED) {
      provisioningStatus.completedAt = new Date();
    }

    // Set error message if provided
    if (errorMessage) {
      provisioningStatus.errorMessage = errorMessage;
    }

    const updated = await this.provisioningStatusRepository.save(provisioningStatus);
    this.logger.log(`Overall status updated to ${status} for project ${projectId}`);

    return updated;
  }

  /**
   * Delete provisioning status by project ID
   * Used for cleanup operations
   * @param projectId - Project ID
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.provisioningStatusRepository.delete({ projectId });
    this.logger.log(`Provisioning status deleted for project ${projectId}`);
  }
}
