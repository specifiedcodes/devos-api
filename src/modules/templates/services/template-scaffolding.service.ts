/**
 * TemplateScaffoldingService
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * Main orchestration service for scaffolding projects from templates.
 * Coordinates variable resolution, file processing, and job management.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { Template } from '../../../database/entities/template.entity';
import { TemplateEngineService, SourceFile, ProcessedFile } from './template-engine.service';
export type { ProcessedFile } from './template-engine.service';
import { VariableResolverService, VariableDefinition, ValidationResult } from './variable-resolver.service';

/**
 * Scaffold job status enum
 */
export enum ScaffoldJobStatus {
  PENDING = 'pending',
  FETCHING = 'fetching',
  PROCESSING = 'processing',
  INSTALLING = 'installing',
  COMPLETE = 'complete',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Scaffold job data for BullMQ
 */
export interface ScaffoldJobData {
  id: string;
  workspaceId: string;
  userId: string;
  templateId: string;
  projectName: string;
  variables: Record<string, unknown>;
  githubRepoId?: number;
  githubRepoName?: string;
  githubRepoOwner?: string;
  createNewRepo?: boolean;
  repoPrivate?: boolean;
  repoDescription?: string;
  skipPostInstall?: boolean;
  dryRun?: boolean;
  currentStep?: string;
  totalFiles?: number;
}

/**
 * Result of a scaffolding job
 */
export interface ScaffoldResult {
  success: boolean;
  projectId?: string;
  projectUrl?: string;
  files?: ProcessedFile[];
  error?: string;
}

/**
 * Result of starting a scaffold job
 */
export interface ScaffoldJobResult {
  jobId: string;
  status: ScaffoldJobStatus;
  message: string;
  statusUrl: string;
}

/**
 * Variable validation result
 */
export interface VariableValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  resolved: Record<string, unknown>;
}

/**
 * Status response for a scaffold job
 */
export interface ScaffoldJobStatusResponse {
  id: string;
  status: ScaffoldJobStatus;
  progress: number;
  currentStep: string;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  projectId: string | null;
  projectUrl: string | null;
}

@Injectable()
export class TemplateScaffoldingService {
  private readonly logger = new Logger(TemplateScaffoldingService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    private readonly templateEngine: TemplateEngineService,
    private readonly variableResolver: VariableResolverService,
    @InjectQueue('scaffold')
    private readonly scaffoldQueue: Queue,
  ) {}

  /**
   * Scaffold a project from a template with user-provided variables.
   * Returns a job ID for async processing with WebSocket updates.
   */
  async scaffold(
    workspaceId: string,
    userId: string,
    dto: {
      templateId: string;
      projectName: string;
      variables: Record<string, unknown>;
      githubRepoId?: number;
      createNewRepo?: boolean;
      repoName?: string;
      repoPrivate?: boolean;
      repoDescription?: string;
      skipPostInstall?: boolean;
      dryRun?: boolean;
    },
  ): Promise<ScaffoldJobResult | { preview: any }> {
    const template = await this.getTemplate(dto.templateId);

    // Validate variables
    const validation = this.validateVariables(template, dto.variables);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Variable validation failed',
        errors: validation.errors,
      });
    }

    // Dry run - return preview
    if (dto.dryRun) {
      return this.generatePreview(template, dto.variables);
    }

    // Create job data
    const jobId = `scaffold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jobData: ScaffoldJobData = {
      id: jobId,
      workspaceId,
      userId,
      templateId: dto.templateId,
      projectName: dto.projectName,
      variables: validation.resolved,
      githubRepoId: dto.githubRepoId,
      createNewRepo: dto.createNewRepo,
      githubRepoName: dto.repoName || dto.projectName,
      repoPrivate: dto.repoPrivate ?? true,
      repoDescription: dto.repoDescription,
      skipPostInstall: dto.skipPostInstall,
    };

    // Add to queue
    await this.scaffoldQueue.add('scaffold', jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      timeout: 600000, // 10 minutes
    });

    return {
      jobId,
      status: ScaffoldJobStatus.PENDING,
      message: 'Scaffolding job started',
      statusUrl: `/api/v1/templates/scaffold/jobs/${jobId}`,
    };
  }

  /**
   * Process the scaffolding job (called by BullMQ worker).
   */
  async processScaffoldJob(job: Job<ScaffoldJobData>): Promise<ScaffoldResult> {
    const data = job.data;

    try {
      // Update progress: Fetching (10%)
      await job.updateProgress(10);

      const template = await this.getTemplate(data.templateId);

      // Fetch source files
      const sourceFiles = await this.fetchSourceFiles(template, (step, percent) => {
        job.updateProgress(percent);
      });

      await job.updateProgress(30);

      // Process files
      const processedFiles = await this.processFiles(
        sourceFiles,
        data.variables,
        template,
      );

      await job.updateProgress(70);

      // For now, return the processed files (GitHub push handled by processor)
      return {
        success: true,
        files: processedFiles,
      };
    } catch (error) {
      this.logger.error(`Scaffold job ${data.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Validate variables against template definition.
   */
  validateVariables(
    template: Template,
    variables: Record<string, unknown>,
  ): VariableValidationResult {
    const definitions = (template.variables || []) as unknown as VariableDefinition[];
    const result = this.variableResolver.validate(definitions, variables);

    return {
      valid: result.valid,
      errors: result.errors.map((e) => ({
        field: e.field,
        message: e.message,
      })),
      resolved: result.valid ? this.variableResolver.resolve(definitions, variables) : variables,
    };
  }

  /**
   * Resolve all variables, applying defaults and validating required fields.
   */
  resolveVariables(
    template: Template,
    userVariables: Record<string, unknown>,
  ): Record<string, unknown> {
    const definitions = (template.variables || []) as unknown as VariableDefinition[];
    return this.variableResolver.resolve(definitions, userVariables);
  }

  /**
   * Fetch template source files from git, archive, or inline.
   */
  async fetchSourceFiles(
    template: Template,
    progressCallback?: (step: string, percent: number) => void,
  ): Promise<SourceFile[]> {
    progressCallback?.('Fetching template source', 10);

    // For templates with inline files
    const definition = template.definition as any;
    if (definition?.files?.inline_files) {
      const inlineFiles = definition.files.inline_files as Record<string, string>;
      return Object.entries(inlineFiles).map(([path, content]) => ({
        path,
        content,
      }));
    }

    // For git-based templates, return placeholder files
    // In production, this would clone the repo
    progressCallback?.('Processing source files', 20);

    return [
      { path: 'package.json', content: JSON.stringify({ name: '{{project_name}}', version: '1.0.0' }) },
      { path: 'README.md', content: '# {{project_name}}\n\n{{description}}' },
      { path: 'src/index.ts', content: 'console.log("Hello from {{project_name}}!");' },
    ];
  }

  /**
   * Process files through the template engine.
   */
  async processFiles(
    files: SourceFile[],
    variables: Record<string, unknown>,
    template: Template,
  ): Promise<ProcessedFile[]> {
    const processedFiles: ProcessedFile[] = [];

    for (const file of files) {
      // Skip binary files
      if (this.templateEngine.shouldSkipFile(file.content, variables)) {
        continue;
      }

      // Process the file
      const processed = this.templateEngine.renderFile(file, variables);
      processedFiles.push(processed);
    }

    return processedFiles;
  }

  /**
   * Apply variable substitution to file content.
   */
  applyVariableSubstitution(
    content: string,
    variables: Record<string, unknown>,
  ): string {
    return this.templateEngine.render(content, variables);
  }

  /**
   * Apply conditional blocks ({{#if}}...{{/if}}).
   */
  applyConditionals(
    content: string,
    variables: Record<string, unknown>,
  ): string {
    return this.templateEngine.render(content, variables);
  }

  /**
   * Apply iteration blocks ({{#each}}...{{/each}}).
   */
  applyIterations(
    content: string,
    variables: Record<string, unknown>,
  ): string {
    return this.templateEngine.render(content, variables);
  }

  /**
   * Rename files containing {{variable}} in their names.
   */
  renameFiles(
    files: ProcessedFile[],
    variables: Record<string, unknown>,
  ): ProcessedFile[] {
    return files.map((file) => ({
      ...file,
      path: this.templateEngine.render(file.path, variables),
    }));
  }

  /**
   * Get scaffolding job status by ID.
   */
  async getJobStatus(jobId: string): Promise<ScaffoldJobStatusResponse | null> {
    const job = await this.scaffoldQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const rawProgress = job.progress();
    const progress: number = typeof rawProgress === 'number' ? rawProgress : 0;

    const statusMap: Record<string, ScaffoldJobStatus> = {
      waiting: ScaffoldJobStatus.PENDING,
      active: ScaffoldJobStatus.PROCESSING,
      completed: ScaffoldJobStatus.COMPLETE,
      failed: ScaffoldJobStatus.FAILED,
    };

    return {
      id: jobId,
      status: statusMap[state] || ScaffoldJobStatus.PENDING,
      progress,
      currentStep: (job.data as any).currentStep || 'Initializing',
      totalFiles: (job.data as any).totalFiles || 0,
      processedFiles: (job.data as any).processedFiles || 0,
      error: job.failedReason || null,
      createdAt: new Date(job.timestamp).toISOString(),
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      projectId: (job.returnvalue as any)?.projectId || null,
      projectUrl: (job.returnvalue as any)?.projectUrl || null,
    };
  }

  /**
   * Cancel a running scaffolding job.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.scaffoldQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    try {
      await job.remove();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get template by ID.
   */
  async getTemplate(templateId: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${templateId}' not found`);
    }

    return template;
  }

  /**
   * Generate a preview for dry run.
   */
  private async generatePreview(
    template: Template,
    variables: Record<string, unknown>,
  ): Promise<{ preview: any }> {
    const sourceFiles = await this.fetchSourceFiles(template);
    const processedFiles = await this.processFiles(sourceFiles, variables, template);

    return {
      preview: {
        fileCount: processedFiles.length,
        files: processedFiles.slice(0, 10).map((f) => ({
          path: f.path,
          content: f.content.slice(0, 500) + (f.content.length > 500 ? '...' : ''),
          size: f.size,
        })),
        postInstallScripts: (template.definition as any)?.post_install || [],
        estimatedTime: '2-5 minutes',
      },
    };
  }
}
