import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentJob,
  AgentJobType,
  AgentJobStatus,
} from '../entities/agent-job.entity';

export interface AgentJobData {
  workspaceId: string;
  userId: string;
  jobType: AgentJobType;
  data: Record<string, any>;
}

/**
 * AgentQueueService
 * Story 5.1: BullMQ Task Queue Setup
 *
 * Manages agent job queue operations
 */
@Injectable()
export class AgentQueueService {
  private readonly logger = new Logger(AgentQueueService.name);

  constructor(
    @InjectQueue('agent-tasks') private readonly agentQueue: Queue,
    @InjectRepository(AgentJob)
    private readonly agentJobRepository: Repository<AgentJob>,
  ) {}

  /**
   * Add a job to the agent queue
   */
  async addJob(jobData: AgentJobData, priority?: number): Promise<AgentJob> {
    // Create database record
    const agentJob = this.agentJobRepository.create({
      workspaceId: jobData.workspaceId,
      userId: jobData.userId,
      jobType: jobData.jobType,
      data: jobData.data,
      status: AgentJobStatus.PENDING,
    });

    await this.agentJobRepository.save(agentJob);

    // Add to BullMQ queue
    const bullJob = await this.agentQueue.add(
      jobData.jobType,
      {
        agentJobId: agentJob.id,
        ...jobData,
      },
      {
        jobId: agentJob.id,
        priority: priority ?? 5,
      },
    );

    // Update with Bull job ID
    agentJob.bullJobId = bullJob.id as string;
    await this.agentJobRepository.save(agentJob);

    this.logger.log(
      `Job ${agentJob.id} added to queue: ${jobData.jobType} (priority: ${priority ?? 5})`,
    );

    return agentJob;
  }

  /**
   * Get job by ID (with workspace isolation)
   */
  async getJob(jobId: string, workspaceId: string): Promise<AgentJob | null> {
    return this.agentJobRepository.findOne({
      where: { id: jobId, workspaceId },
    });
  }

  /**
   * Get jobs for a workspace
   */
  async getWorkspaceJobs(
    workspaceId: string,
    options?: {
      status?: AgentJobStatus;
      jobType?: AgentJobType;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ jobs: AgentJob[]; total: number }> {
    const queryBuilder = this.agentJobRepository
      .createQueryBuilder('job')
      .where('job.workspaceId = :workspaceId', { workspaceId });

    if (options?.status) {
      queryBuilder.andWhere('job.status = :status', {
        status: options.status,
      });
    }

    if (options?.jobType) {
      queryBuilder.andWhere('job.jobType = :jobType', {
        jobType: options.jobType,
      });
    }

    queryBuilder.orderBy('job.createdAt', 'DESC');

    // Always apply a limit to prevent unbounded queries
    // Default to 20 if not specified by caller
    queryBuilder.limit(options?.limit || 20);

    if (options?.offset) {
      queryBuilder.offset(options.offset);
    }

    const [jobs, total] = await queryBuilder.getManyAndCount();

    return { jobs, total };
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: AgentJobStatus,
    options?: {
      result?: Record<string, any>;
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<void> {
    const updateData: Partial<AgentJob> = { status };

    if (options?.result) {
      updateData.result = options.result;
    }

    if (options?.errorMessage) {
      updateData.errorMessage = options.errorMessage;
    }

    if (options?.startedAt) {
      updateData.startedAt = options.startedAt;
    }

    if (options?.completedAt) {
      updateData.completedAt = options.completedAt;
    }

    await this.agentJobRepository.update(jobId, updateData);
  }

  /**
   * Increment job attempts
   */
  async incrementAttempts(jobId: string): Promise<void> {
    await this.agentJobRepository.increment({ id: jobId }, 'attempts', 1);
  }

  /**
   * Set job attempts to a specific value (syncs with BullMQ attemptsMade)
   */
  async updateJobAttempts(jobId: string, attempts: number): Promise<void> {
    await this.agentJobRepository.update(jobId, { attempts });
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.agentQueue.getWaitingCount(),
      this.agentQueue.getActiveCount(),
      this.agentQueue.getCompletedCount(),
      this.agentQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Cancel a job
   */
  async cancelJob(
    jobId: string,
    workspaceId: string,
  ): Promise<AgentJob | null> {
    const job = await this.getJob(jobId, workspaceId);

    if (!job) {
      return null;
    }

    // Try to remove from BullMQ queue if it has a bull job ID
    if (job.bullJobId) {
      try {
        const bullJob = await this.agentQueue.getJob(job.bullJobId);
        if (bullJob) {
          await bullJob.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed to remove job ${jobId} from BullMQ queue: ${error}`,
        );
      }
    }

    // Update database status to failed with cancellation message
    await this.updateJobStatus(jobId, AgentJobStatus.FAILED, {
      errorMessage: 'Cancelled by user',
      completedAt: new Date(),
    });

    // Return updated job with workspace isolation
    return this.agentJobRepository.findOne({
      where: { id: jobId, workspaceId },
    });
  }
}
