/**
 * PipelineStateMachine Handoff Integration Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for integration between PipelineStateMachineService and HandoffCoordinatorService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import { HandoffCoordinatorService } from './handoff-coordinator.service';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';
import {
  PipelineContext,
  PipelineState,
} from '../interfaces/pipeline.interfaces';

describe('PipelineStateMachine Handoff Integration', () => {
  let stateMachine: PipelineStateMachineService;
  let stateStore: jest.Mocked<PipelineStateStore>;
  let historyRepository: jest.Mocked<Repository<PipelineStateHistory>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let agentQueueService: jest.Mocked<AgentQueueService>;
  let handoffCoordinator: jest.Mocked<HandoffCoordinatorService>;

  const createContext = (
    overrides: Partial<PipelineContext> = {},
  ): PipelineContext => ({
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    workflowId: 'wf-1',
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
      setState: jest.fn().mockResolvedValue(undefined),
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      listActivePipelines: jest.fn().mockResolvedValue([]),
    };

    const mockHistoryRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockAgentQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const mockHandoffCoordinator = {
      processHandoff: jest.fn().mockResolvedValue({
        success: true,
        nextAgentType: 'qa',
        nextPhase: 'qa',
        handoffContext: { storyId: 'story-1' },
        queued: false,
        queuePosition: null,
        error: null,
      }),
      processQARejection: jest.fn().mockResolvedValue({
        success: true,
        nextAgentType: 'dev',
        nextPhase: 'implementing',
        handoffContext: { storyId: 'story-1' },
        queued: false,
        queuePosition: null,
        error: null,
      }),
      processNextInQueue: jest.fn().mockResolvedValue(null),
      getCoordinationStatus: jest.fn().mockResolvedValue({
        activeHandoffs: [],
        blockedStories: [],
        activeAgents: 0,
        maxAgents: 5,
        queuedHandoffs: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStateMachineService,
        { provide: PipelineStateStore, useValue: mockStateStore },
        {
          provide: getRepositoryToken(PipelineStateHistory),
          useValue: mockHistoryRepo,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AgentQueueService, useValue: mockAgentQueueService },
        {
          provide: HandoffCoordinatorService,
          useValue: mockHandoffCoordinator,
        },
      ],
    }).compile();

    stateMachine = module.get<PipelineStateMachineService>(
      PipelineStateMachineService,
    );
    stateStore = module.get(PipelineStateStore);
    historyRepository = module.get(getRepositoryToken(PipelineStateHistory));
    eventEmitter = module.get(EventEmitter2);
    agentQueueService = module.get(AgentQueueService);
    handoffCoordinator = module.get(HandoffCoordinatorService);
  });

  it('should be defined', () => {
    expect(stateMachine).toBeDefined();
  });

  describe('onPhaseComplete', () => {
    it('should invoke handoff coordinator when available', async () => {
      const context = createContext({
        currentState: PipelineState.IMPLEMENTING,
        activeAgentType: 'dev',
        activeAgentId: 'agent-1',
      });
      stateStore.getState.mockResolvedValue(context);

      await stateMachine.onPhaseComplete('proj-1', 'implementing', {
        success: true,
        branch: 'feature/story-1',
      });

      expect(handoffCoordinator.processHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          projectId: 'proj-1',
          storyId: 'story-1',
          completingAgentType: 'dev',
        }),
      );
    });

    it('should work without handoff coordinator (backward compatible)', async () => {
      // Create a separate module without handoff coordinator
      const mockStateStore = {
        getState: jest.fn(),
        setState: jest.fn().mockResolvedValue(undefined),
        acquireLock: jest.fn().mockResolvedValue(true),
        releaseLock: jest.fn().mockResolvedValue(undefined),
      };

      const context = createContext({
        currentState: PipelineState.IMPLEMENTING,
      });
      mockStateStore.getState.mockResolvedValue(context);

      const moduleWithout = await Test.createTestingModule({
        providers: [
          PipelineStateMachineService,
          { provide: PipelineStateStore, useValue: mockStateStore },
          {
            provide: getRepositoryToken(PipelineStateHistory),
            useValue: {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockResolvedValue({}),
            },
          },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          {
            provide: AgentQueueService,
            useValue: { addJob: jest.fn().mockResolvedValue({ id: 'j1' }) },
          },
          // No HandoffCoordinatorService provided
          { provide: HandoffCoordinatorService, useValue: null },
        ],
      }).compile();

      const sm = moduleWithout.get<PipelineStateMachineService>(
        PipelineStateMachineService,
      );

      // Should not throw
      await expect(
        sm.onPhaseComplete('proj-1', 'implementing', { success: true }),
      ).resolves.not.toThrow();
    });

    it('should propagate handoff metadata to next BullMQ job', async () => {
      const context = createContext({
        currentState: PipelineState.IMPLEMENTING,
        activeAgentType: 'dev',
        activeAgentId: 'agent-1',
      });
      stateStore.getState.mockResolvedValue(context);

      handoffCoordinator.processHandoff.mockResolvedValueOnce({
        success: true,
        nextAgentType: 'qa',
        nextPhase: 'qa',
        handoffContext: { branch: 'feature/story-1', prUrl: 'https://github.com/pr/42' },
        queued: false,
        queuePosition: null,
        error: null,
      });

      await stateMachine.onPhaseComplete('proj-1', 'implementing', {
        success: true,
      });

      // The transition should include handoff context in metadata
      // This gets passed to setState which stores in Redis
      expect(stateStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            handoffContext: expect.objectContaining({
              branch: 'feature/story-1',
            }),
          }),
        }),
      );
    });

    it('should handle QA rejection routing through handoff coordinator', async () => {
      const context = createContext({
        currentState: PipelineState.QA,
        activeAgentType: 'qa',
        activeAgentId: 'agent-2',
        metadata: { iterationCount: 1 },
      });
      stateStore.getState.mockResolvedValue(context);

      // Simulate QA phase completion with FAIL verdict
      const result = {
        success: true,
        verdict: 'FAIL',
        qaReport: { summary: 'Tests failed' },
      };

      await stateMachine.onPhaseComplete('proj-1', 'qa', result);

      // Should invoke handoff coordinator's processQARejection
      expect(handoffCoordinator.processQARejection).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          projectId: 'proj-1',
          storyId: 'story-1',
          qaResult: result,
        }),
      );
    });
  });

  describe('onAgentSlotFreed', () => {
    it('should process queued handoffs when agent completes', async () => {
      await stateMachine.onAgentSlotFreed('ws-1');

      expect(handoffCoordinator.processNextInQueue).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('multiple stories', () => {
    it('should handle multiple stories in different phases simultaneously', async () => {
      // Story 1 in implementing
      const context1 = createContext({
        projectId: 'proj-1',
        currentState: PipelineState.IMPLEMENTING,
        currentStoryId: 'story-1',
        activeAgentType: 'dev',
      });

      // Story 2 in QA
      const context2 = createContext({
        projectId: 'proj-2',
        currentState: PipelineState.QA,
        currentStoryId: 'story-2',
        activeAgentType: 'qa',
      });

      // Each onPhaseComplete call reads context once, then transition reads again
      // So we need 2 getState calls per onPhaseComplete: 1 in onPhaseComplete, 1 in transition
      stateStore.getState
        .mockResolvedValueOnce(context1) // onPhaseComplete for proj-1
        .mockResolvedValueOnce(context1) // transition for proj-1
        .mockResolvedValueOnce(context2) // onPhaseComplete for proj-2
        .mockResolvedValueOnce(context2); // transition for proj-2

      handoffCoordinator.processHandoff
        .mockResolvedValueOnce({
          success: true,
          nextAgentType: 'qa',
          nextPhase: 'qa',
          handoffContext: {},
          queued: false,
          queuePosition: null,
          error: null,
        })
        .mockResolvedValueOnce({
          success: true,
          nextAgentType: 'devops',
          nextPhase: 'deploying',
          handoffContext: {},
          queued: false,
          queuePosition: null,
          error: null,
        });

      // Process both stories
      await stateMachine.onPhaseComplete('proj-1', 'implementing', {
        success: true,
      });

      await stateMachine.onPhaseComplete('proj-2', 'qa', {
        success: true,
        verdict: 'PASS',
      });

      // Both should invoke the coordinator independently
      expect(handoffCoordinator.processHandoff).toHaveBeenCalledTimes(2);
    });
  });
});
