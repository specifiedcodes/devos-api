/**
 * PipelineStateStore Tests
 * Story 11.1: Orchestrator State Machine Core
 *
 * TDD: Tests written first, then implementation.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PipelineStateStore } from './pipeline-state-store.service';
import { RedisService } from '../../redis/redis.service';
import {
  PipelineState,
  PipelineContext,
} from '../interfaces/pipeline.interfaces';

describe('PipelineStateStore', () => {
  let service: PipelineStateStore;
  let redisService: jest.Mocked<RedisService>;

  const mockContext: PipelineContext = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    currentState: PipelineState.PLANNING,
    previousState: PipelineState.IDLE,
    stateEnteredAt: new Date('2026-02-15T00:00:00Z'),
    activeAgentId: 'agent-1',
    activeAgentType: 'planner',
    currentStoryId: 'story-1',
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date('2026-02-15T00:00:00Z'),
    updatedAt: new Date('2026-02-15T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      setnx: jest.fn(),
      del: jest.fn(),
      scanKeys: jest.fn(),
      expire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStateStore,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<PipelineStateStore>(PipelineStateStore);
    redisService = module.get(RedisService);
  });

  describe('getState', () => {
    it('should return null for non-existent pipeline', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.getState('non-existent');

      expect(result).toBeNull();
      expect(redisService.get).toHaveBeenCalledWith(
        'pipeline:state:non-existent',
      );
    });

    it('should return PipelineContext from Redis', async () => {
      redisService.get.mockResolvedValue(JSON.stringify(mockContext));

      const result = await service.getState('project-1');

      expect(result).toBeDefined();
      expect(result!.projectId).toBe('project-1');
      expect(result!.currentState).toBe(PipelineState.PLANNING);
      expect(result!.workspaceId).toBe('workspace-1');
    });
  });

  describe('setState', () => {
    it('should store context in Redis as JSON for active pipelines (no TTL expiry)', async () => {
      redisService.set.mockResolvedValue(undefined);

      await service.setState(mockContext);

      expect(redisService.set).toHaveBeenCalledWith(
        'pipeline:state:project-1',
        expect.any(String),
        expect.any(Number),
      );

      // Verify the stored JSON contains all fields
      const storedJson = redisService.set.mock.calls[0][1];
      const parsed = JSON.parse(storedJson);
      expect(parsed.projectId).toBe('project-1');
      expect(parsed.currentState).toBe(PipelineState.PLANNING);
    });

    it('should set 7-day TTL for terminal state pipelines', async () => {
      redisService.set.mockResolvedValue(undefined);

      const completedContext = {
        ...mockContext,
        currentState: PipelineState.COMPLETE,
      };

      await service.setState(completedContext);

      // 7 days = 604800 seconds
      expect(redisService.set).toHaveBeenCalledWith(
        'pipeline:state:project-1',
        expect.any(String),
        604800,
      );
    });
  });

  describe('acquireLock', () => {
    it('should return true on successful acquisition', async () => {
      // setnx returns 'OK' when key was set (lock acquired)
      redisService.setnx.mockResolvedValue('OK');

      const result = await service.acquireLock('project-1');

      expect(result).toBe(true);
      expect(redisService.setnx).toHaveBeenCalledWith(
        'pipeline:lock:project-1',
        'locked',
        expect.any(Number),
      );
    });

    it('should return false if lock already held', async () => {
      // setnx returns null when key already exists (lock held)
      redisService.setnx.mockResolvedValue(null);

      const result = await service.acquireLock('project-1');

      expect(result).toBe(false);
    });
  });

  describe('releaseLock', () => {
    it('should release held lock', async () => {
      redisService.del.mockResolvedValue(undefined);

      await service.releaseLock('project-1');

      expect(redisService.del).toHaveBeenCalledWith(
        'pipeline:lock:project-1',
      );
    });
  });

  describe('listActivePipelines', () => {
    it('should return only active (non-terminal) pipelines', async () => {
      const activeContext = { ...mockContext };
      const completedContext = {
        ...mockContext,
        projectId: 'project-2',
        currentState: PipelineState.COMPLETE,
      };

      redisService.scanKeys.mockResolvedValue([
        'pipeline:state:project-1',
        'pipeline:state:project-2',
      ]);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(activeContext))
        .mockResolvedValueOnce(JSON.stringify(completedContext));

      const result = await service.listActivePipelines('workspace-1');

      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('project-1');
    });

    it('should filter by workspaceId', async () => {
      const ws1Context = { ...mockContext, workspaceId: 'workspace-1' };
      const ws2Context = {
        ...mockContext,
        projectId: 'project-2',
        workspaceId: 'workspace-2',
      };

      redisService.scanKeys.mockResolvedValue([
        'pipeline:state:project-1',
        'pipeline:state:project-2',
      ]);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(ws1Context))
        .mockResolvedValueOnce(JSON.stringify(ws2Context));

      const result = await service.listActivePipelines('workspace-1');

      expect(result).toHaveLength(1);
      expect(result[0].workspaceId).toBe('workspace-1');
    });
  });

  describe('removePipeline', () => {
    it('should remove Redis keys for pipeline', async () => {
      redisService.del.mockResolvedValue(undefined);

      await service.removePipeline('project-1');

      expect(redisService.del).toHaveBeenCalledWith(
        'pipeline:state:project-1',
        'pipeline:lock:project-1',
      );
    });
  });
});
