import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AgentQueueService, AgentJobData } from '../services/agent-queue.service';
import { AgentJobStatus } from '../entities/agent-job.entity';
import { CreateJobDto } from '../dto/create-job.dto';
import { ListJobsQueryDto } from '../dto/list-jobs-query.dto';

/**
 * AgentQueueController
 * Story 5.1: BullMQ Task Queue Setup
 *
 * API endpoints for agent queue management
 */
@ApiTags('agent-queue')
@ApiBearerAuth()
@Controller('api/v1/workspaces/:workspaceId/agent-queue')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class AgentQueueController {
  private readonly logger = new Logger(AgentQueueController.name);

  constructor(private readonly agentQueueService: AgentQueueService) {}

  /**
   * Add a job to the queue
   */
  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Create a new agent job' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 201,
    description: 'Job created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['pending'] },
        jobType: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 403, description: 'User not member of workspace' })
  async createJob(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() createJobDto: CreateJobDto,
  ) {
    try {
      const jobData: AgentJobData = {
        workspaceId,
        userId: req.user.sub,
        jobType: createJobDto.jobType,
        data: createJobDto.data,
      };

      const job = await this.agentQueueService.addJob(
        jobData,
        createJobDto.priority,
      );

      return {
        id: job.id,
        status: job.status,
        jobType: job.jobType,
        createdAt: job.createdAt,
      };
    } catch (error) {
      this.logger.error('Failed to create job', error);
      throw new InternalServerErrorException('Failed to create job');
    }
  }

  /**
   * Get job by ID
   */
  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get agent job by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 403, description: 'User not member of workspace' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.agentQueueService.getJob(jobId, workspaceId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  /**
   * List jobs for workspace
   */
  @Get('jobs')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'List agent jobs for workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of jobs',
    schema: {
      type: 'object',
      properties: {
        jobs: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 403, description: 'User not member of workspace' })
  async listJobs(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListJobsQueryDto,
  ) {
    try {
      const { jobs, total } = await this.agentQueueService.getWorkspaceJobs(
        workspaceId,
        {
          status: query.status,
          jobType: query.jobType,
          limit: query.limit,
          offset: query.offset,
        },
      );

      return {
        jobs,
        total,
        limit: query.limit ?? 20,
        offset: query.offset ?? 0,
      };
    } catch (error) {
      this.logger.error('Failed to list jobs', error);
      throw new InternalServerErrorException('Failed to list jobs');
    }
  }

  /**
   * Get queue statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics',
    schema: {
      type: 'object',
      properties: {
        waiting: { type: 'number' },
        active: { type: 'number' },
        completed: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 403, description: 'User not member of workspace' })
  async getStats() {
    try {
      return await this.agentQueueService.getQueueStats();
    } catch (error) {
      this.logger.error('Failed to get queue stats', error);
      throw new InternalServerErrorException('Failed to get queue statistics');
    }
  }

  /**
   * Cancel a job
   */
  @Delete('jobs/:jobId')
  @ApiOperation({ summary: 'Cancel an agent job' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job cancelled successfully' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  @ApiResponse({ status: 403, description: 'User not member of workspace' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 409, description: 'Job already completed or failed' })
  async cancelJob(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.agentQueueService.getJob(jobId, workspaceId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (
      job.status === AgentJobStatus.COMPLETED ||
      job.status === AgentJobStatus.FAILED
    ) {
      throw new ConflictException('Job already completed or failed');
    }

    const cancelledJob = await this.agentQueueService.cancelJob(
      jobId,
      workspaceId,
    );

    return cancelledJob;
  }
}
