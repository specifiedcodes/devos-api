import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  OnboardingStatus,
  OnboardingStatusEnum,
} from '../../../database/entities/onboarding-status.entity';
import { OnboardingStatusResponseDto } from '../dto/onboarding-status-response.dto';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { AnalyticsEventsService } from '../../analytics/services/analytics-events.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  // Step ordering configuration
  private readonly STEP_CONFIG = {
    accountCreated: { order: 1, required: true },
    githubConnected: { order: 2, required: false },
    deploymentConfigured: { order: 2, required: false },
    databaseConfigured: { order: 2, required: false },
    aiKeyAdded: { order: 2, required: true },
    firstProjectCreated: { order: 3, required: true },
    tutorialCompleted: { order: 4, required: false },
  };

  constructor(
    @InjectRepository(OnboardingStatus)
    private readonly onboardingRepository: Repository<OnboardingStatus>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly analyticsEventsService: AnalyticsEventsService,
  ) {}

  /**
   * Create onboarding status for a new user
   * Idempotent: returns existing record if already exists
   * Uses transaction to prevent race conditions
   */
  async createOnboardingStatus(
    userId: string,
    workspaceId: string,
  ): Promise<OnboardingStatus> {
    // Use transaction to prevent duplicate creation under race conditions (Issue #7)
    return await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OnboardingStatus);

      // Check if onboarding status already exists (idempotent)
      const existing = await repo.findOne({
        where: { userId, workspaceId },
      });

      if (existing) {
        this.logger.log(
          `Onboarding status already exists for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
        );
        return existing;
      }

      // Create new onboarding status
      const onboarding = repo.create({
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        currentStep: 'service_connections',
        startedAt: new Date(),
      });

      const saved = await repo.save(onboarding);

      // Audit log: onboarding started (Issue #1)
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.ONBOARDING_STARTED,
        'onboarding_status',
        saved.id,
        {
          currentStep: saved.currentStep,
          status: saved.status,
        },
      );

      // Analytics: Log onboarding started event
      await this.analyticsEventsService.logEvent(
        userId,
        workspaceId,
        'onboarding_started',
        {},
      );

      this.logger.log(
        `Created onboarding status for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
      );

      return saved;
    });
  }

  /**
   * Get onboarding status with computed fields
   */
  async getOnboardingStatus(
    userId: string,
    workspaceId: string,
  ): Promise<OnboardingStatusResponseDto> {
    const onboarding = await this.onboardingRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!onboarding) {
      throw new NotFoundException(
        `Onboarding status not found for user ${userId} in workspace ${workspaceId}`,
      );
    }

    return this.buildResponseDto(onboarding);
  }

  /**
   * Update a specific onboarding step
   * Uses transaction with pessimistic locking to prevent race conditions (Issue #3)
   */
  async updateStep(
    userId: string,
    workspaceId: string,
    stepName: keyof Omit<
      OnboardingStatus,
      | 'id'
      | 'userId'
      | 'workspaceId'
      | 'status'
      | 'currentStep'
      | 'startedAt'
      | 'completedAt'
      | 'createdAt'
      | 'updatedAt'
      | 'user'
      | 'workspace'
    >,
    value: boolean,
  ): Promise<OnboardingStatus> {
    // Use transaction with pessimistic lock to prevent concurrent modification (Issue #3)
    return await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OnboardingStatus);

      const onboarding = await repo.findOne({
        where: { userId, workspaceId },
        lock: { mode: 'pessimistic_write' }, // Lock row for update
      });

      if (!onboarding) {
        throw new NotFoundException(
          `Onboarding status not found for user ${userId} in workspace ${workspaceId}`,
        );
      }

      const previousStatus = onboarding.status;
      const previousValue = onboarding[stepName];

      // Update the step
      onboarding[stepName] = value;

      // Compute next current step and completion status
      this.updateProgressState(onboarding);

      const saved = await repo.save(onboarding);

      // Analytics: Log step completion event (only when step changes false -> true)
      if (previousValue === false && value === true) {
        const timeFromStart = onboarding.startedAt
          ? Date.now() - onboarding.startedAt.getTime()
          : 0;

        await this.analyticsEventsService.logEvent(
          userId,
          workspaceId,
          'onboarding_step_completed',
          {
            stepName,
            previousValue,
            newValue: value,
            timeFromStart,
          },
        );
      }

      // Audit log: step updated (Issue #1)
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.ONBOARDING_STEP_UPDATED,
        'onboarding_status',
        saved.id,
        {
          stepName,
          value,
          currentStep: saved.currentStep,
          status: saved.status,
        },
      );

      // Audit log: onboarding completed if status changed (Issue #1)
      if (
        previousStatus !== OnboardingStatusEnum.COMPLETED &&
        saved.status === OnboardingStatusEnum.COMPLETED
      ) {
        await this.auditService.log(
          workspaceId,
          userId,
          AuditAction.ONBOARDING_COMPLETED,
          'onboarding_status',
          saved.id,
          {
            completedAt: saved.completedAt,
            completionPercentage: 100,
          },
        );

        // Analytics: Log onboarding completed event
        await this.analyticsEventsService.logEvent(
          userId,
          workspaceId,
          'onboarding_completed',
          {},
        );
      }

      this.logger.log(
        `Updated onboarding step ${stepName}=${value} for user ${userId.substring(0, 8)}... (new currentStep: ${saved.currentStep}, status: ${saved.status})`,
      );

      return saved;
    });
  }

  /**
   * Update progress state: currentStep, status, and completedAt
   */
  private updateProgressState(onboarding: OnboardingStatus): void {
    // Check if all required steps are complete
    const requiredStepsComplete =
      onboarding.accountCreated &&
      onboarding.aiKeyAdded &&
      onboarding.firstProjectCreated;

    if (requiredStepsComplete) {
      // Mark as completed
      onboarding.status = OnboardingStatusEnum.COMPLETED;
      if (!onboarding.completedAt) {
        onboarding.completedAt = new Date();
      }
      // After completion, guide to tutorial if not done
      onboarding.currentStep = onboarding.tutorialCompleted
        ? 'completed'
        : 'tutorial';
    } else {
      // Determine current step based on what's incomplete
      if (!onboarding.aiKeyAdded) {
        onboarding.currentStep = 'service_connections';
      } else if (!onboarding.firstProjectCreated) {
        onboarding.currentStep = 'create_project';
      } else {
        // This shouldn't happen if requiredStepsComplete logic is correct
        onboarding.currentStep = 'tutorial';
      }

      // Ensure status is in_progress if not completed
      if (onboarding.status !== OnboardingStatusEnum.IN_PROGRESS) {
        onboarding.status = OnboardingStatusEnum.IN_PROGRESS;
      }
    }
  }

  /**
   * Build response DTO with computed fields
   */
  private buildResponseDto(
    onboarding: OnboardingStatus,
  ): OnboardingStatusResponseDto {
    const steps = {
      accountCreated: onboarding.accountCreated,
      githubConnected: onboarding.githubConnected,
      deploymentConfigured: onboarding.deploymentConfigured,
      databaseConfigured: onboarding.databaseConfigured,
      aiKeyAdded: onboarding.aiKeyAdded,
      firstProjectCreated: onboarding.firstProjectCreated,
      tutorialCompleted: onboarding.tutorialCompleted,
    };

    // Calculate completion percentage
    const totalSteps = Object.keys(steps).length;
    const completedSteps = Object.values(steps).filter(Boolean).length;
    const completionPercentage = Math.round(
      (completedSteps / totalSteps) * 100,
    );

    // Determine next step
    let nextStep = onboarding.currentStep;
    if (onboarding.status === OnboardingStatusEnum.COMPLETED) {
      nextStep = onboarding.tutorialCompleted ? 'completed' : 'tutorial';
    } else {
      if (!onboarding.aiKeyAdded) {
        nextStep = 'service_connections';
      } else if (!onboarding.firstProjectCreated) {
        nextStep = 'create_project';
      } else {
        nextStep = 'tutorial';
      }
    }

    return {
      id: onboarding.id,
      userId: onboarding.userId,
      workspaceId: onboarding.workspaceId,
      status: onboarding.status,
      steps,
      currentStep: onboarding.currentStep,
      nextStep,
      completionPercentage,
      isComplete: onboarding.status === OnboardingStatusEnum.COMPLETED,
      startedAt: onboarding.startedAt,
      completedAt: onboarding.completedAt,
    };
  }
}
