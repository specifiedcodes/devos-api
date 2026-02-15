/**
 * HandoffCoordinatorService Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for the main handoff coordination service.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HandoffCoordinatorService } from './handoff-coordinator.service';
import { HandoffContextAssemblerService } from './handoff-context-assembler.service';
import { CoordinationRulesEngineService } from './coordination-rules-engine.service';
import { StoryDependencyManagerService } from './story-dependency-manager.service';
import { HandoffQueueService } from './handoff-queue.service';
import { HandoffHistoryService } from './handoff-history.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import {
  HandoffParams,
  QARejectionParams,
  DEFAULT_MAX_QA_ITERATIONS,
} from '../interfaces/handoff.interfaces';

describe('HandoffCoordinatorService', () => {
  let service: HandoffCoordinatorService;
  let contextAssembler: jest.Mocked<HandoffContextAssemblerService>;
  let rulesEngine: jest.Mocked<CoordinationRulesEngineService>;
  let depManager: jest.Mocked<StoryDependencyManagerService>;
  let queueService: jest.Mocked<HandoffQueueService>;
  let historyService: jest.Mocked<HandoffHistoryService>;
  let stateStore: jest.Mocked<PipelineStateStore>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const createHandoffParams = (
    overrides: Partial<HandoffParams> = {},
  ): HandoffParams => ({
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    storyId: 'story-1',
    storyTitle: 'Implement feature X',
    completingAgentType: 'planner',
    completingAgentId: 'agent-1',
    phaseResult: { success: true },
    pipelineMetadata: { storyId: 'story-1', storyTitle: 'Implement feature X' },
    ...overrides,
  });

  beforeEach(async () => {
    const mockContextAssembler = {
      assemblePlannerToDevContext: jest.fn().mockReturnValue({
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
      }),
      assembleDevToQAContext: jest.fn().mockReturnValue({
        storyId: 'story-1',
        branch: 'feature/story-1',
        prUrl: 'https://github.com/org/repo/pull/42',
      }),
      assembleQAToDevOpsContext: jest.fn().mockReturnValue({
        storyId: 'story-1',
        qaVerdict: 'PASS',
      }),
      assembleQAToDevRejectionContext: jest.fn().mockReturnValue({
        storyId: 'story-1',
        qaVerdict: 'FAIL',
        failedTests: ['test1'],
      }),
      assembleDevOpsCompletionContext: jest.fn().mockReturnValue({
        storyId: 'story-1',
        deploymentUrl: 'https://my-app.railway.app',
      }),
    };

    const mockRulesEngine = {
      validateHandoff: jest
        .fn()
        .mockResolvedValue({ allowed: true, violations: [] }),
    };

    const mockDepManager = {
      getBlockingStories: jest.fn().mockResolvedValue([]),
      markStoryComplete: jest.fn().mockResolvedValue([]),
      getDependencyGraph: jest.fn().mockResolvedValue({
        stories: new Map(),
        blockedStories: [],
        unblockedStories: [],
      }),
    };

    const mockQueueService = {
      enqueueHandoff: jest.fn().mockResolvedValue('queue-1'),
      processNextInQueue: jest.fn().mockResolvedValue(null),
      getQueueDepth: jest.fn().mockResolvedValue(0),
      getQueuedHandoffs: jest.fn().mockResolvedValue([]),
    };

    const mockHistoryService = {
      recordHandoff: jest.fn().mockResolvedValue(undefined),
      getStoryHandoffs: jest.fn().mockResolvedValue([]),
    };

    const mockStateStore = {
      listActivePipelines: jest.fn().mockResolvedValue([]),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffCoordinatorService,
        {
          provide: HandoffContextAssemblerService,
          useValue: mockContextAssembler,
        },
        {
          provide: CoordinationRulesEngineService,
          useValue: mockRulesEngine,
        },
        {
          provide: StoryDependencyManagerService,
          useValue: mockDepManager,
        },
        { provide: HandoffQueueService, useValue: mockQueueService },
        { provide: HandoffHistoryService, useValue: mockHistoryService },
        { provide: PipelineStateStore, useValue: mockStateStore },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<HandoffCoordinatorService>(
      HandoffCoordinatorService,
    );
    contextAssembler = module.get(HandoffContextAssemblerService);
    rulesEngine = module.get(CoordinationRulesEngineService);
    depManager = module.get(StoryDependencyManagerService);
    queueService = module.get(HandoffQueueService);
    historyService = module.get(HandoffHistoryService);
    stateStore = module.get(PipelineStateStore);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── processHandoff ─────────────────────────────────────────────────────

  describe('processHandoff', () => {
    it('should route Planner completion to Dev Agent', async () => {
      const params = createHandoffParams({
        completingAgentType: 'planner',
      });

      const result = await service.processHandoff(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('dev');
      expect(result.nextPhase).toBe('implementing');
      expect(contextAssembler.assemblePlannerToDevContext).toHaveBeenCalled();
    });

    it('should route Dev Agent completion to QA Agent', async () => {
      const params = createHandoffParams({
        completingAgentType: 'dev',
      });

      const result = await service.processHandoff(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('qa');
      expect(result.nextPhase).toBe('qa');
      expect(contextAssembler.assembleDevToQAContext).toHaveBeenCalled();
    });

    it('should route QA PASS to DevOps Agent', async () => {
      const params = createHandoffParams({
        completingAgentType: 'qa',
        phaseResult: { verdict: 'PASS', qaReport: { summary: 'All good' } },
        pipelineMetadata: {
          storyId: 'story-1',
          qaVerdict: 'PASS',
        },
      });

      const result = await service.processHandoff(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('devops');
      expect(result.nextPhase).toBe('deploying');
      expect(contextAssembler.assembleQAToDevOpsContext).toHaveBeenCalled();
    });

    it('should route DevOps completion to story Done', async () => {
      const params = createHandoffParams({
        completingAgentType: 'devops',
      });

      const result = await service.processHandoff(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('complete');
      expect(result.nextPhase).toBe('complete');
      expect(
        contextAssembler.assembleDevOpsCompletionContext,
      ).toHaveBeenCalled();
    });

    it('should queue handoff when max parallel agents reached', async () => {
      rulesEngine.validateHandoff.mockResolvedValueOnce({
        allowed: false,
        violations: [
          {
            rule: 'max-parallel-agents',
            description: 'Max reached',
            severity: 'error',
          },
        ],
      });

      const params = createHandoffParams();

      const result = await service.processHandoff(params);

      expect(result.queued).toBe(true);
      expect(queueService.enqueueHandoff).toHaveBeenCalled();
    });

    it('should emit orchestrator:handoff event', async () => {
      const params = createHandoffParams({
        completingAgentType: 'planner',
      });

      await service.processHandoff(params);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:handoff',
        expect.objectContaining({
          type: 'orchestrator:handoff',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
      );
    });

    it('should emit orchestrator:story_progress event', async () => {
      const params = createHandoffParams({
        completingAgentType: 'planner',
      });

      await service.processHandoff(params);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:story_progress',
        expect.objectContaining({
          type: 'orchestrator:story_progress',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
      );
    });

    it('should return null for unrecognized agent types', async () => {
      const params = createHandoffParams({
        completingAgentType: 'unknown-agent',
      });

      const result = await service.processHandoff(params);

      expect(result.success).toBe(false);
      expect(result.nextAgentType).toBeNull();
    });

    it('should validate coordination rules before proceeding', async () => {
      const params = createHandoffParams();

      await service.processHandoff(params);

      expect(rulesEngine.validateHandoff).toHaveBeenCalled();
    });

    it('should check story dependencies', async () => {
      depManager.getBlockingStories.mockResolvedValueOnce(['story-0']);

      const params = createHandoffParams();

      const result = await service.processHandoff(params);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:story_blocked',
        expect.objectContaining({
          type: 'orchestrator:story_blocked',
          storyId: 'story-1',
          blockedBy: ['story-0'],
        }),
      );
    });

    it('should record handoff in history', async () => {
      const params = createHandoffParams({
        completingAgentType: 'planner',
      });

      await service.processHandoff(params);

      expect(historyService.recordHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          storyId: 'story-1',
          fromAgentType: 'planner',
          toAgentType: 'dev',
          handoffType: 'normal',
        }),
      );
    });
  });

  // ─── processQARejection ─────────────────────────────────────────────────

  describe('processQARejection', () => {
    const createRejectionParams = (
      overrides: Partial<QARejectionParams> = {},
    ): QARejectionParams => ({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      qaResult: {
        verdict: 'FAIL',
        qaReport: { summary: 'Failed', comments: ['Fix tests'] },
      },
      iterationCount: 1,
      previousMetadata: {
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
      },
      ...overrides,
    });

    it('should route QA FAIL back to Dev Agent', async () => {
      const params = createRejectionParams();

      const result = await service.processQARejection(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('dev');
      expect(result.nextPhase).toBe('implementing');
    });

    it('should route QA NEEDS_CHANGES back to Dev Agent', async () => {
      const params = createRejectionParams({
        qaResult: { verdict: 'NEEDS_CHANGES' },
      });

      const result = await service.processQARejection(params);

      expect(result.success).toBe(true);
      expect(result.nextAgentType).toBe('dev');
      expect(result.nextPhase).toBe('implementing');
    });

    it('should include QA feedback in rejection context', async () => {
      const params = createRejectionParams();

      const result = await service.processQARejection(params);

      expect(
        contextAssembler.assembleQAToDevRejectionContext,
      ).toHaveBeenCalled();
      expect(result.handoffContext).toBeDefined();
    });

    it('should increment iteration count', async () => {
      const params = createRejectionParams({ iterationCount: 2 });

      await service.processQARejection(params);

      expect(
        contextAssembler.assembleQAToDevRejectionContext,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ iterationCount: 2 }),
      );
    });

    it('should escalate to user after max iterations', async () => {
      const params = createRejectionParams({
        iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
      });

      const result = await service.processQARejection(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('escalat');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:escalation',
        expect.objectContaining({
          type: 'orchestrator:escalation',
          storyId: 'story-1',
        }),
      );
    });

    it('should emit orchestrator:qa_rejection event', async () => {
      const params = createRejectionParams();

      await service.processQARejection(params);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:qa_rejection',
        expect.objectContaining({
          type: 'orchestrator:qa_rejection',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
      );
    });

    it('should emit orchestrator:escalation event at limit', async () => {
      const params = createRejectionParams({
        iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
      });

      await service.processQARejection(params);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:escalation',
        expect.objectContaining({
          type: 'orchestrator:escalation',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
      );
    });

    it('should record rejection handoff in history', async () => {
      const params = createRejectionParams();

      await service.processQARejection(params);

      expect(historyService.recordHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          handoffType: 'rejection',
          fromAgentType: 'qa',
          toAgentType: 'dev',
        }),
      );
    });
  });

  // ─── checkStoryDependencies ─────────────────────────────────────────────

  describe('checkStoryDependencies', () => {
    it('should return true when no dependencies', async () => {
      depManager.getBlockingStories.mockResolvedValueOnce([]);

      const result = await service.checkStoryDependencies({
        workspaceId: 'ws-1',
        storyId: 'story-1',
      });

      expect(result).toBe(true);
    });

    it('should return false when blocked by incomplete story', async () => {
      depManager.getBlockingStories.mockResolvedValueOnce(['story-0']);

      const result = await service.checkStoryDependencies({
        workspaceId: 'ws-1',
        storyId: 'story-1',
      });

      expect(result).toBe(false);
    });

    it('should return true when all dependencies complete', async () => {
      depManager.getBlockingStories.mockResolvedValueOnce([]);

      const result = await service.checkStoryDependencies({
        workspaceId: 'ws-1',
        storyId: 'story-1',
      });

      expect(result).toBe(true);
    });
  });

  // ─── getCoordinationStatus ──────────────────────────────────────────────

  describe('getCoordinationStatus', () => {
    it('should return active handoffs, blocked stories, agent count', async () => {
      stateStore.listActivePipelines.mockResolvedValueOnce([
        {
          projectId: 'proj-1',
          workspaceId: 'ws-1',
          workflowId: 'wf-1',
          currentState: 'implementing' as any,
          previousState: null,
          stateEnteredAt: new Date(),
          activeAgentId: 'agent-1',
          activeAgentType: 'dev',
          currentStoryId: 'story-1',
          retryCount: 0,
          maxRetries: 3,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      depManager.getBlockingStories.mockResolvedValueOnce([]);
      queueService.getQueueDepth.mockResolvedValueOnce(2);

      const status = await service.getCoordinationStatus('ws-1');

      expect(status.activeAgents).toBe(1);
      expect(status.queuedHandoffs).toBe(2);
      expect(status.maxAgents).toBe(5);
    });
  });
});
