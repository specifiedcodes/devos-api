/**
 * PriorityQueueService Tests
 * Story 9.8: Agent Response Time Optimization
 *
 * Unit tests for priority queue with lanes and dynamic priority.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PriorityQueueService, PriorityLevel, AgentRequest } from './priority-queue.service';
import { Queue } from 'bullmq';
import { RedisService } from '../../redis/redis.service';

// Mock BullMQ Queue
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
    }),
    getJobs: jest.fn().mockResolvedValue([]),
    pause: jest.fn(),
    resume: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('PriorityQueueService', () => {
  let service: PriorityQueueService;
  let mockQueue: jest.Mocked<Queue>;
  let redisService: jest.Mocked<RedisService>;

  const mockRequest: AgentRequest = {
    id: 'req-123',
    type: 'direct_chat' as const,
    workspaceId: 'ws-123',
    agentId: 'agent-123',
    userId: 'user-123',
    data: { message: 'Hello' },
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      increment: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: undefined,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriorityQueueService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PriorityQueueService>(PriorityQueueService);
    redisService = module.get(RedisService);

    // Get the mocked queue from the service
    mockQueue = (service as any).queue;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePriority', () => {
    it('should assign CRITICAL priority to system_check requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'system_check' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.CRITICAL);
    });

    it('should assign HIGH priority to direct_chat requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'direct_chat' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.HIGH);
    });

    it('should assign HIGH priority to status_query requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'status_query' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.HIGH);
    });

    it('should assign NORMAL priority to task_update requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'task_update' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.NORMAL);
    });

    it('should assign LOW priority to bulk_report requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'bulk_report' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.LOW);
    });

    it('should assign BATCH priority to background_task requests', () => {
      const request: AgentRequest = { ...mockRequest, type: 'background_task' as const };
      const priority = service.calculatePriority(request);
      expect(priority).toBe(PriorityLevel.BATCH);
    });
  });

  describe('applyDynamicPriority', () => {
    it('should boost priority based on age', () => {
      // Request created 10 seconds ago
      const oldRequest = {
        ...mockRequest,
        createdAt: new Date(Date.now() - 10000),
      };
      const basePriority = PriorityLevel.NORMAL;

      const boostedPriority = service.applyDynamicPriority(oldRequest, basePriority);

      // Should be boosted by age (10 seconds = +10 priority)
      expect(boostedPriority).toBeLessThan(basePriority); // Lower number = higher priority
    });

    it('should cap age boost at maximum', () => {
      // Request created 60 seconds ago
      const veryOldRequest = {
        ...mockRequest,
        createdAt: new Date(Date.now() - 60000),
      };
      const basePriority = PriorityLevel.NORMAL;

      const boostedPriority = service.applyDynamicPriority(veryOldRequest, basePriority);

      // Should be capped at max age boost (30)
      expect(boostedPriority).toBe(basePriority - 30);
    });

    it('should apply VIP boost for VIP users', () => {
      const vipRequest = {
        ...mockRequest,
        userId: 'vip-user-123',
        createdAt: new Date(), // Fresh request - no age boost
      };
      const basePriority = PriorityLevel.NORMAL; // 50

      // Mock VIP user list
      service.setVipUsers(['vip-user-123']);

      const boostedPriority = service.applyDynamicPriority(vipRequest, basePriority);

      // VIP boost is 20, so priority should be 50 - 20 = 30
      expect(boostedPriority).toBe(basePriority - 20); // VIP boost is 20
    });
  });

  describe('enqueue', () => {
    it('should add job to queue with calculated priority', async () => {
      const jobId = await service.enqueue(mockRequest);

      expect(mockQueue.add).toHaveBeenCalledWith(
        mockRequest.type,
        expect.objectContaining({
          id: mockRequest.id,
          type: mockRequest.type,
        }),
        expect.objectContaining({
          priority: expect.any(Number),
        }),
      );
      expect(jobId).toBe('job-123');
    });

    it('should allow override of priority', async () => {
      await service.enqueue(mockRequest, PriorityLevel.CRITICAL);

      expect(mockQueue.add).toHaveBeenCalledWith(
        mockRequest.type,
        expect.any(Object),
        expect.objectContaining({
          priority: PriorityLevel.CRITICAL,
        }),
      );
    });

    it('should use LIFO for critical requests', async () => {
      const criticalRequest: AgentRequest = { ...mockRequest, type: 'system_check' as const };

      await service.enqueue(criticalRequest);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'system_check',
        expect.any(Object),
        expect.objectContaining({
          lifo: true,
        }),
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await service.getQueueStats();

      expect(stats).toEqual(
        expect.objectContaining({
          totalPending: expect.any(Number),
          byPriority: expect.any(Object),
          averageWaitTime: expect.any(Number),
        }),
      );
    });

    it('should include processing rate', async () => {
      const stats = await service.getQueueStats();

      expect(stats.processingRate).toBeDefined();
      expect(typeof stats.processingRate).toBe('number');
    });
  });

  describe('requeue', () => {
    it('should requeue job with new priority', async () => {
      mockQueue.getJobs = jest.fn().mockResolvedValue([
        {
          id: 'job-123',
          data: mockRequest,
          remove: jest.fn(),
        },
      ]);

      await service.requeue('job-123', PriorityLevel.CRITICAL);

      expect(mockQueue.add).toHaveBeenCalledWith(
        mockRequest.type,
        expect.any(Object),
        expect.objectContaining({
          priority: PriorityLevel.CRITICAL,
        }),
      );
    });
  });

  describe('getPendingByPriority', () => {
    it('should return count of jobs per priority level', async () => {
      mockQueue.getJobs = jest.fn().mockResolvedValue([
        { data: { type: 'direct_chat' } },
        { data: { type: 'direct_chat' } },
        { data: { type: 'task_update' } },
      ]);

      const counts = await service.getPendingByPriority();

      expect(counts).toHaveProperty('HIGH');
      expect(counts).toHaveProperty('NORMAL');
    });
  });

  describe('getLaneStats', () => {
    it('should return stats for each priority lane', async () => {
      const laneStats = await service.getLaneStats();

      expect(laneStats).toHaveProperty('CRITICAL');
      expect(laneStats).toHaveProperty('HIGH');
      expect(laneStats).toHaveProperty('NORMAL');
      expect(laneStats).toHaveProperty('LOW');
    });
  });
});
