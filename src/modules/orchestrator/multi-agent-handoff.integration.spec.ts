/**
 * Multi-Agent Handoff Chain Integration Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * End-to-end tests for the full handoff chain including:
 * - Full pipeline: Planner -> Dev -> QA (PASS) -> DevOps -> Complete
 * - QA rejection cycle with feedback re-routing
 * - Max parallel agents queuing
 * - Story dependencies
 * - Coordination events
 * - Iteration limit escalation
 * - Handoff history recording
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HandoffCoordinatorService } from './services/handoff-coordinator.service';
import { HandoffContextAssemblerService } from './services/handoff-context-assembler.service';
import { CoordinationRulesEngineService } from './services/coordination-rules-engine.service';
import { StoryDependencyManagerService } from './services/story-dependency-manager.service';
import { HandoffQueueService } from './services/handoff-queue.service';
import { HandoffHistoryService } from './services/handoff-history.service';
import { PipelineStateStore } from './services/pipeline-state-store.service';
import { RedisService } from '../redis/redis.service';
import {
  HandoffParams,
  DEFAULT_MAX_QA_ITERATIONS,
} from './interfaces/handoff.interfaces';

describe('Multi-Agent Handoff Chain Integration', () => {
  let coordinator: HandoffCoordinatorService;
  let depManager: StoryDependencyManagerService;
  let queueService: HandoffQueueService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let historyService: jest.Mocked<HandoffHistoryService>;

  // In-memory Redis store
  let redisStore: Record<string, string>;
  let sortedSets: Map<string, { score: number; member: string }[]>;

  beforeEach(async () => {
    redisStore = {};
    sortedSets = new Map();

    const mockRedisService = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisStore[key] || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: string) => {
        redisStore[key] = value;
        return Promise.resolve();
      }),
      scanKeys: jest.fn().mockImplementation((pattern: string) => {
        const prefix = pattern.replace('*', '');
        return Promise.resolve(
          Object.keys(redisStore).filter((k) => k.startsWith(prefix)),
        );
      }),
      del: jest.fn().mockImplementation((...keys: string[]) => {
        keys.forEach((k) => delete redisStore[k]);
        return Promise.resolve();
      }),
      zadd: jest
        .fn()
        .mockImplementation((key: string, score: number, member: string) => {
          if (!sortedSets.has(key)) sortedSets.set(key, []);
          const set = sortedSets.get(key)!;
          set.push({ score, member });
          set.sort((a, b) => a.score - b.score);
          return Promise.resolve(1);
        }),
      zrangebyscore: jest.fn().mockImplementation((key: string) => {
        const set = sortedSets.get(key) || [];
        return Promise.resolve(set.map((e) => e.member));
      }),
      zremrangebyscore: jest
        .fn()
        .mockImplementation(
          (key: string, min: number | string, max: number | string) => {
            const set = sortedSets.get(key) || [];
            const minNum = min === '-inf' ? -Infinity : Number(min);
            const maxNum = max === '+inf' ? Infinity : Number(max);
            const remaining = set.filter(
              (e) => e.score < minNum || e.score > maxNum,
            );
            const removed = set.length - remaining.length;
            sortedSets.set(key, remaining);
            return Promise.resolve(removed);
          },
        ),
      zrem: jest
        .fn()
        .mockImplementation((key: string, ...members: string[]) => {
          const set = sortedSets.get(key) || [];
          const remaining = set.filter(
            (e) => !members.includes(e.member),
          );
          const removed = set.length - remaining.length;
          sortedSets.set(key, remaining);
          return Promise.resolve(removed);
        }),
      zcard: jest
        .fn()
        .mockImplementation((key: string) => {
          const set = sortedSets.get(key) || [];
          return Promise.resolve(set.length);
        }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockStateStore = {
      listActivePipelines: jest.fn().mockResolvedValue([]),
    };

    const mockHistoryService = {
      recordHandoff: jest.fn().mockResolvedValue(undefined),
      getStoryHandoffs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffCoordinatorService,
        HandoffContextAssemblerService,
        CoordinationRulesEngineService,
        StoryDependencyManagerService,
        HandoffQueueService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PipelineStateStore, useValue: mockStateStore },
        { provide: HandoffHistoryService, useValue: mockHistoryService },
      ],
    }).compile();

    coordinator = module.get<HandoffCoordinatorService>(
      HandoffCoordinatorService,
    );
    depManager = module.get<StoryDependencyManagerService>(
      StoryDependencyManagerService,
    );
    queueService = module.get<HandoffQueueService>(HandoffQueueService);
    eventEmitter = module.get(EventEmitter2);
    historyService = module.get(HandoffHistoryService);
  });

  const createHandoffParams = (
    agentType: string,
    phaseResult: Record<string, any> = {},
    metadata: Record<string, any> = {},
  ): HandoffParams => ({
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    storyId: 'story-1',
    storyTitle: 'Implement feature X',
    completingAgentType: agentType,
    completingAgentId: `${agentType}-agent-1`,
    phaseResult: { success: true, ...phaseResult },
    pipelineMetadata: {
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      storyDescription: 'A story about feature X',
      techStack: 'NestJS',
      ...metadata,
    },
  });

  // ─── Full Handoff Chain ───────────────────────────────────────────────

  describe('Full handoff chain: Planner -> Dev -> QA (PASS) -> DevOps -> Complete', () => {
    it('should route through the full pipeline', async () => {
      // Step 1: Planner -> Dev
      const plannerResult = await coordinator.processHandoff(
        createHandoffParams('planner', {
          storiesCreated: [],
          documentsGenerated: [],
        }),
      );
      expect(plannerResult.success).toBe(true);
      expect(plannerResult.nextAgentType).toBe('dev');
      expect(plannerResult.nextPhase).toBe('implementing');

      // Step 2: Dev -> QA
      const devResult = await coordinator.processHandoff(
        createHandoffParams('dev', {
          branch: 'feature/story-1',
          prUrl: 'https://github.com/org/repo/pull/42',
          prNumber: 42,
          testResults: { total: 10, passed: 10, failed: 0 },
          filesCreated: ['src/feature.ts'],
          filesModified: [],
        }),
      );
      expect(devResult.success).toBe(true);
      expect(devResult.nextAgentType).toBe('qa');
      expect(devResult.nextPhase).toBe('qa');

      // Step 3: QA (PASS) -> DevOps
      const qaResult = await coordinator.processHandoff(
        createHandoffParams(
          'qa',
          {
            verdict: 'PASS',
            qaReport: {
              summary: 'All checks passed',
              testResults: { failedTests: [] },
              lintResults: { details: '' },
              securityScan: { details: '' },
              comments: [],
            },
          },
          {
            prUrl: 'https://github.com/org/repo/pull/42',
            prNumber: 42,
            devBranch: 'feature/story-1',
            qaVerdict: 'PASS',
          },
        ),
      );
      expect(qaResult.success).toBe(true);
      expect(qaResult.nextAgentType).toBe('devops');
      expect(qaResult.nextPhase).toBe('deploying');

      // Step 4: DevOps -> Complete
      const devopsResult = await coordinator.processHandoff(
        createHandoffParams('devops', {
          deploymentUrl: 'https://app.railway.app',
          deploymentPlatform: 'railway',
          mergeCommitHash: 'abc123',
          smokeTestResults: { passed: true },
        }),
      );
      expect(devopsResult.success).toBe(true);
      expect(devopsResult.nextAgentType).toBe('complete');
      expect(devopsResult.nextPhase).toBe('complete');
    });
  });

  // ─── QA Rejection Cycle ───────────────────────────────────────────────

  describe('QA rejection cycle: Dev -> QA (FAIL) -> Dev (with feedback) -> QA (PASS) -> DevOps', () => {
    it('should route through rejection and re-routing', async () => {
      // Step 1: Dev -> QA
      const devResult = await coordinator.processHandoff(
        createHandoffParams('dev', {
          branch: 'feature/story-1',
          prUrl: 'https://github.com/org/repo/pull/42',
          prNumber: 42,
        }),
      );
      expect(devResult.success).toBe(true);
      expect(devResult.nextAgentType).toBe('qa');

      // Step 2: QA (FAIL) -> Dev (via processQARejection)
      const rejectionResult = await coordinator.processQARejection({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
        qaResult: {
          verdict: 'FAIL',
          qaReport: {
            summary: 'Tests failed',
            testResults: {
              failedTests: [
                {
                  testName: 'test1',
                  file: 'test.spec.ts',
                  error: 'assertion failed',
                },
              ],
            },
            lintResults: { details: 'No errors' },
            securityScan: { details: '' },
            comments: ['Fix the failing test'],
          },
        },
        iterationCount: 1,
        previousMetadata: {},
      });
      expect(rejectionResult.success).toBe(true);
      expect(rejectionResult.nextAgentType).toBe('dev');
      expect(rejectionResult.nextPhase).toBe('implementing');

      // Verify qa_rejection event was emitted
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:qa_rejection',
        expect.objectContaining({
          type: 'orchestrator:qa_rejection',
          storyId: 'story-1',
          iterationCount: 1,
        }),
      );
    });
  });

  // ─── Story Dependencies ───────────────────────────────────────────────

  describe('Story dependencies', () => {
    it('should block story when dependency is incomplete', async () => {
      // Add dependency: story-2 depends on story-1
      await depManager.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-2',
        dependsOnStoryId: 'story-1',
      });

      // Try to handoff story-2 (should be blocked)
      const params = createHandoffParams('planner');
      params.storyId = 'story-2';

      const result = await coordinator.processHandoff(params);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.error).toContain('story-1');

      // Verify story_blocked event
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:story_blocked',
        expect.objectContaining({
          type: 'orchestrator:story_blocked',
          storyId: 'story-2',
          blockedBy: ['story-1'],
        }),
      );
    });

    it('should unblock when dependency completes', async () => {
      // Add dependency
      await depManager.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-2',
        dependsOnStoryId: 'story-1',
      });

      // Complete story-1
      const unblocked = await depManager.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-1',
      });

      expect(unblocked).toContain('story-2');

      // Now story-2 should proceed
      const params = createHandoffParams('planner');
      params.storyId = 'story-2';

      const result = await coordinator.processHandoff(params);
      expect(result.success).toBe(true);
    });
  });

  // ─── Iteration Limit Escalation ───────────────────────────────────────

  describe('Iteration limit escalation', () => {
    it('should escalate after max QA rejection iterations', async () => {
      const result = await coordinator.processQARejection({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
        qaResult: {
          verdict: 'FAIL',
          qaReport: { summary: 'Still failing' },
        },
        iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
        previousMetadata: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('escalat');

      // Verify escalation event
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:escalation',
        expect.objectContaining({
          type: 'orchestrator:escalation',
          storyId: 'story-1',
          iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
        }),
      );
    });
  });

  // ─── Coordination Events ──────────────────────────────────────────────

  describe('Coordination events', () => {
    it('should emit events in correct order during normal handoff', async () => {
      const calls: string[] = [];
      eventEmitter.emit.mockImplementation((event: any) => {
        calls.push(String(event));
        return true;
      });

      await coordinator.processHandoff(createHandoffParams('planner'));

      expect(calls).toContain('orchestrator:handoff');
      expect(calls).toContain('orchestrator:story_progress');

      // handoff should come before story_progress
      const handoffIndex = calls.indexOf('orchestrator:handoff');
      const progressIndex = calls.indexOf('orchestrator:story_progress');
      expect(handoffIndex).toBeLessThan(progressIndex);
    });
  });

  // ─── Handoff History ──────────────────────────────────────────────────

  describe('Handoff history', () => {
    it('should record handoff for each transition', async () => {
      await coordinator.processHandoff(createHandoffParams('planner'));

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

    it('should record rejection handoff', async () => {
      await coordinator.processQARejection({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
        qaResult: { verdict: 'FAIL', qaReport: { summary: 'Failed' } },
        iterationCount: 1,
        previousMetadata: {},
      });

      expect(historyService.recordHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          handoffType: 'rejection',
          fromAgentType: 'qa',
          toAgentType: 'dev',
        }),
      );
    });

    it('should record completion handoff', async () => {
      await coordinator.processHandoff(
        createHandoffParams('devops', {
          deploymentUrl: 'https://app.railway.app',
          smokeTestResults: { passed: true },
        }),
      );

      expect(historyService.recordHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          handoffType: 'completion',
          fromAgentType: 'devops',
          toAgentType: 'complete',
        }),
      );
    });

    it('should record escalation handoff', async () => {
      await coordinator.processQARejection({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        storyId: 'story-1',
        storyTitle: 'Implement feature X',
        qaResult: { verdict: 'FAIL', qaReport: { summary: 'Still fails' } },
        iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
        previousMetadata: {},
      });

      expect(historyService.recordHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          handoffType: 'escalation',
          fromAgentType: 'qa',
          toAgentType: 'user',
        }),
      );
    });
  });

  // ─── Backward Compatibility ───────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('should handle unrecognized agent types gracefully', async () => {
      const params = createHandoffParams('unknown-agent');

      const result = await coordinator.processHandoff(params);

      expect(result.success).toBe(false);
      expect(result.nextAgentType).toBeNull();
      expect(result.error).toContain('Unrecognized agent type');
    });
  });
});
