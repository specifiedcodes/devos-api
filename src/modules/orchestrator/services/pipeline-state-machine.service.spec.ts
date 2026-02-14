/**
 * PipelineStateMachineService Tests
 * Story 11.1: Orchestrator State Machine Core
 *
 * TDD: Tests written first, then implementation.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import {
  PipelineState,
  PipelineContext,
  InvalidStateTransitionError,
  PipelineLockError,
} from '../interfaces/pipeline.interfaces';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';

describe('PipelineStateMachineService', () => {
  let service: PipelineStateMachineService;
  let stateStore: jest.Mocked<PipelineStateStore>;
  let historyRepository: any;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let agentQueueService: jest.Mocked<AgentQueueService>;

  const mockContext: PipelineContext = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    currentState: PipelineState.IDLE,
    previousState: null,
    stateEnteredAt: new Date('2026-02-15T00:00:00Z'),
    activeAgentId: null,
    activeAgentType: null,
    currentStoryId: null,
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date('2026-02-15T00:00:00Z'),
    updatedAt: new Date('2026-02-15T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockStateStore = {
      getState: jest.fn(),
      setState: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      listActivePipelines: jest.fn(),
      removePipeline: jest.fn(),
    };

    const mockHistoryRepository = {
      create: jest.fn().mockImplementation((data) => ({ id: 'history-1', ...data })),
      save: jest.fn().mockResolvedValue({ id: 'history-1' }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
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
        { provide: PipelineStateStore, useValue: mockStateStore },
        {
          provide: getRepositoryToken(PipelineStateHistory),
          useValue: mockHistoryRepository,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentQueueService, useValue: mockAgentQueueService },
      ],
    }).compile();

    service = module.get<PipelineStateMachineService>(
      PipelineStateMachineService,
    );
    stateStore = module.get(PipelineStateStore);
    historyRepository = module.get(getRepositoryToken(PipelineStateHistory));
    eventEmitter = module.get(EventEmitter2);
    agentQueueService = module.get(AgentQueueService);
  });

  describe('startPipeline', () => {
    it('should create a new pipeline and transition to PLANNING', async () => {
      // First call: check for existing pipeline (null = none exists)
      // Second call: inside transition(), load the context that was just stored
      stateStore.getState
        .mockResolvedValueOnce(null) // No existing pipeline
        .mockResolvedValueOnce({ ...mockContext, currentState: PipelineState.IDLE }); // Context after initial store
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      const result = await service.startPipeline(
        'project-1',
        'workspace-1',
        { triggeredBy: 'system' },
      );

      expect(result).toBeDefined();
      expect(result.workflowId).toBeDefined();
      expect(stateStore.setState).toHaveBeenCalled();
      expect(historyRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if pipeline already active', async () => {
      stateStore.getState.mockResolvedValue(mockContext);

      await expect(
        service.startPipeline('project-1', 'workspace-1', {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('transition', () => {
    it('should succeed for valid IDLE -> PLANNING transition', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.PLANNING,
          previousState: PipelineState.IDLE,
        }),
      );
    });

    it('should succeed for valid PLANNING -> IMPLEMENTING transition', async () => {
      const planningContext = {
        ...mockContext,
        currentState: PipelineState.PLANNING,
        previousState: PipelineState.IDLE,
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(planningContext);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.IMPLEMENTING, {
        triggeredBy: 'system',
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.IMPLEMENTING,
          previousState: PipelineState.PLANNING,
        }),
      );
    });

    it('should succeed for valid QA -> IMPLEMENTING transition on retry', async () => {
      const qaContext = {
        ...mockContext,
        currentState: PipelineState.QA,
        previousState: PipelineState.IMPLEMENTING,
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(qaContext);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.IMPLEMENTING, {
        triggeredBy: 'system',
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.IMPLEMENTING,
          previousState: PipelineState.QA,
        }),
      );
    });

    it('should throw InvalidStateTransitionError for IDLE -> QA', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.releaseLock.mockResolvedValue(undefined);

      await expect(
        service.transition('project-1', PipelineState.QA, {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('should throw InvalidStateTransitionError for PLANNING -> DEPLOYING (skip QA)', async () => {
      const planningContext = {
        ...mockContext,
        currentState: PipelineState.PLANNING,
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(planningContext);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await expect(
        service.transition('project-1', PipelineState.DEPLOYING, {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('should handle PAUSED -> previous state resume correctly', async () => {
      const pausedContext = {
        ...mockContext,
        currentState: PipelineState.PAUSED,
        previousState: PipelineState.IMPLEMENTING,
        metadata: { pausedFrom: PipelineState.IMPLEMENTING },
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(pausedContext);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.IMPLEMENTING, {
        triggeredBy: 'user:user-1',
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.IMPLEMENTING,
          previousState: PipelineState.PAUSED,
        }),
      );
    });

    it('should acquire Redis lock before transition', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(stateStore.acquireLock).toHaveBeenCalledWith(
        'project-1',
        expect.any(Number),
      );
    });

    it('should throw PipelineLockError if lock cannot be acquired', async () => {
      stateStore.acquireLock.mockResolvedValue(false);

      await expect(
        service.transition('project-1', PipelineState.PLANNING, {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow(PipelineLockError);
    }, 10000);

    it('should release lock after transition completes', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(stateStore.releaseLock).toHaveBeenCalledWith('project-1');
    });

    it('should release lock even if transition throws error', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.releaseLock.mockResolvedValue(undefined);

      // IDLE -> QA is invalid
      await expect(
        service.transition('project-1', PipelineState.QA, {
          triggeredBy: 'system',
        }),
      ).rejects.toThrow();

      expect(stateStore.releaseLock).toHaveBeenCalledWith('project-1');
    });

    it('should store updated state in Redis after transition', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          currentState: PipelineState.PLANNING,
        }),
      );
    });

    it('should create PipelineStateHistory record in PostgreSQL', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(historyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          previousState: PipelineState.IDLE,
          newState: PipelineState.PLANNING,
          triggeredBy: 'system',
        }),
      );
      expect(historyRepository.save).toHaveBeenCalled();
    });

    it('should emit pipeline:state_changed event', async () => {
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue({ ...mockContext });
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.transition('project-1', PipelineState.PLANNING, {
        triggeredBy: 'system',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'pipeline.state_changed',
        expect.objectContaining({
          type: 'pipeline:state_changed',
          projectId: 'project-1',
          previousState: PipelineState.IDLE,
          newState: PipelineState.PLANNING,
        }),
      );
    });
  });

  describe('pausePipeline', () => {
    it('should transition current state to PAUSED', async () => {
      const implementingContext = {
        ...mockContext,
        currentState: PipelineState.IMPLEMENTING,
      };
      stateStore.getState.mockResolvedValue(implementingContext);
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.pausePipeline('project-1', 'user:user-1');

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.PAUSED,
          previousState: PipelineState.IMPLEMENTING,
        }),
      );
    });

    it('should throw NotFoundException if no active pipeline', async () => {
      stateStore.getState.mockResolvedValue(null);

      await expect(
        service.pausePipeline('project-1', 'user:user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resumePipeline', () => {
    it('should transition from PAUSED to previous state', async () => {
      const pausedContext = {
        ...mockContext,
        currentState: PipelineState.PAUSED,
        previousState: PipelineState.IMPLEMENTING,
        metadata: { pausedFrom: PipelineState.IMPLEMENTING },
      };
      stateStore.getState.mockResolvedValue(pausedContext);
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.resumePipeline('project-1', 'user:user-1');

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.IMPLEMENTING,
          previousState: PipelineState.PAUSED,
        }),
      );
    });

    it('should throw ConflictException if not currently paused', async () => {
      const implementingContext = {
        ...mockContext,
        currentState: PipelineState.IMPLEMENTING,
      };
      stateStore.getState.mockResolvedValue(implementingContext);

      await expect(
        service.resumePipeline('project-1', 'user:user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getState', () => {
    it('should delegate to PipelineStateStore', async () => {
      stateStore.getState.mockResolvedValue(mockContext);

      const result = await service.getState('project-1');

      expect(result).toEqual(mockContext);
      expect(stateStore.getState).toHaveBeenCalledWith('project-1');
    });
  });

  describe('getHistory', () => {
    it('should return paginated history from PostgreSQL', async () => {
      const mockHistory = [
        {
          id: 'h-1',
          projectId: 'project-1',
          previousState: PipelineState.IDLE,
          newState: PipelineState.PLANNING,
          createdAt: new Date(),
        },
      ];
      historyRepository.findAndCount.mockResolvedValue([mockHistory, 1]);

      const result = await service.getHistory(
        'project-1',
        'workspace-1',
        { limit: 20, offset: 0 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('onPhaseComplete', () => {
    it('should advance state after phase completion', async () => {
      const implementingContext = {
        ...mockContext,
        currentState: PipelineState.IMPLEMENTING,
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(implementingContext);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.onPhaseComplete('project-1', 'implementing', {
        success: true,
      });

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.QA,
        }),
      );
    });
  });

  describe('onPhaseFailed', () => {
    it('should increment retry count and transition to FAILED when max retries exceeded', async () => {
      const implementingContext = {
        ...mockContext,
        currentState: PipelineState.IMPLEMENTING,
        retryCount: 3,
        maxRetries: 3,
      };
      stateStore.acquireLock.mockResolvedValue(true);
      stateStore.getState.mockResolvedValue(implementingContext);
      stateStore.setState.mockResolvedValue(undefined);
      stateStore.releaseLock.mockResolvedValue(undefined);

      await service.onPhaseFailed('project-1', 'implementing', 'Some error');

      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentState: PipelineState.FAILED,
        }),
      );
    });
  });
});
