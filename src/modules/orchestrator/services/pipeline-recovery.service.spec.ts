/**
 * PipelineRecoveryService Tests
 * Story 11.1: Orchestrator State Machine Core
 *
 * TDD: Tests written first, then implementation.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PipelineRecoveryService } from './pipeline-recovery.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import {
  PipelineState,
  PipelineContext,
} from '../interfaces/pipeline.interfaces';

describe('PipelineRecoveryService', () => {
  let service: PipelineRecoveryService;
  let stateStore: jest.Mocked<PipelineStateStore>;
  let stateMachine: jest.Mocked<PipelineStateMachineService>;
  let historyRepository: any;

  const createMockContext = (
    overrides: Partial<PipelineContext> = {},
  ): PipelineContext => ({
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    currentState: PipelineState.IMPLEMENTING,
    previousState: PipelineState.PLANNING,
    stateEnteredAt: new Date(),
    activeAgentId: 'agent-1',
    activeAgentType: 'dev',
    currentStoryId: 'story-1',
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockStateStore = {
      getState: jest.fn(),
      setState: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      forceReleaseLock: jest.fn(),
      listActivePipelines: jest.fn(),
      listAllPipelineKeys: jest.fn(),
      listAllLockKeys: jest.fn(),
      extractProjectId: jest.fn((key: string) => key.replace('pipeline:state:', '')),
      extractProjectIdFromLock: jest.fn((key: string) => key.replace('pipeline:lock:', '')),
      removePipeline: jest.fn(),
    };

    const mockStateMachine = {
      transition: jest.fn(),
    };

    const mockHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineRecoveryService,
        { provide: PipelineStateStore, useValue: mockStateStore },
        { provide: PipelineStateMachineService, useValue: mockStateMachine },
        {
          provide: getRepositoryToken(PipelineStateHistory),
          useValue: mockHistoryRepository,
        },
      ],
    }).compile();

    service = module.get<PipelineRecoveryService>(PipelineRecoveryService);
    stateStore = module.get(PipelineStateStore);
    stateMachine = module.get(PipelineStateMachineService);
    historyRepository = module.get(getRepositoryToken(PipelineStateHistory));
  });

  describe('recoverActivePipelines', () => {
    it('should recover recent active pipelines', async () => {
      const recentContext = createMockContext({
        stateEnteredAt: new Date(), // Now = recent
      });

      stateStore.listAllPipelineKeys.mockResolvedValue([
        'pipeline:state:project-1',
      ]);
      stateStore.getState.mockResolvedValue(recentContext);
      stateStore.listAllLockKeys.mockResolvedValue([]);

      const result = await service.recoverActivePipelines();

      expect(result.recovered).toBe(1);
      expect(result.stale).toBe(0);
      expect(result.total).toBe(1);
    });

    it('should mark stale pipelines (>2 hours) as FAILED', async () => {
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 3); // 3 hours ago

      const staleContext = createMockContext({
        stateEnteredAt: staleDate,
      });

      stateStore.listAllPipelineKeys.mockResolvedValue([
        'pipeline:state:project-1',
      ]);
      stateStore.getState.mockResolvedValue(staleContext);
      stateStore.listAllLockKeys.mockResolvedValue([]);
      stateMachine.transition.mockResolvedValue(undefined);

      const result = await service.recoverActivePipelines();

      expect(result.stale).toBe(1);
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'project-1',
        PipelineState.FAILED,
        expect.objectContaining({
          triggeredBy: 'system:recovery',
          errorMessage: 'stale_recovery',
        }),
      );
    });

    it('should force-release orphaned locks', async () => {
      stateStore.listAllPipelineKeys.mockResolvedValue([]);
      stateStore.listAllLockKeys.mockResolvedValue([
        'pipeline:lock:project-orphan',
      ]);
      stateStore.getState.mockResolvedValue(null);

      await service.recoverActivePipelines();

      expect(stateStore.forceReleaseLock).toHaveBeenCalledWith(
        'project-orphan',
      );
    });

    it('should reconcile Redis with PostgreSQL on mismatch', async () => {
      const redisContext = createMockContext({
        currentState: PipelineState.IMPLEMENTING,
      });

      const dbHistory = {
        id: 'h-1',
        projectId: 'project-1',
        newState: PipelineState.QA, // DB says QA, Redis says IMPLEMENTING
        createdAt: new Date(),
      };

      stateStore.listAllPipelineKeys.mockResolvedValue([
        'pipeline:state:project-1',
      ]);
      stateStore.getState.mockResolvedValue(redisContext);
      stateStore.listAllLockKeys.mockResolvedValue([]);
      historyRepository.findOne.mockResolvedValue(dbHistory);
      stateStore.setState.mockResolvedValue(undefined);

      const result = await service.recoverActivePipelines();

      // Should update Redis to match PostgreSQL
      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.QA,
        }),
      );
      expect(result.recovered).toBe(1);
    });

    it('should return correct recovery counts', async () => {
      const recentDate = new Date();
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 3);

      const recentContext = createMockContext({
        projectId: 'project-recent',
        stateEnteredAt: recentDate,
      });
      const staleContext = createMockContext({
        projectId: 'project-stale',
        stateEnteredAt: staleDate,
      });

      stateStore.listAllPipelineKeys.mockResolvedValue([
        'pipeline:state:project-recent',
        'pipeline:state:project-stale',
      ]);
      stateStore.extractProjectId
        .mockReturnValueOnce('project-recent')
        .mockReturnValueOnce('project-stale');
      stateStore.getState
        .mockResolvedValueOnce(recentContext)
        .mockResolvedValueOnce(staleContext);
      stateStore.listAllLockKeys.mockResolvedValue([]);
      stateMachine.transition.mockResolvedValue(undefined);

      const result = await service.recoverActivePipelines();

      expect(result.total).toBe(2);
      expect(result.recovered).toBe(1);
      expect(result.stale).toBe(1);
    });

    it('should handle empty Redis gracefully', async () => {
      stateStore.listAllPipelineKeys.mockResolvedValue([]);
      stateStore.listAllLockKeys.mockResolvedValue([]);

      const result = await service.recoverActivePipelines();

      expect(result.total).toBe(0);
      expect(result.recovered).toBe(0);
      expect(result.stale).toBe(0);
    });
  });
});
