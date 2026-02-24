/**
 * InstallationProcessor
 *
 * Story 19-6: Template Installation Flow
 *
 * BullMQ processor for installation jobs.
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import {
  TemplateInstallationService,
  InstallationJobData,
} from '../services/template-installation.service';

@Processor('installation')
export class InstallationProcessor {
  private readonly logger = new Logger(InstallationProcessor.name);

  constructor(
    @Inject(forwardRef(() => TemplateInstallationService))
    private readonly installationService: TemplateInstallationService,
  ) {}

  @Process('install')
  async process(job: Job<InstallationJobData>): Promise<any> {
    const data = job.data;
    this.logger.log(`Processing installation job ${data.installationId}`);

    return this.installationService.processInstallationJob(job);
  }

  @OnQueueFailed()
  async onFailed(job: Job<InstallationJobData>, error: Error) {
    this.logger.error(`Installation job ${job.data.installationId} failed:`, error.message);
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<InstallationJobData>, result: any) {
    this.logger.log(`Installation job ${job.data.installationId} completed`);
  }
}
