import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AgentQueueController } from './agent-queue.controller';
import { AgentQueueService } from '../services/agent-queue.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import {
  AgentJob,
  AgentJobType,
  AgentJobStatus,
} from '../entities/agent-job.entity';
import { CreateJobDto } from '../dto/create-job.dto';
import { ListJobsQueryDto } from '../dto/list-jobs-query.dto';

describe('AgentQueueController', () => {
  let controller: AgentQueueController;
  let mockService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockJobId = '33333333-3333-3333-3333-333333333333';

  const mockReq = {
    user: { sub: mockUserId },
  };

  beforeEach(async () => {
    mockService = {
      addJob: jest.fn(),
      getJob: jest.fn(),
      getWorkspaceJobs: jest.fn(),
      getQueueStats: jest.fn(),
      cancelJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentQueueController],
      providers: [
        { provide: AgentQueueService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AgentQueueController>(AgentQueueController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createJob', () => {
    const createJobDto: CreateJobDto = {
      jobType: AgentJobType.SPAWN_AGENT,
      data: { agentType: 'dev' },
    };

    const mockJob: Partial<AgentJob> = {
      id: mockJobId,
      status: AgentJobStatus.PENDING,
      jobType: AgentJobType.SPAWN_AGENT,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
    };

    it('should return 201 with correct response shape', async () => {
      mockService.addJob.mockResolvedValue(mockJob);

      const result = await controller.createJob(
        mockWorkspaceId,
        mockReq,
        createJobDto,
      );

      expect(result).toEqual({
        id: mockJobId,
        status: AgentJobStatus.PENDING,
        jobType: AgentJobType.SPAWN_AGENT,
        createdAt: mockJob.createdAt,
      });
    });

    it('should pass jobData to service correctly', async () => {
      mockService.addJob.mockResolvedValue(mockJob);

      await controller.createJob(mockWorkspaceId, mockReq, createJobDto);

      expect(mockService.addJob).toHaveBeenCalledWith(
        {
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          jobType: AgentJobType.SPAWN_AGENT,
          data: { agentType: 'dev' },
        },
        undefined,
      );
    });

    it('should pass priority to service when provided', async () => {
      const dtoWithPriority: CreateJobDto = {
        ...createJobDto,
        priority: 1,
      };
      mockService.addJob.mockResolvedValue(mockJob);

      await controller.createJob(
        mockWorkspaceId,
        mockReq,
        dtoWithPriority,
      );

      expect(mockService.addJob).toHaveBeenCalledWith(
        expect.any(Object),
        1,
      );
    });
  });

  describe('getJob', () => {
    const mockJob: Partial<AgentJob> = {
      id: mockJobId,
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      jobType: AgentJobType.SPAWN_AGENT,
      status: AgentJobStatus.COMPLETED,
      result: { success: true },
      attempts: 1,
      createdAt: new Date(),
      completedAt: new Date(),
    };

    it('should return 200 with full job object', async () => {
      mockService.getJob.mockResolvedValue(mockJob);

      const result = await controller.getJob(mockWorkspaceId, mockJobId);

      expect(result).toEqual(mockJob);
      expect(mockService.getJob).toHaveBeenCalledWith(
        mockJobId,
        mockWorkspaceId,
      );
    });

    it('should throw NotFoundException when job not found', async () => {
      mockService.getJob.mockResolvedValue(null);

      await expect(
        controller.getJob(mockWorkspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listJobs', () => {
    const mockJobsList: Partial<AgentJob>[] = [
      {
        id: mockJobId,
        workspaceId: mockWorkspaceId,
        jobType: AgentJobType.SPAWN_AGENT,
        status: AgentJobStatus.PENDING,
      },
    ];

    it('should return paginated response', async () => {
      mockService.getWorkspaceJobs.mockResolvedValue({
        jobs: mockJobsList,
        total: 1,
      });

      const query = new ListJobsQueryDto();
      query.limit = 20;
      query.offset = 0;

      const result = await controller.listJobs(mockWorkspaceId, query);

      expect(result).toEqual({
        jobs: mockJobsList,
        total: 1,
        limit: 20,
        offset: 0,
      });
    });

    it('should pass query filters to service', async () => {
      mockService.getWorkspaceJobs.mockResolvedValue({
        jobs: [],
        total: 0,
      });

      const query = new ListJobsQueryDto();
      query.status = AgentJobStatus.PENDING;
      query.jobType = AgentJobType.SPAWN_AGENT;
      query.limit = 10;
      query.offset = 5;

      await controller.listJobs(mockWorkspaceId, query);

      expect(mockService.getWorkspaceJobs).toHaveBeenCalledWith(
        mockWorkspaceId,
        {
          status: AgentJobStatus.PENDING,
          jobType: AgentJobType.SPAWN_AGENT,
          limit: 10,
          offset: 5,
        },
      );
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const mockStats = {
        waiting: 5,
        active: 2,
        completed: 150,
        failed: 3,
      };
      mockService.getQueueStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
    });
  });

  describe('cancelJob', () => {
    it('should return cancelled job', async () => {
      const mockJob: Partial<AgentJob> = {
        id: mockJobId,
        workspaceId: mockWorkspaceId,
        status: AgentJobStatus.PENDING,
      };
      const cancelledJob: Partial<AgentJob> = {
        ...mockJob,
        status: AgentJobStatus.FAILED,
        errorMessage: 'Cancelled by user',
      };

      mockService.getJob.mockResolvedValue(mockJob);
      mockService.cancelJob.mockResolvedValue(cancelledJob);

      const result = await controller.cancelJob(mockWorkspaceId, mockJobId);

      expect(result).toEqual(cancelledJob);
    });

    it('should throw NotFoundException if job not found', async () => {
      mockService.getJob.mockResolvedValue(null);

      await expect(
        controller.cancelJob(mockWorkspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if job already completed', async () => {
      const mockJob: Partial<AgentJob> = {
        id: mockJobId,
        workspaceId: mockWorkspaceId,
        status: AgentJobStatus.COMPLETED,
      };
      mockService.getJob.mockResolvedValue(mockJob);

      await expect(
        controller.cancelJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if job already failed', async () => {
      const mockJob: Partial<AgentJob> = {
        id: mockJobId,
        workspaceId: mockWorkspaceId,
        status: AgentJobStatus.FAILED,
      };
      mockService.getJob.mockResolvedValue(mockJob);

      await expect(
        controller.cancelJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow(ConflictException);
    });
  });
});
