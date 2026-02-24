/**
 * ScaffoldProcessor
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * BullMQ processor for scaffolding jobs.
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import { TemplateScaffoldingService, ScaffoldJobData, ScaffoldJobStatus } from '../services/template-scaffolding.service';
import { PostInstallService } from '../services/post-install.service';
import { TemplateAuditService } from '../services/template-audit.service';
import { TemplatesGateway } from '../gateways/templates.gateway';

@Processor('scaffold')
export class ScaffoldProcessor {
  private readonly logger = new Logger(ScaffoldProcessor.name);

  constructor(
    @Inject(forwardRef(() => TemplateScaffoldingService))
    private readonly scaffoldingService: TemplateScaffoldingService,
    private readonly postInstallService: PostInstallService,
    private readonly auditService: TemplateAuditService,
    private readonly webSocketGateway: TemplatesGateway,
  ) {}

  @Process('scaffold')
  async process(job: Job<ScaffoldJobData>): Promise<any> {
    const data = job.data;

    this.logger.log(`Processing scaffold job ${data.id}`);

    try {
      // Step 1: Update status to FETCHING (10%)
      await this.updateProgress(job, ScaffoldJobStatus.FETCHING, 'Fetching template source', 10);

      // Get the template first
      const template = await this.scaffoldingService.getTemplate(data.templateId);

      // Step 2: Fetch source files (10-30%)
      await this.updateProgress(job, ScaffoldJobStatus.FETCHING, 'Fetching template files', 20);

      // Step 3: Process the scaffolding job (30-60%)
      await this.updateProgress(job, ScaffoldJobStatus.PROCESSING, 'Processing template', 30);
      const result = await this.scaffoldingService.processScaffoldJob(job);
      await this.updateProgress(job, ScaffoldJobStatus.PROCESSING, 'Processing files complete', 60);

      // Step 4: Push to GitHub (60-80%)
      await this.updateProgress(job, ScaffoldJobStatus.INSTALLING, 'Pushing to GitHub', 70);

      // Step 5: Run post-install scripts (80-95%)
      const postInstallScripts = (template.definition as any)?.post_install || [];

      if (postInstallScripts.length > 0 && !data.skipPostInstall) {
        await this.updateProgress(job, ScaffoldJobStatus.INSTALLING, 'Running post-install scripts', 85);

        const postInstallResult = await this.postInstallService.executeScripts(
          postInstallScripts,
          {
            workspaceId: data.workspaceId,
            projectId: data.projectName,
            files: result.files || [],
            secrets: {},
          },
        );

        if (!postInstallResult.success) {
          throw new Error(`Post-install failed: ${postInstallResult.error}`);
        }
      }

      // Step 6: Complete (100%)
      await this.updateProgress(job, ScaffoldJobStatus.COMPLETE, 'Complete', 100);

      // Step 7: Audit log
      await this.auditService.logTemplateUsed(
        data.workspaceId,
        data.templateId,
        data.projectName,
      );

      return {
        success: true,
        projectId: data.projectName,
        projectUrl: `https://github.com/user/${data.projectName}`,
        fileCount: result.files?.length || 0,
      };
    } catch (error) {
      this.logger.error(`Scaffold job ${data.id} failed:`, error);
      throw error;
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<ScaffoldJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed:`, error.message);

    await this.updateProgress(job, ScaffoldJobStatus.FAILED, error.message, job.progress() as number);

    // Emit error via WebSocket
    this.webSocketGateway.emitError(job.data.id, {
      jobId: job.data.id,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<ScaffoldJobData>, result: any) {
    this.logger.log(`Job ${job.id} completed`);

    // Emit completion via WebSocket
    this.webSocketGateway.emitComplete(job.data.id, {
      jobId: job.data.id,
      projectId: result.projectId,
      projectUrl: result.projectUrl,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Update job progress and emit WebSocket event
   */
  private async updateProgress(
    job: Job<ScaffoldJobData>,
    status: ScaffoldJobStatus,
    currentStep: string,
    progress: number,
  ): Promise<void> {
    await job.updateProgress(progress);

    // Update job data with current status
    await job.update({
      ...job.data,
      currentStep,
    });

    // Emit progress via WebSocket
    this.webSocketGateway.emitProgress(job.data.id, {
      jobId: job.data.id,
      status,
      progress,
      currentStep,
      totalFiles: job.data.totalFiles || 0,
      processedFiles: Math.floor((progress / 100) * (job.data.totalFiles || 0)),
      timestamp: new Date().toISOString(),
    });
  }
}
