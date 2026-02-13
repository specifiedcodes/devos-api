import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentQueueService, AgentJobData } from './agent-queue.service';
import {
  AgentJob,
  AgentJobType,
  AgentJobStatus,
} from '../entities/agent-job.entity';

describe('AgentQueueService', () => {
  let service: AgentQueueService;
  let mockRepository: any;
  let mockQueue: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockJobId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getCompletedCount: jest.fn(),
      getFailedCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentQueueService,
        {
          provide: getRepositoryToken(AgentJob),
          useValue: mockRepository,
        },
        { provide: 'BullQueue_agent-tasks', useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AgentQueueService>(AgentQueueService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addJob', () => {
    const jobData: AgentJobData = {
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      jobType: AgentJobType.SPAWN_AGENT,
      data: { agentType: 'dev' },
    };

    const mockAgentJob: Partial<AgentJob> = {
      id: mockJobId,
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      jobType: AgentJobType.SPAWN_AGENT,
      status: AgentJobStatus.PENDING,
      data: { agentType: 'dev' },
      bullJobId: null,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a database record with correct fields', async () => {
      mockRepository.create.mockReturnValue(mockAgentJob);
      mockRepository.save.mockResolvedValue(mockAgentJob);
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      await service.addJob(jobData);

      expect(mockRepository.create).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        jobType: AgentJobType.SPAWN_AGENT,
        data: { agentType: 'dev' },
        status: AgentJobStatus.PENDING,
      });
    });

    it('should add job to BullMQ queue', async () => {
      mockRepository.create.mockReturnValue(mockAgentJob);
      mockRepository.save.mockResolvedValue(mockAgentJob);
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      await service.addJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        AgentJobType.SPAWN_AGENT,
        {
          agentJobId: mockJobId,
          ...jobData,
        },
        {
          jobId: mockJobId,
          priority: 5,
        },
      );
    });

    it('should update bull_job_id after queue addition', async () => {
      mockRepository.create.mockReturnValue({ ...mockAgentJob });
      mockRepository.save.mockResolvedValue({ ...mockAgentJob });
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      const result = await service.addJob(jobData);

      // save is called twice: once for initial creation, once for bull_job_id update
      expect(mockRepository.save).toHaveBeenCalledTimes(2);
      expect(result.bullJobId).toBe('bull-job-1');
    });

    it('should return complete AgentJob object', async () => {
      mockRepository.create.mockReturnValue({ ...mockAgentJob });
      mockRepository.save.mockResolvedValue({ ...mockAgentJob });
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      const result = await service.addJob(jobData);

      expect(result.id).toBe(mockJobId);
      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(result.jobType).toBe(AgentJobType.SPAWN_AGENT);
      expect(result.status).toBe(AgentJobStatus.PENDING);
    });

    it('should pass priority to BullMQ queue', async () => {
      mockRepository.create.mockReturnValue({ ...mockAgentJob });
      mockRepository.save.mockResolvedValue({ ...mockAgentJob });
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      await service.addJob(jobData, 1);

      expect(mockQueue.add).toHaveBeenCalledWith(
        AgentJobType.SPAWN_AGENT,
        expect.any(Object),
        {
          jobId: mockJobId,
          priority: 1,
        },
      );
    });

    it('should default priority to 5 when not specified', async () => {
      mockRepository.create.mockReturnValue({ ...mockAgentJob });
      mockRepository.save.mockResolvedValue({ ...mockAgentJob });
      mockQueue.add.mockResolvedValue({ id: 'bull-job-1' });

      await service.addJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 5 }),
      );
    });
  });

  describe('getJob', () => {
    const mockAgentJob: Partial<AgentJob> = {
      id: mockJobId,
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      jobType: AgentJobType.SPAWN_AGENT,
      status: AgentJobStatus.PENDING,
    };

    it('should return job when found with matching workspaceId', async () => {
      mockRepository.findOne.mockResolvedValue(mockAgentJob);

      const result = await service.getJob(mockJobId, mockWorkspaceId);

      expect(result).toEqual(mockAgentJob);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockJobId, workspaceId: mockWorkspaceId },
      });
    });

    it('should return null when job not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getJob(
        'non-existent-id',
        mockWorkspaceId,
      );

      expect(result).toBeNull();
    });

    it('should enforce workspace isolation - does not return job from different workspace', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const differentWorkspaceId =
        '99999999-9999-9999-9999-999999999999';
      const result = await service.getJob(mockJobId, differentWorkspaceId);

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockJobId, workspaceId: differentWorkspaceId },
      });
    });
  });

  describe('getWorkspaceJobs', () => {
    const mockJobs: Partial<AgentJob>[] = [
      {
        id: mockJobId,
        workspaceId: mockWorkspaceId,
        jobType: AgentJobType.SPAWN_AGENT,
        status: AgentJobStatus.PENDING,
      },
    ];

    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockJobs, 1]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should return paginated results with correct total count', async () => {
      const result = await service.getWorkspaceJobs(mockWorkspaceId);

      expect(result.jobs).toEqual(mockJobs);
      expect(result.total).toBe(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'job.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId },
      );
    });

    it('should apply default limit of 20 when no limit specified', async () => {
      await service.getWorkspaceJobs(mockWorkspaceId);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
    });

    it('should filter by status when provided', async () => {
      await service.getWorkspaceJobs(mockWorkspaceId, {
        status: AgentJobStatus.PENDING,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'job.status = :status',
        { status: AgentJobStatus.PENDING },
      );
    });

    it('should filter by jobType when provided', async () => {
      await service.getWorkspaceJobs(mockWorkspaceId, {
        jobType: AgentJobType.SPAWN_AGENT,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'job.jobType = :jobType',
        { jobType: AgentJobType.SPAWN_AGENT },
      );
    });

    it('should apply limit and offset correctly', async () => {
      await service.getWorkspaceJobs(mockWorkspaceId, {
        limit: 10,
        offset: 20,
      });

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('updateJobStatus', () => {
    it('should update status and optional fields', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const now = new Date();
      await service.updateJobStatus(mockJobId, AgentJobStatus.COMPLETED, {
        result: { success: true },
        completedAt: now,
      });

      expect(mockRepository.update).toHaveBeenCalledWith(mockJobId, {
        status: AgentJobStatus.COMPLETED,
        result: { success: true },
        completedAt: now,
      });
    });

    it('should update status only when no options provided', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateJobStatus(mockJobId, AgentJobStatus.PROCESSING);

      expect(mockRepository.update).toHaveBeenCalledWith(mockJobId, {
        status: AgentJobStatus.PROCESSING,
      });
    });

    it('should update error message on failure', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateJobStatus(mockJobId, AgentJobStatus.FAILED, {
        errorMessage: 'Something went wrong',
        completedAt: new Date(),
      });

      expect(mockRepository.update).toHaveBeenCalledWith(
        mockJobId,
        expect.objectContaining({
          status: AgentJobStatus.FAILED,
          errorMessage: 'Something went wrong',
        }),
      );
    });
  });

  describe('incrementAttempts', () => {
    it('should increment attempts counter by 1', async () => {
      mockRepository.increment.mockResolvedValue({ affected: 1 });

      await service.incrementAttempts(mockJobId);

      expect(mockRepository.increment).toHaveBeenCalledWith(
        { id: mockJobId },
        'attempts',
        1,
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return waiting, active, completed, failed counts', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(150);
      mockQueue.getFailedCount.mockResolvedValue(3);

      const result = await service.getQueueStats();

      expect(result).toEqual({
        waiting: 5,
        active: 2,
        completed: 150,
        failed: 3,
      });
    });
  });

  describe('cancelJob', () => {
    const mockAgentJob: Partial<AgentJob> = {
      id: mockJobId,
      workspaceId: mockWorkspaceId,
      bullJobId: 'bull-job-1',
      status: AgentJobStatus.PENDING,
    };

    it('should return null if job not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.cancelJob(mockJobId, mockWorkspaceId);

      expect(result).toBeNull();
    });

    it('should remove job from BullMQ queue', async () => {
      const mockBullJob = { remove: jest.fn() };
      mockRepository.findOne
        .mockResolvedValueOnce(mockAgentJob)
        .mockResolvedValueOnce({ ...mockAgentJob, status: AgentJobStatus.FAILED });
      mockQueue.getJob.mockResolvedValue(mockBullJob);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.cancelJob(mockJobId, mockWorkspaceId);

      expect(mockQueue.getJob).toHaveBeenCalledWith('bull-job-1');
      expect(mockBullJob.remove).toHaveBeenCalled();
    });

    it('should update status to failed with cancellation message', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockAgentJob)
        .mockResolvedValueOnce({ ...mockAgentJob, status: AgentJobStatus.FAILED });
      mockQueue.getJob.mockResolvedValue({ remove: jest.fn() });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.cancelJob(mockJobId, mockWorkspaceId);

      expect(mockRepository.update).toHaveBeenCalledWith(
        mockJobId,
        expect.objectContaining({
          status: AgentJobStatus.FAILED,
          errorMessage: 'Cancelled by user',
        }),
      );
    });

    it('should return updated job with workspace isolation', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockAgentJob)
        .mockResolvedValueOnce({ ...mockAgentJob, status: AgentJobStatus.FAILED });
      mockQueue.getJob.mockResolvedValue({ remove: jest.fn() });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.cancelJob(mockJobId, mockWorkspaceId);

      // The second findOne call should include workspaceId for isolation
      expect(mockRepository.findOne).toHaveBeenLastCalledWith({
        where: { id: mockJobId, workspaceId: mockWorkspaceId },
      });
    });
  });
});
