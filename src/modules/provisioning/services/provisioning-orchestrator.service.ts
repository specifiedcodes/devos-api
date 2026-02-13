import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProvisioningStatusService } from './provisioning-status.service';
import { ProvisioningStatusEnum } from '../../../database/entities/provisioning-status.entity';
import { Project, ProjectStatus } from '../../../database/entities/project.entity';
import { GitHubService } from '../../integrations/github/github.service';
import { IntegrationConnectionService } from '../../integrations/integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';

/**
 * ProvisioningOrchestratorService
 *
 * Orchestrates multi-step provisioning workflow during project creation
 * - Coordinates GitHub repo creation, database provisioning, deployment setup, and project initialization
 * - Manages state transitions and error handling
 * - Story 6.2: Real GitHub API integration for repo creation (replaces placeholder)
 * - Placeholder logic for database and deployment provisioning (Epic 6 stories)
 * - Actual logic for project initialization
 *
 * Part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 * Updated in Story 6.2: GitHub Repository Creation
 */
@Injectable()
export class ProvisioningOrchestratorService {
  private readonly logger = new Logger(ProvisioningOrchestratorService.name);

  constructor(
    private readonly provisioningStatusService: ProvisioningStatusService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly gitHubService: GitHubService,
    private readonly integrationConnectionService: IntegrationConnectionService,
  ) {}

  /**
   * Start provisioning workflow for a project
   * Executes all provisioning steps sequentially
   *
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID
   * @param preferences - Project preferences (for future Epic 6 integrations)
   */
  async startProvisioning(
    projectId: string,
    workspaceId: string,
    preferences: any,
  ): Promise<void> {
    this.logger.log(`Starting provisioning for project ${projectId}`);

    try {
      // Create provisioning status record
      await this.provisioningStatusService.createProvisioningStatus(projectId, workspaceId);

      // Update overall status to in_progress
      await this.provisioningStatusService.updateOverallStatus(
        projectId,
        ProvisioningStatusEnum.IN_PROGRESS,
      );

      // Execute steps sequentially
      const steps = [
        { name: 'github_repo_created', executor: () => this.executeGitHubRepoCreation(projectId) },
        { name: 'database_provisioned', executor: () => this.executeDatabaseProvisioning(projectId) },
        { name: 'deployment_configured', executor: () => this.executeDeploymentConfiguration(projectId) },
        { name: 'project_initialized', executor: () => this.executeProjectInitialization(projectId) },
      ];

      for (const step of steps) {
        try {
          // Mark step as in_progress
          await this.provisioningStatusService.updateStepStatus(
            projectId,
            step.name as any,
            'in_progress',
          );

          // Execute step
          await step.executor();

          this.logger.log(`Step ${step.name} completed for project ${projectId}`);
        } catch (error) {
          this.logger.error(
            `Step ${step.name} failed for project ${projectId}`,
            error instanceof Error ? error.stack : String(error),
          );

          // Handle step failure
          await this.handleStepFailure(projectId, step.name, error);

          // Update overall status to failed and stop workflow
          await this.provisioningStatusService.updateOverallStatus(
            projectId,
            ProvisioningStatusEnum.FAILED,
            `Provisioning failed at step ${step.name}: ${error instanceof Error ? error.message : String(error)}`,
          );

          return; // Stop workflow
        }
      }

      // All steps succeeded - mark as completed
      await this.provisioningStatusService.updateOverallStatus(
        projectId,
        ProvisioningStatusEnum.COMPLETED,
      );

      this.logger.log(`Provisioning completed successfully for project ${projectId}`);
    } catch (error) {
      this.logger.error(
        `Provisioning workflow failed for project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Try to update overall status to failed
      try {
        await this.provisioningStatusService.updateOverallStatus(
          projectId,
          ProvisioningStatusEnum.FAILED,
          `Critical provisioning error: ${error instanceof Error ? error.message : String(error)}`,
        );
      } catch (updateError) {
        this.logger.error(
          `Failed to update provisioning status after error`,
          updateError instanceof Error ? updateError.stack : String(updateError),
        );
      }
    }
  }

  /**
   * Execute GitHub repository creation
   * Story 6.2: Real GitHub API integration (replaces placeholder)
   *
   * Flow:
   * 1. Load project from database to get project name and description
   * 2. Check if workspace has an active GitHub integration
   * 3. If no GitHub integration: skip gracefully (GitHub is optional)
   * 4. If connected: sanitize name, create repo, update project with repo URL
   * 5. On failure: log error, mark step as failed, don't block remaining steps
   *
   * @param projectId - Project ID
   */
  async executeGitHubRepoCreation(projectId: string): Promise<void> {
    this.logger.log(`Creating GitHub repository for project ${projectId}`);

    try {
      // 1. Load project from database
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // 2. Check if workspace has an active GitHub integration
      let token: string;
      try {
        token = await this.integrationConnectionService.getDecryptedToken(
          project.workspaceId,
          IntegrationProvider.GITHUB,
        );
      } catch (error) {
        if (error instanceof NotFoundException) {
          // 3. No GitHub integration connected: skip gracefully
          this.logger.log(
            `No GitHub integration connected for workspace ${project.workspaceId.substring(0, 8)}... - skipping repo creation`,
          );
          await this.provisioningStatusService.updateStepStatus(
            projectId,
            'github_repo_created',
            'completed',
          );
          return;
        }
        throw error;
      }

      // 4. Sanitize project name for GitHub
      // Replace invalid chars, collapse consecutive hyphens, trim leading/trailing hyphens and dots
      let sanitizedName = project.name
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/--+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .substring(0, 100);

      // Fallback if sanitization results in empty string
      if (!sanitizedName) {
        sanitizedName = `project-${projectId.substring(0, 8)}`;
      }

      // Create repository via GitHub API
      const repo = await this.gitHubService.createRepository(token, sanitizedName, {
        description: project.description || undefined,
        private: true,
        autoInit: true,
        gitignoreTemplate: 'Node',
      });

      // Update project with GitHub repo URL
      await this.projectRepository.update(projectId, {
        githubRepoUrl: repo.htmlUrl,
      });

      this.logger.log(
        `GitHub repository created for project ${projectId}: ${repo.fullName} (${repo.htmlUrl})`,
      );

      // Mark step as completed
      await this.provisioningStatusService.updateStepStatus(
        projectId,
        'github_repo_created',
        'completed',
      );
    } catch (error) {
      // Story 6.2 Code Review Fix: Don't re-throw - GitHub repo creation is optional
      // and should not block remaining provisioning steps (AC #3, point 5)
      this.logger.error(
        `GitHub repo creation failed for project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.provisioningStatusService.updateStepStatus(
        projectId,
        'github_repo_created',
        'failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Execute database provisioning (PLACEHOLDER for Epic 6)
   * TODO Epic 6: Replace with actual database provisioning
   *
   * @param projectId - Project ID
   */
  async executeDatabaseProvisioning(projectId: string): Promise<void> {
    this.logger.log(`[PLACEHOLDER] Provisioning database for project ${projectId}`);

    // Epic 6: Replace with actual database provisioning
    // - Call Supabase or Railway API to create database
    // - Use workspace's Supabase/Railway OAuth token
    // - Database name from project.name (sanitized)
    // - Initialize schema with migrations
    // - Store connection string in project.database_url

    // Placeholder: Simulate 2-second delay
    await this.delay(2000);

    // Mark step as completed
    await this.provisioningStatusService.updateStepStatus(
      projectId,
      'database_provisioned',
      'completed',
    );
  }

  /**
   * Execute deployment platform configuration (PLACEHOLDER for Epic 6)
   * TODO Epic 6: Replace with actual deployment platform integration
   *
   * @param projectId - Project ID
   */
  async executeDeploymentConfiguration(projectId: string): Promise<void> {
    this.logger.log(`[PLACEHOLDER] Configuring deployment for project ${projectId}`);

    // Epic 6: Replace with actual deployment platform integration
    // - Call Railway or Vercel API to configure deployment
    // - Use workspace's Railway/Vercel OAuth token
    // - Project name from project.name (sanitized)
    // - Configure environment variables (DATABASE_URL, API keys)
    // - Set up automatic deployments from GitHub

    // Placeholder: Simulate 2-second delay
    await this.delay(2000);

    // Mark step as completed
    await this.provisioningStatusService.updateStepStatus(
      projectId,
      'deployment_configured',
      'completed',
    );
  }

  /**
   * Execute project initialization (ACTUAL LOGIC)
   * Updates project status to 'active' and creates default Kanban columns
   *
   * @param projectId - Project ID
   * Story 4.7 Issue #2 Fix: Implemented actual project initialization
   */
  async executeProjectInitialization(projectId: string): Promise<void> {
    this.logger.log(`Initializing project ${projectId}`);

    try {
      // 1. Update project status to 'active' in projects table
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Update project status and initialized_at timestamp
      await this.projectRepository.update(projectId, {
        status: ProjectStatus.ACTIVE,
        // Note: initialized_at will be set if the column exists
        // If it doesn't exist yet, this will be ignored gracefully
      });

      this.logger.log(`Project ${projectId} status updated to active`);

      // 2. Create default Kanban columns
      // TODO Epic 7: Kanban entities don't exist yet, will be implemented in Epic 7 (Visual Project Management)
      // When Epic 7 is implemented, inject KanbanColumnRepository and create columns:
      // const columns = ['Backlog', 'In Progress', 'Review', 'Done'];
      // for (let i = 0; i < columns.length; i++) {
      //   await this.kanbanColumnsRepository.save({
      //     project_id: projectId,
      //     name: columns[i],
      //     position: i,
      //   });
      // }

      // 3. Mark step as completed
      await this.provisioningStatusService.updateStepStatus(
        projectId,
        'project_initialized',
        'completed',
      );

      this.logger.log(`Project ${projectId} initialization completed`);
    } catch (error) {
      this.logger.error(
        `Project initialization failed for ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Handle step failure
   * Logs error and updates step status to failed
   *
   * @param projectId - Project ID
   * @param stepName - Name of the failed step
   * @param error - Error that occurred
   */
  async handleStepFailure(projectId: string, stepName: string, error: any): Promise<void> {
    this.logger.error(
      `Step ${stepName} failed for project ${projectId}`,
      error instanceof Error ? error.stack : String(error),
    );

    // Update step status to failed with error message
    await this.provisioningStatusService.updateStepStatus(
      projectId,
      stepName as any,
      'failed',
      error instanceof Error ? error.message : String(error),
    );
  }

  /**
   * Utility: Delay execution for specified milliseconds
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry a failed provisioning step with exponential backoff
   * Story 4.7 Issue #3 Fix: Implemented retry logic
   *
   * @param projectId - Project ID
   * @param stepName - Name of the step to retry
   */
  async retryFailedStep(projectId: string, stepName: string): Promise<void> {
    this.logger.log(`Retrying step ${stepName} for project ${projectId}`);

    const maxAttempts = 3;
    const delays = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        this.logger.log(
          `Retry attempt ${attempt + 1}/${maxAttempts} for step ${stepName}`,
        );

        // Reset step to in_progress
        await this.provisioningStatusService.updateStepStatus(
          projectId,
          stepName as any,
          'in_progress',
        );

        // Execute the step based on step name
        switch (stepName) {
          case 'github_repo_created':
            await this.executeGitHubRepoCreation(projectId);
            break;
          case 'database_provisioned':
            await this.executeDatabaseProvisioning(projectId);
            break;
          case 'deployment_configured':
            await this.executeDeploymentConfiguration(projectId);
            break;
          case 'project_initialized':
            await this.executeProjectInitialization(projectId);
            break;
          default:
            throw new Error(`Unknown step name: ${stepName}`);
        }

        // If successful, log and return
        this.logger.log(
          `Step ${stepName} succeeded on retry attempt ${attempt + 1}`,
        );
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Retry attempt ${attempt + 1}/${maxAttempts} failed for step ${stepName}: ${errorMessage}`,
        );

        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts - 1) {
          await this.delay(delays[attempt]);
        } else {
          // Max attempts reached - mark as permanent failure
          this.logger.error(
            `All ${maxAttempts} retry attempts failed for step ${stepName}`,
          );
          await this.handleStepFailure(projectId, stepName, error);
          throw new Error(
            `Step ${stepName} failed after ${maxAttempts} retry attempts: ${errorMessage}`,
          );
        }
      }
    }
  }
}
