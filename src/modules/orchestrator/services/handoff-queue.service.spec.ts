/**
 * HandoffQueueService Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for the handoff queue when max parallel agents is reached.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HandoffQueueService } from './handoff-queue.service';
import { RedisService } from '../../redis/redis.service';
import { HandoffParams } from '../interfaces/handoff.interfaces';

describe('HandoffQueueService', () => {
  let service: HandoffQueueService;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  // Simulate Redis sorted set in memory
  let sortedSet: Map<string, { score: number; member: string }[]>;

  beforeEach(async () => {
    sortedSet = new Map();

    const mockRedisService = {
      zadd: jest
        .fn()
        .mockImplementation((key: string, score: number, member: string) => {
          if (!sortedSet.has(key)) sortedSet.set(key, []);
          const set = sortedSet.get(key)!;
          set.push({ score, member });
          set.sort((a, b) => a.score - b.score);
          return Promise.resolve(1);
        }),
      zrangebyscore: jest
        .fn()
        .mockImplementation(
          (key: string, _min: number | string, _max: number | string) => {
            const set = sortedSet.get(key) || [];
            return Promise.resolve(set.map((e) => e.member));
          },
        ),
      zremrangebyscore: jest
        .fn()
        .mockImplementation(
          (key: string, min: number | string, max: number | string) => {
            const set = sortedSet.get(key) || [];
            const minNum =
              min === '-inf' ? -Infinity : Number(min);
            const maxNum =
              max === '+inf' ? Infinity : Number(max);
            const remaining = set.filter(
              (e) => e.score < minNum || e.score > maxNum,
            );
            const removed = set.length - remaining.length;
            sortedSet.set(key, remaining);
            return Promise.resolve(removed);
          },
        ),
      zrem: jest
        .fn()
        .mockImplementation((key: string, ...members: string[]) => {
          const set = sortedSet.get(key) || [];
          const remaining = set.filter(
            (e) => !members.includes(e.member),
          );
          const removed = set.length - remaining.length;
          sortedSet.set(key, remaining);
          return Promise.resolve(removed);
        }),
      zcard: jest
        .fn()
        .mockImplementation((key: string) => {
          const set = sortedSet.get(key) || [];
          return Promise.resolve(set.length);
        }),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffQueueService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<HandoffQueueService>(HandoffQueueService);
    redisService = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const createHandoffParams = (storyId: string): HandoffParams => ({
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    storyId,
    storyTitle: `Story ${storyId}`,
    completingAgentType: 'dev',
    completingAgentId: 'agent-1',
    phaseResult: {},
    pipelineMetadata: {},
  });

  describe('enqueueHandoff', () => {
    it('should add handoff to Redis sorted set', async () => {
      const params = createHandoffParams('story-1');

      const id = await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params,
        priority: 1,
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(redisService.zadd).toHaveBeenCalled();
    });

    it('should assign priority correctly', async () => {
      const params1 = createHandoffParams('story-1');
      const params2 = createHandoffParams('story-2');

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params1,
        priority: 2,
      });

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params2,
        priority: 1,
      });

      // Both should be added with their respective priorities
      expect(redisService.zadd).toHaveBeenCalledTimes(2);
    });
  });

  describe('processNextInQueue', () => {
    it('should return highest priority handoff', async () => {
      const params1 = createHandoffParams('story-1');
      const params2 = createHandoffParams('story-2');

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params1,
        priority: 2,
      });
      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params2,
        priority: 1,
      });

      const result = await service.processNextInQueue('ws-1');

      expect(result).toBeDefined();
      expect(result!.storyId).toBe('story-2'); // Lower priority = higher priority
    });

    it('should return null when queue is empty', async () => {
      const result = await service.processNextInQueue('ws-1');
      expect(result).toBeNull();
    });

    it('should remove processed handoff from queue', async () => {
      const params = createHandoffParams('story-1');

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params,
        priority: 1,
      });

      await service.processNextInQueue('ws-1');

      // Second call should return null (queue empty)
      const result = await service.processNextInQueue('ws-1');
      expect(result).toBeNull();
    });
  });

  describe('getQueueDepth', () => {
    it('should return correct queue size', async () => {
      const params1 = createHandoffParams('story-1');
      const params2 = createHandoffParams('story-2');

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params1,
        priority: 1,
      });
      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params2,
        priority: 2,
      });

      const depth = await service.getQueueDepth('ws-1');
      expect(depth).toBe(2);
    });

    it('should return 0 for empty queue', async () => {
      const depth = await service.getQueueDepth('ws-1');
      expect(depth).toBe(0);
    });
  });

  describe('getQueuedHandoffs', () => {
    it('should return all queued handoffs sorted by priority', async () => {
      const params1 = createHandoffParams('story-1');
      const params2 = createHandoffParams('story-2');
      const params3 = createHandoffParams('story-3');

      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params1,
        priority: 3,
      });
      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params2,
        priority: 1,
      });
      await service.enqueueHandoff({
        workspaceId: 'ws-1',
        handoff: params3,
        priority: 2,
      });

      const queued = await service.getQueuedHandoffs('ws-1');

      expect(queued).toHaveLength(3);
      // Should be sorted by priority (lower = higher priority)
      expect(queued[0].storyId).toBe('story-2');
      expect(queued[1].storyId).toBe('story-3');
      expect(queued[2].storyId).toBe('story-1');
    });
  });
});
