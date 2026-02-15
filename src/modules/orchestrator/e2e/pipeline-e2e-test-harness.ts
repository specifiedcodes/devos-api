/**
 * PipelineE2ETestHarness
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Orchestrates the full E2E pipeline test lifecycle.
 * Creates a real (but isolated) NestJS testing module with appropriate
 * mocks for the selected test mode, runs the pipeline, and collects
 * assertions.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PipelineStateMachineService } from '../services/pipeline-state-machine.service';
import { PipelineStateStore } from '../services/pipeline-state-store.service';
import { PipelineRecoveryService } from '../services/pipeline-recovery.service';
import { HandoffCoordinatorService } from '../services/handoff-coordinator.service';
import { HandoffContextAssemblerService } from '../services/handoff-context-assembler.service';
import { CoordinationRulesEngineService } from '../services/coordination-rules-engine.service';
import { StoryDependencyManagerService } from '../services/story-dependency-manager.service';
import { HandoffQueueService } from '../services/handoff-queue.service';
import { HandoffHistoryService } from '../services/handoff-history.service';
import { AgentFailureDetectorService } from '../services/agent-failure-detector.service';
import { CheckpointService } from '../services/checkpoint.service';
import { PipelineFailureRecoveryService } from '../services/pipeline-failure-recovery.service';
import { PipelineStateHistory } from '../entities/pipeline-state-history.entity';
import { HandoffHistory } from '../entities/handoff-history.entity';
import { FailureRecoveryHistory } from '../entities/failure-recovery-history.entity';
import { RedisService } from '../../redis/redis.service';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';
import { CLISessionLifecycleService } from '../services/cli-session-lifecycle.service';
import { SessionHealthMonitorService } from '../services/session-health-monitor.service';
import { PipelineState } from '../interfaces/pipeline.interfaces';
import {
  E2ETestConfig,
  E2EPipelineResult,
  StateTransitionRecord,
  AgentExecutionRecord,
  HandoffRecordE2E,
  EmittedEventRecord,
  GitOperationRecord,
  CheckpointRecordE2E,
  MemorySnapshot,
  PipelineErrorRecord,
  TeardownReport,
} from './e2e-pipeline.interfaces';
import { MockCLIResponseProvider } from './mock-cli-response-provider';

// ─── Mock Redis Store ───────────────────────────────────────────────────────

/**
 * In-memory Redis mock with sorted set support.
 * Follows pattern from orchestrator.integration.spec.ts.
 */
export class MockRedisStore {
  private store = new Map<string, string>();
  private sortedSets = new Map<string, { score: number; member: string }[]>();

  get = jest.fn((key: string) => {
    return Promise.resolve(this.store.get(key) || null);
  });

  set = jest.fn((key: string, value: string, _ttl?: number) => {
    this.store.set(key, value);
    return Promise.resolve();
  });

  setnx = jest.fn((key: string, value: string, _ttl?: number) => {
    if (this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, value);
    return Promise.resolve('OK');
  });

  del = jest.fn((...keys: string[]) => {
    keys.forEach((k) => this.store.delete(k));
    return Promise.resolve();
  });

  scanKeys = jest.fn((pattern: string) => {
    const prefix = pattern.replace('*', '');
    return Promise.resolve(
      Array.from(this.store.keys()).filter((k) => k.startsWith(prefix)),
    );
  });

  expire = jest.fn().mockResolvedValue(true);

  zadd = jest.fn((key: string, score: number, member: string) => {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, []);
    const set = this.sortedSets.get(key)!;
    set.push({ score, member });
    set.sort((a, b) => a.score - b.score);
    return Promise.resolve(1);
  });

  zrangebyscore = jest.fn((key: string, min: number | string = '-inf', max: number | string = '+inf') => {
    const set = this.sortedSets.get(key) || [];
    const minScore = min === '-inf' ? -Infinity : Number(min);
    const maxScore = max === '+inf' ? Infinity : Number(max);
    const filtered = set.filter((e) => e.score >= minScore && e.score <= maxScore);
    return Promise.resolve(filtered.map((e) => e.member));
  });

  zrevrange = jest.fn((key: string, start: number = 0, stop: number = -1) => {
    const set = this.sortedSets.get(key) || [];
    const reversed = [...set].reverse();
    const end = stop === -1 ? reversed.length : stop + 1;
    return Promise.resolve(reversed.slice(start, end).map((e) => e.member));
  });

  zrem = jest.fn((key: string, ...members: string[]) => {
    const set = this.sortedSets.get(key) || [];
    const remaining = set.filter((e) => !members.includes(e.member));
    const removed = set.length - remaining.length;
    this.sortedSets.set(key, remaining);
    return Promise.resolve(removed);
  });

  clear(): void {
    this.store.clear();
    this.sortedSets.clear();
  }
}

// ─── Mock Repository ────────────────────────────────────────────────────────

function createMockRepository() {
  const entities: any[] = [];
  return {
    create: jest.fn().mockImplementation((data) => ({
      id: `entity-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      ...data,
    })),
    save: jest.fn().mockImplementation((entity) => {
      entities.push(entity);
      return Promise.resolve(entity);
    }),
    findAndCount: jest.fn().mockImplementation(() =>
      Promise.resolve([entities, entities.length]),
    ),
    find: jest.fn().mockImplementation(() => Promise.resolve(entities)),
    findOne: jest.fn().mockResolvedValue(null),
    getEntities: () => entities,
  };
}

// ─── PipelineE2ETestHarness ─────────────────────────────────────────────────

export class PipelineE2ETestHarness {
  private module: TestingModule | null = null;
  private config: E2ETestConfig | null = null;
  private mockRedis: MockRedisStore | null = null;
  private mockCLIProvider: MockCLIResponseProvider | null = null;
  private eventCapture: EmittedEventRecord[] = [];
  private stateTransitions: StateTransitionRecord[] = [];
  private agentExecutions: AgentExecutionRecord[] = [];
  private handoffs: HandoffRecordE2E[] = [];
  private gitOperations: GitOperationRecord[] = [];
  private checkpoints: CheckpointRecordE2E[] = [];
  private errors: PipelineErrorRecord[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private memoryInterval: NodeJS.Timeout | null = null;
  private activeSessions = new Set<string>();
  private activeTimers = new Set<NodeJS.Timeout>();

  /**
   * Set up the test module based on configuration.
   */
  async setup(config: E2ETestConfig): Promise<void> {
    this.config = config;
    this.mockRedis = new MockRedisStore();
    this.mockCLIProvider = new MockCLIResponseProvider();

    // Reset tracking arrays
    this.eventCapture = [];
    this.stateTransitions = [];
    this.agentExecutions = [];
    this.handoffs = [];
    this.gitOperations = [];
    this.checkpoints = [];
    this.errors = [];
    this.memorySnapshots = [];

    const mockHistoryRepo = createMockRepository();
    const mockHandoffHistoryRepo = createMockRepository();
    const mockFailureRecoveryHistoryRepo = createMockRepository();

    // Real EventEmitter2 for event capture
    const eventEmitter = new EventEmitter2();

    // Wire event capture - capture all events
    const originalEmit = eventEmitter.emit.bind(eventEmitter);
    eventEmitter.emit = (event: string | string[], ...values: any[]): boolean => {
      const eventName = Array.isArray(event) ? event[0] : event;
      this.eventCapture.push({
        type: eventName,
        timestamp: new Date(),
        payload: values[0] || {},
      });

      // Track specific event types (NestJS EventEmitter2 uses dots for event names)
      if (eventName === 'pipeline.state_changed') {
        const payload = values[0] || {};
        this.stateTransitions.push({
          from: payload.previousState,
          to: payload.newState,
          triggeredBy: payload.metadata?.triggeredBy || 'unknown',
          timestamp: new Date(),
          metadata: payload.metadata,
        });
      }

      if (eventName === 'orchestrator.handoff') {
        const payload = values[0] || {};
        this.handoffs.push({
          id: `handoff-${Date.now()}`,
          fromAgentType: payload.fromAgent?.type || 'unknown',
          toAgentType: payload.toAgent?.type || 'unknown',
          fromPhase: payload.fromPhase || 'unknown',
          toPhase: payload.toPhase || 'unknown',
          handoffType: payload.handoffType || 'normal',
          context: payload.handoffContext || {},
          timestamp: new Date(),
        });
      }

      return originalEmit(event as string, ...values);
    };

    const mockAgentQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: `job-${Date.now()}` }),
    };

    const mockCLISessionLifecycleService = {
      spawnSession: jest.fn().mockImplementation((params: any) => {
        const sessionId = `session-${Date.now()}`;
        this.activeSessions.add(sessionId);
        return Promise.resolve({
          sessionId,
          pid: Math.floor(Math.random() * 50000) + 10000,
          status: 'running',
        });
      }),
      terminateSession: jest.fn().mockImplementation((sessionId: string) => {
        this.activeSessions.delete(sessionId);
        return Promise.resolve({ success: true });
      }),
      getSessionStatus: jest.fn().mockResolvedValue({ status: 'running' }),
    };

    this.module = await Test.createTestingModule({
      providers: [
        // Real services (state machine logic under test)
        PipelineStateMachineService,
        PipelineStateStore,
        PipelineRecoveryService,
        HandoffCoordinatorService,
        HandoffContextAssemblerService,
        CoordinationRulesEngineService,
        StoryDependencyManagerService,
        HandoffQueueService,
        HandoffHistoryService,
        AgentFailureDetectorService,
        CheckpointService,
        PipelineFailureRecoveryService,

        // Mocked infrastructure
        { provide: RedisService, useValue: this.mockRedis },
        {
          provide: getRepositoryToken(PipelineStateHistory),
          useValue: mockHistoryRepo,
        },
        {
          provide: getRepositoryToken(HandoffHistory),
          useValue: mockHandoffHistoryRepo,
        },
        {
          provide: getRepositoryToken(FailureRecoveryHistory),
          useValue: mockFailureRecoveryHistoryRepo,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AgentQueueService, useValue: mockAgentQueueService },
        {
          provide: CLISessionLifecycleService,
          useValue: mockCLISessionLifecycleService,
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            startMonitoring: jest.fn(),
            stopMonitoring: jest.fn(),
            isHealthy: jest.fn().mockReturnValue(true),
            getSessionHealth: jest.fn().mockReturnValue({ healthy: true }),
          },
        },
      ],
    }).compile();

    // Start memory monitoring if enabled
    if (config.memoryCheck.enabled) {
      this.startMemoryMonitoring(config.memoryCheck.checkIntervalMs);
    }
  }

  /**
   * Run the full pipeline from start to completion.
   */
  async runPipeline(): Promise<E2EPipelineResult> {
    if (!this.module || !this.config) {
      throw new Error('Harness not set up. Call setup() first.');
    }

    const startTime = Date.now();
    const stateMachine = this.module.get<PipelineStateMachineService>(
      PipelineStateMachineService,
    );

    // Take initial memory snapshot
    this.takeMemorySnapshot('initial');

    try {
      // Start the pipeline
      const startResult = await stateMachine.startPipeline(
        this.config.workspace.workspaceId,
        this.config.workspace.workspaceId,
        {
          triggeredBy: 'pipeline:start',
          storyId: 'e2e-test-story',
        },
      );

      // Record agent execution for planner
      this.recordAgentExecution('planner', startResult.workflowId);

      // In mock mode, simulate the pipeline phases
      if (this.config.mode === 'mock' || this.config.mode === 'smoke') {
        await this.simulatePipelinePhases(stateMachine);
      }

      // Wait for completion or timeout
      const pipelineState = await this.waitForCompletion(
        stateMachine,
        this.config.timeoutMs,
      );

      const durationMs = Date.now() - startTime;

      // Take final memory snapshot
      this.takeMemorySnapshot('final');

      return {
        success: pipelineState === PipelineState.COMPLETE,
        durationMs,
        stateTransitions: this.stateTransitions,
        agentExecutions: this.agentExecutions,
        handoffs: this.handoffs,
        emittedEvents: this.eventCapture,
        gitOperations: this.gitOperations,
        checkpoints: this.checkpoints,
        memorySnapshots: this.memorySnapshots,
        errors: this.errors,
        finalStoryStatus:
          pipelineState === PipelineState.COMPLETE ? 'done' : 'in-progress',
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.errors.push({
        phase: 'pipeline',
        agentType: null,
        errorType: 'pipeline_error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recoverable: false,
      });

      return {
        success: false,
        durationMs,
        stateTransitions: this.stateTransitions,
        agentExecutions: this.agentExecutions,
        handoffs: this.handoffs,
        emittedEvents: this.eventCapture,
        gitOperations: this.gitOperations,
        checkpoints: this.checkpoints,
        memorySnapshots: this.memorySnapshots,
        errors: this.errors,
        finalStoryStatus: 'failed',
      };
    }
  }

  /**
   * Tear down the test module and clean up resources.
   */
  async teardown(): Promise<TeardownReport> {
    const warnings: string[] = [];

    // Stop memory monitoring
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.activeTimers.delete(this.memoryInterval);
      this.memoryInterval = null;
    }

    // Check for unclosed sessions
    const unclosedSessions = this.activeSessions.size;
    if (unclosedSessions > 0) {
      warnings.push(
        `${unclosedSessions} CLI session(s) were not properly terminated`,
      );
    }

    // Check for dangling timers
    const danglingTimers = this.activeTimers.size;
    if (danglingTimers > 0) {
      warnings.push(`${danglingTimers} timer(s) were not cleared`);
      this.activeTimers.forEach((t) => clearTimeout(t));
      this.activeTimers.clear();
    }

    // Close NestJS testing module
    if (this.module) {
      await this.module.close();
      this.module = null;
    }

    return {
      unclosedSessions,
      danglingTimers,
      eventListenerLeaks: 0,
      warnings,
    };
  }

  /**
   * Get the underlying NestJS testing module (for direct service access).
   */
  getModule(): TestingModule {
    if (!this.module) {
      throw new Error('Harness not set up. Call setup() first.');
    }
    return this.module;
  }

  /**
   * Get the MockCLIResponseProvider for test customization.
   */
  getMockCLIProvider(): MockCLIResponseProvider {
    if (!this.mockCLIProvider) {
      throw new Error('Harness not set up. Call setup() first.');
    }
    return this.mockCLIProvider;
  }

  /**
   * Get captured events for assertion.
   */
  getCapturedEvents(): EmittedEventRecord[] {
    return [...this.eventCapture];
  }

  /**
   * Get state transitions for assertion.
   */
  getStateTransitions(): StateTransitionRecord[] {
    return [...this.stateTransitions];
  }

  /**
   * Get handoff records for assertion.
   */
  getHandoffs(): HandoffRecordE2E[] {
    return [...this.handoffs];
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async simulatePipelinePhases(
    stateMachine: PipelineStateMachineService,
  ): Promise<void> {
    if (!this.config) return;
    const projectId = this.config.workspace.workspaceId;

    // Simulate: PLANNING -> IMPLEMENTING (planner handoff)
    await stateMachine.transition(projectId, PipelineState.IMPLEMENTING, {
      triggeredBy: 'handoff:planner->dev',
    });
    this.recordAgentExecution('dev', 'dev-workflow');
    this.recordGitOperation('branch', `feature/e2e-test-story`);

    // Simulate: IMPLEMENTING -> QA (dev handoff)
    await stateMachine.transition(projectId, PipelineState.QA, {
      triggeredBy: 'handoff:dev->qa',
    });
    this.recordAgentExecution('qa', 'qa-workflow');
    this.recordGitOperation('commit', `feature/e2e-test-story`);
    this.recordGitOperation('pr', `feature/e2e-test-story`);

    // Simulate: QA -> DEPLOYING (qa handoff)
    await stateMachine.transition(projectId, PipelineState.DEPLOYING, {
      triggeredBy: 'handoff:qa->devops',
    });
    this.recordAgentExecution('devops', 'devops-workflow');
    this.recordGitOperation('merge', 'main');

    // Simulate: DEPLOYING -> COMPLETE (devops handoff)
    await stateMachine.transition(projectId, PipelineState.COMPLETE, {
      triggeredBy: 'handoff:devops->complete',
    });
  }

  private async waitForCompletion(
    stateMachine: PipelineStateMachineService,
    timeoutMs: number,
  ): Promise<PipelineState> {
    if (!this.config) return PipelineState.FAILED;
    const projectId = this.config.workspace.workspaceId;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const stateStore = this.module!.get<PipelineStateStore>(
        PipelineStateStore,
      );
      const state = await stateStore.getState(projectId);
      if (
        state &&
        (state.currentState === PipelineState.COMPLETE ||
          state.currentState === PipelineState.FAILED)
      ) {
        return state.currentState;
      }
      // Short poll interval for tests
      await new Promise((r) => setTimeout(r, 50));
    }

    return PipelineState.FAILED; // Timeout
  }

  private recordAgentExecution(agentType: string, workflowId: string): void {
    const now = new Date();
    this.agentExecutions.push({
      agentType,
      agentId: `agent-${agentType}-${Date.now()}`,
      sessionId: `session-${agentType}-${Date.now()}`,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      exitCode: 0,
      outputLineCount: 0,
      result: null,
    });
  }

  private recordGitOperation(
    operation: 'branch' | 'commit' | 'push' | 'pr' | 'merge',
    branch: string,
  ): void {
    this.gitOperations.push({
      operation,
      branch,
      commitHash:
        operation === 'commit' || operation === 'merge'
          ? 'a'.repeat(40)
          : null,
      prNumber: operation === 'pr' ? 42 : null,
      prUrl:
        operation === 'pr'
          ? 'https://github.com/test-org/e2e-test-repo/pull/42'
          : null,
      timestamp: new Date(),
    });
  }

  private startMemoryMonitoring(intervalMs: number): void {
    this.memoryInterval = setInterval(() => {
      this.takeMemorySnapshot('monitoring');
    }, intervalMs);
    this.activeTimers.add(this.memoryInterval);
  }

  private takeMemorySnapshot(phase: string): void {
    const mem = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: new Date(),
      phase,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    });
  }
}
