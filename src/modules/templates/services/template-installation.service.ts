/**
 * TemplateInstallationService
 *
 * Story 19-6: Template Installation Flow
 *
 * Main orchestration service for installing templates into workspaces.
 * Coordinates scaffolding, project creation, GitHub integration, and usage tracking.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { Template } from '../../../database/entities/template.entity';
import { TemplateInstallation, InstallationStatus, InstallationStep } from '../../../database/entities/template-installation.entity';
import { Project } from '../../../database/entities/project.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { TemplateScaffoldingService, ProcessedFile } from './template-scaffolding.service';
import { TemplateAuditService } from './template-audit.service';
import { TemplatesGateway } from '../gateways/templates.gateway';
import { InstallTemplateDto, InstallationJobDto, InstallationListQueryDto, InstallationListDto } from '../dto/install-template.dto';

/**
 * Installation job data for BullMQ
 */
export interface InstallationJobData {
  installationId: string;
  templateId: string;
  workspaceId: string;
  userId: string;
  projectName: string;
  variables: Record<string, unknown>;
  githubRepoId?: number;
  createNewRepo: boolean;
  repoName: string;
  repoPrivate: boolean;
  repoDescription?: string;
  skipPostInstall: boolean;
}

/**
 * Result of an installation job
 */
export interface InstallationResult {
  success: boolean;
  projectId?: string;
  projectUrl?: string;
  githubRepoUrl?: string;
  error?: string;
}

@Injectable()
export class TemplateInstallationService {
  private readonly logger = new Logger(TemplateInstallationService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(TemplateInstallation)
    private readonly installationRepository: Repository<TemplateInstallation>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly scaffoldingService: TemplateScaffoldingService,
    private readonly auditService: TemplateAuditService,
    private readonly webSocketGateway: TemplatesGateway,
    private readonly dataSource: DataSource,
    @InjectQueue('installation')
    private readonly installationQueue: Queue,
  ) {}

  /**
   * Start a template installation.
   * Validates access, creates installation record, and queues the job.
   */
  async startInstallation(
    userId: string,
    templateId: string,
    dto: InstallTemplateDto,
  ): Promise<{ jobId: string; status: string; message: string; statusUrl: string }> {
    // Validate template exists
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${templateId}' not found`);
    }

    // Validate workspace access
    const membership = await this.workspaceMemberRepository.findOne({
      where: { workspaceId: dto.workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this workspace');
    }

    // Validate project name uniqueness
    const existingProject = await this.projectRepository.findOne({
      where: { workspaceId: dto.workspaceId, name: dto.projectName },
    });

    if (existingProject) {
      throw new BadRequestException(
        `Project with name '${dto.projectName}' already exists in this workspace`,
      );
    }

    // Validate variables against template definition
    const validation = this.scaffoldingService.validateVariables(template, dto.variables);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Variable validation failed',
        errors: validation.errors,
      });
    }

    // Create installation record
    const installation = this.installationRepository.create({
      templateId,
      workspaceId: dto.workspaceId,
      userId,
      projectName: dto.projectName,
      variables: validation.resolved,
      status: InstallationStatus.PENDING,
      currentStep: InstallationStep.INITIALIZED,
      progress: 0,
      createNewRepo: dto.createNewRepo ?? true,
      repoPrivate: dto.repoPrivate ?? true,
      repoName: dto.repoName || dto.projectName,
      skipPostInstall: dto.skipPostInstall ?? false,
      githubRepoId: dto.githubRepoId,
    });

    const savedInstallation = await this.installationRepository.save(installation);

    // Queue the installation job
    const jobData: InstallationJobData = {
      installationId: savedInstallation.id,
      templateId,
      workspaceId: dto.workspaceId,
      userId,
      projectName: dto.projectName,
      variables: validation.resolved,
      githubRepoId: dto.githubRepoId,
      createNewRepo: dto.createNewRepo ?? true,
      repoName: dto.repoName || dto.projectName,
      repoPrivate: dto.repoPrivate ?? true,
      repoDescription: dto.repoDescription,
      skipPostInstall: dto.skipPostInstall ?? false,
    };

    try {
      await this.installationQueue.add('install', jobData, {
        jobId: savedInstallation.id,
        attempts: 1, // Don't retry installations automatically
        timeout: 600000, // 10 minutes
      });
    } catch (queueError) {
      // Rollback installation record if queue operation fails
      await this.installationRepository.delete(savedInstallation.id);
      throw new BadRequestException('Failed to queue installation job. Please try again.');
    }

    // Emit started event
    this.webSocketGateway.emitInstallationStarted(savedInstallation.id, {
      installationId: savedInstallation.id,
      templateId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return {
      jobId: savedInstallation.id,
      status: InstallationStatus.PENDING,
      message: 'Installation started',
      statusUrl: `/api/v1/installations/${savedInstallation.id}`,
    };
  }

  /**
   * Process an installation job (called by BullMQ worker).
   */
  async processInstallationJob(job: Job<InstallationJobData>): Promise<InstallationResult> {
    const data = job.data;
    const installationId = data.installationId;

    this.logger.log(`Processing installation job ${installationId}`);

    try {
      // Check if installation was cancelled before we started
      const currentInstallation = await this.installationRepository.findOne({
        where: { id: installationId },
      });
      if (currentInstallation?.status === InstallationStatus.CANCELLED) {
        this.logger.log(`Installation ${installationId} was cancelled, skipping processing`);
        return { success: false, error: 'Installation was cancelled' };
      }

      // Update status: FETCHING
      await this.updateStatus(installationId, InstallationStatus.FETCHING, InstallationStep.FETCHING_SOURCE, 5);

      // Get template
      const template = await this.scaffoldingService.getTemplate(data.templateId);

      // Fetch source files
      const sourceFiles = await this.scaffoldingService.fetchSourceFiles(template, (step, percent) => {
        job.updateProgress(percent);
      });

      await this.updateStatus(installationId, InstallationStatus.PROCESSING, InstallationStep.PROCESSING_FILES, 20);
      await job.updateProgress(20);

      // Process files with variable substitution
      const processedFiles = await this.scaffoldingService.processFiles(
        sourceFiles,
        data.variables,
        template,
      );

      // Update total files count
      await this.installationRepository.update(installationId, {
        totalFiles: processedFiles.length,
        processedFiles: 0,
      });

      await this.updateStatus(installationId, InstallationStatus.PROCESSING, InstallationStep.VALIDATING_VARIABLES, 40);
      await job.updateProgress(40);

      // For now, simulate repository creation and project creation
      // In production, this would integrate with GitHubService
      const githubRepoUrl = `https://github.com/user/${data.repoName}`;

      await this.updateStatus(installationId, InstallationStatus.CREATING_REPO, InstallationStep.CREATING_REPOSITORY, 50);
      await job.updateProgress(50);

      // Create project entity
      await this.updateStatus(installationId, InstallationStatus.PUSHING, InstallationStep.CREATING_PROJECT, 60);
      await job.updateProgress(60);

      // Use transaction for project creation and installation update
      const project = await this.dataSource.transaction(async (manager) => {
        const newProject = manager.create(Project, {
          name: data.projectName,
          description: `Created from template`,
          workspaceId: data.workspaceId,
          createdByUserId: data.userId,
          templateId: data.templateId,
          githubRepoUrl,
          status: 'active' as any,
        });

        const savedProject = await manager.save(newProject);

        await manager.update(TemplateInstallation, installationId, {
          projectId: savedProject.id,
          githubRepoUrl,
        });

        return savedProject;
      });

      await this.updateStatus(installationId, InstallationStatus.PUSHING, InstallationStep.PUSHING_FILES, 70);
      await job.updateProgress(70);

      // Run post-install scripts if not skipped
      const postInstallScripts = (template.definition as any)?.post_install || [];
      if (postInstallScripts.length > 0 && !data.skipPostInstall) {
        await this.updateStatus(installationId, InstallationStatus.RUNNING_SCRIPTS, InstallationStep.RUNNING_POST_INSTALL, 80);
        await job.updateProgress(80);

        // Post-install would be handled by PostInstallService
        // For now, just log it
        this.logger.log(`Running ${postInstallScripts.length} post-install scripts for installation ${installationId}`);
      }

      // Record usage
      await this.updateStatus(installationId, InstallationStatus.RUNNING_SCRIPTS, InstallationStep.RECORDING_USAGE, 90);
      await job.updateProgress(90);

      await this.recordTemplateUsage(data.templateId, data.workspaceId, project.id, template.version);

      // Complete
      await this.updateStatus(installationId, InstallationStatus.COMPLETE, InstallationStep.COMPLETED, 100);
      await job.updateProgress(100);

      // Emit completion
      this.webSocketGateway.emitInstallationComplete(installationId, {
        installationId,
        projectId: project.id,
        projectUrl: githubRepoUrl,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        projectId: project.id,
        projectUrl: githubRepoUrl,
        githubRepoUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Installation job ${installationId} failed:`, errorMessage, errorStack);

      // Update status to failed
      await this.installationRepository.update(installationId, {
        status: InstallationStatus.FAILED,
        error: errorMessage,
        completedAt: new Date(),
      });

      // Emit error
      this.webSocketGateway.emitInstallationFailed(installationId, {
        installationId,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Get installation status by ID.
   */
  async getInstallationStatus(installationId: string, userId: string): Promise<InstallationJobDto> {
    const installation = await this.installationRepository.findOne({
      where: { id: installationId },
      relations: ['template', 'project'],
    });

    if (!installation) {
      throw new NotFoundException(`Installation with ID '${installationId}' not found`);
    }

    // Verify user owns this installation
    if (installation.userId !== userId) {
      throw new ForbiddenException('You do not have access to this installation');
    }

    return this.mapToDto(installation);
  }

  /**
   * List installations for a user/workspace.
   */
  async listInstallations(
    userId: string,
    workspaceId: string,
    query: InstallationListQueryDto,
  ): Promise<InstallationListDto> {
    const qb = this.installationRepository
      .createQueryBuilder('installation')
      .where('installation.userId = :userId', { userId })
      .andWhere('installation.workspaceId = :workspaceId', { workspaceId })
      .orderBy('installation.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('installation.status = :status', { status: query.status });
    }

    if (query.templateId) {
      qb.andWhere('installation.templateId = :templateId', { templateId: query.templateId });
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((query.page! - 1) * query.limit!)
      .take(query.limit)
      .getMany();

    return {
      items: items.map((i) => this.mapToDto(i)),
      total,
      page: query.page!,
      limit: query.limit!,
    };
  }

  /**
   * Cancel an in-progress installation.
   */
  async cancelInstallation(installationId: string, userId: string): Promise<void> {
    const installation = await this.installationRepository.findOne({
      where: { id: installationId },
    });

    if (!installation) {
      throw new NotFoundException(`Installation with ID '${installationId}' not found`);
    }

    if (installation.userId !== userId) {
      throw new ForbiddenException('You do not have access to this installation');
    }

    // Can only cancel pending or in-progress installations
    if (![InstallationStatus.PENDING, InstallationStatus.FETCHING, InstallationStatus.PROCESSING].includes(installation.status)) {
      throw new BadRequestException(`Cannot cancel installation in ${installation.status} status`);
    }

    // Use atomic update to prevent race condition - only cancel if still in cancellable state
    const result = await this.installationRepository.update(
      {
        id: installationId,
        status: In([InstallationStatus.PENDING, InstallationStatus.FETCHING, InstallationStatus.PROCESSING]),
      },
      {
        status: InstallationStatus.CANCELLED,
        completedAt: new Date(),
      },
    );

    // Check if the update actually happened (affected count > 0)
    if ((result as any).affected === 0) {
      throw new BadRequestException('Installation was already completed or modified');
    }

    // Get the job and remove it (safe even if job already processed)
    const job = await this.installationQueue.getJob(installationId);
    if (job) {
      await job.remove();
    }

    this.logger.log(`Installation ${installationId} cancelled by user ${userId}`);
  }

  /**
   * Delete an installation record (cleanup).
   */
  async deleteInstallation(installationId: string, userId: string): Promise<void> {
    const installation = await this.installationRepository.findOne({
      where: { id: installationId },
    });

    if (!installation) {
      throw new NotFoundException(`Installation with ID '${installationId}' not found`);
    }

    if (installation.userId !== userId) {
      throw new ForbiddenException('You do not have access to this installation');
    }

    // Only allow deleting completed, failed, or cancelled installations
    if (![InstallationStatus.COMPLETE, InstallationStatus.FAILED, InstallationStatus.CANCELLED].includes(installation.status)) {
      throw new BadRequestException('Cannot delete an in-progress installation');
    }

    await this.installationRepository.remove(installation);
    this.logger.log(`Installation ${installationId} deleted by user ${userId}`);
  }

  /**
   * Update installation status and emit progress.
   */
  private async updateStatus(
    installationId: string,
    status: InstallationStatus,
    step: InstallationStep,
    progress: number,
  ): Promise<void> {
    await this.installationRepository.update(installationId, {
      status,
      currentStep: step,
      progress,
    });

    // Emit progress event
    this.webSocketGateway.emitInstallationProgress(installationId, {
      installationId,
      status,
      step,
      progress,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record template usage for tracking and analytics.
   */
  private async recordTemplateUsage(
    templateId: string,
    workspaceId: string,
    projectId: string,
    version: string,
  ): Promise<void> {
    // Increment template usage count
    await this.templateRepository
      .createQueryBuilder()
      .update(Template)
      .set({
        totalUses: () => 'total_uses + 1',
      })
      .where('id = :id', { id: templateId })
      .execute();

    // Log usage
    await this.auditService.logTemplateUsed(workspaceId, templateId, projectId);

    this.logger.log(`Recorded usage for template ${templateId} in project ${projectId}`);
  }

  /**
   * Map entity to DTO.
   */
  private mapToDto(installation: TemplateInstallation): InstallationJobDto {
    return {
      id: installation.id,
      templateId: installation.templateId,
      workspaceId: installation.workspaceId,
      projectName: installation.projectName,
      status: installation.status,
      currentStep: installation.currentStep,
      progress: installation.progress,
      error: installation.error || null,
      githubRepoUrl: installation.githubRepoUrl || null,
      projectId: installation.projectId || null,
      totalFiles: installation.totalFiles,
      processedFiles: installation.processedFiles,
      createdAt: installation.createdAt.toISOString(),
      completedAt: installation.completedAt?.toISOString() || null,
    };
  }
}
