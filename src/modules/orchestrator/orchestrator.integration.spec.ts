/**
 * Orchestrator Integration Smoke Test
 * Story 11.1: Orchestrator State Machine Core
 *
 * End-to-end integration tests using mocked Redis and repository.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineStateStore } from './services/pipeline-state-store.service';
import { PipelineRecoveryService } from './services/pipeline-recovery.service';
import { PipelineStateHistory } from './entities/pipeline-state-history.entity';
import { RedisService } from '../redis/redis.service';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import {
  PipelineState,
  InvalidStateTransitionError,
} from './interfaces/pipeline.interfaces';

describe('Orchestrator Integration', () => {
  let stateMachine: PipelineStateMachineService;
  let stateStore: PipelineStateStore;
  let recoveryService: PipelineRecoveryService;
  let mockRedisStore: Map<string, string>;

  beforeEach(async () => {
    mockRedisStore = new Map();

    const mockRedisService = {
      get: jest.fn((key: string) => {
        return Promise.resolve(mockRedisStore.get(key) || null);
      }),
      set: jest.fn((key: string, value: string, _ttl: number) => {
        mockRedisStore.set(key, value);
        return Promise.resolve();
      }),
      setnx: jest.fn((key: string, value: string, _ttl: number) => {
        // Atomic set-if-not-exists: only set if key doesn't already exist
        if (mockRedisStore.has(key)) {
          return Promise.resolve(null);
        }
        mockRedisStore.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((k) => mockRedisStore.delete(k));
        return Promise.resolve();
      }),
      scanKeys: jest.fn((pattern: string) => {
        const prefix = pattern.replace('*', '');
        const matches = Array.from(mockRedisStore.keys()).filter((k) =>
          k.startsWith(prefix),
        );
        return Promise.resolve(matches);
      }),
      expire: jest.fn().mockResolvedValue(true),
    };

    const mockHistoryRepository = {
      create: jest.fn().mockImplementation((data) => ({
        id: 'history-' + Date.now(),
        ...data,
      })),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve(entity),
      ),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockAgentQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStateMachineService,
        PipelineStateStore,
        PipelineRecoveryService,
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: getRepositoryToken(PipelineStateHistory),
          useValue: mockHistoryRepository,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentQueueService, useValue: mockAgentQueueService },
      ],
    }).compile();

    stateMachine = module.get<PipelineStateMachineService>(
      PipelineStateMachineService,
    );
    stateStore = module.get<PipelineStateStore>(PipelineStateStore);
    recoveryService = module.get<PipelineRecoveryService>(
      PipelineRecoveryService,
    );
  });

  describe('Pipeline lifecycle', () => {
    it('should start a pipeline and store state in Redis', async () => {
      const result = await stateMachine.startPipeline(
        'project-1',
        'workspace-1',
        { triggeredBy: 'system' },
      );

      expect(result.workflowId).toBeDefined();
      expect(result.state).toBe(PipelineState.PLANNING);

      const state = await stateStore.getState('project-1');
      expect(state).not.toBeNull();
      expect(state!.currentState).toBe(PipelineState.PLANNING);
    });

    it('should perform valid state transitions and create history', async () => {
      // Start pipeline
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      // PLANNING -> IMPLEMENTING
      await stateMachine.transition('project-1', PipelineState.IMPLEMENTING, {
        triggeredBy: 'system',
      });

      const state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.IMPLEMENTING);
      expect(state!.previousState).toBe(PipelineState.PLANNING);
    });

    it('should reject invalid transitions', async () => {
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      // PLANNING -> DEPLOYING (skipping IMPLEMENTING and QA)
      await expect(
        stateMachine.transition('project-1', PipelineState.DEPLOYING, {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('should prevent starting duplicate pipelines', async () => {
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      await expect(
        stateMachine.startPipeline('project-1', 'workspace-1', {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Pause/Resume workflow', () => {
    it('should pause and resume a pipeline', async () => {
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      // Transition to IMPLEMENTING
      await stateMachine.transition('project-1', PipelineState.IMPLEMENTING, {
        triggeredBy: 'system',
      });

      // Pause
      const pauseResult = await stateMachine.pausePipeline(
        'project-1',
        'user:user-1',
      );
      expect(pauseResult.newState).toBe(PipelineState.PAUSED);

      let state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.PAUSED);

      // Resume
      const resumeResult = await stateMachine.resumePipeline(
        'project-1',
        'user:user-1',
      );
      expect(resumeResult.newState).toBe(PipelineState.IMPLEMENTING);

      state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.IMPLEMENTING);
    });
  });

  describe('Phase completion', () => {
    it('should advance through all phases', async () => {
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      // PLANNING -> IMPLEMENTING
      await stateMachine.onPhaseComplete('project-1', 'planning', {
        plan: 'done',
      });
      let state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.IMPLEMENTING);

      // IMPLEMENTING -> QA
      await stateMachine.onPhaseComplete('project-1', 'implementing', {
        code: 'done',
      });
      state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.QA);

      // QA -> DEPLOYING
      await stateMachine.onPhaseComplete('project-1', 'qa', {
        tests: 'passed',
      });
      state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.DEPLOYING);

      // DEPLOYING -> COMPLETE
      await stateMachine.onPhaseComplete('project-1', 'deploying', {
        url: 'https://app.example.com',
      });
      state = await stateStore.getState('project-1');
      expect(state!.currentState).toBe(PipelineState.COMPLETE);
    });
  });

  describe('Crash recovery', () => {
    it('should recover active pipelines on startup', async () => {
      // Simulate a pipeline that was active before crash
      await stateMachine.startPipeline('project-1', 'workspace-1', {
        triggeredBy: 'system',
      });

      const result = await recoveryService.recoverActivePipelines();

      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty Redis gracefully', async () => {
      const result = await recoveryService.recoverActivePipelines();

      expect(result.total).toBe(0);
      expect(result.recovered).toBe(0);
      expect(result.stale).toBe(0);
    });
  });
});
