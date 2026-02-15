/**
 * E2E Pipeline Test Interfaces
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Defines all types and interfaces for end-to-end pipeline testing,
 * including test configuration, result tracking, assertion structures,
 * memory monitoring, and teardown reporting.
 */

import { PipelineState } from '../interfaces/pipeline.interfaces';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Full mode timeout: 30 minutes */
export const DEFAULT_FULL_TIMEOUT_MS = 1_800_000;

/** Mock mode timeout: 5 minutes */
export const DEFAULT_MOCK_TIMEOUT_MS = 300_000;

/** Smoke mode timeout: 2 minutes */
export const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;

/** Default max heap growth before leak is flagged (50 MB) */
export const DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB = 50;

/** Default memory snapshot interval: 5 seconds */
export const DEFAULT_MEMORY_CHECK_INTERVAL_MS = 5_000;

// ─── E2E Test Configuration ─────────────────────────────────────────────────

/**
 * E2E Pipeline Test Configuration.
 * Determines which components are real vs mocked and
 * what assertions are active.
 */
export interface E2ETestConfig {
  /**
   * Test mode determines real vs mock boundaries:
   * - 'full': Real Claude API, real Git, real deployment (nightly only)
   * - 'mock': Mocked CLI responses, real state machine (CI-friendly)
   * - 'smoke': Infrastructure only, no code generation (fastest)
   */
  mode: 'full' | 'mock' | 'smoke';

  /** Timeout for the full pipeline run (ms) */
  timeoutMs: number;

  /** Test project configuration */
  project: {
    name: string;
    template: string;
    techStack: string;
  };

  /** Test workspace/user configuration */
  workspace: {
    workspaceId: string;
    userId: string;
    apiKey: string;
  };

  /** GitHub configuration */
  github: {
    repoOwner: string;
    repoName: string;
    githubToken: string;
  };

  /** Deployment configuration */
  deployment: {
    platform: 'railway' | 'vercel' | 'mock';
    environment: string;
  };

  /** Memory leak detection configuration */
  memoryCheck: {
    enabled: boolean;
    maxHeapGrowthMB: number;
    checkIntervalMs: number;
  };
}

// ─── E2E Pipeline Result ────────────────────────────────────────────────────

/**
 * Comprehensive result of an E2E pipeline run.
 */
export interface E2EPipelineResult {
  /** Whether the full pipeline completed successfully */
  success: boolean;

  /** Total duration of the pipeline run in milliseconds */
  durationMs: number;

  /** State machine transition history */
  stateTransitions: StateTransitionRecord[];

  /** All agents that were spawned during the pipeline */
  agentExecutions: AgentExecutionRecord[];

  /** All handoffs that occurred between agents */
  handoffs: HandoffRecordE2E[];

  /** All WebSocket events emitted during the pipeline */
  emittedEvents: EmittedEventRecord[];

  /** Git operations performed */
  gitOperations: GitOperationRecord[];

  /** Checkpoints created during the pipeline */
  checkpoints: CheckpointRecordE2E[];

  /** Memory usage snapshots */
  memorySnapshots: MemorySnapshot[];

  /** Any errors encountered (empty if fully successful) */
  errors: PipelineErrorRecord[];

  /** Story status at end of pipeline */
  finalStoryStatus: string;
}

// ─── Record Types ───────────────────────────────────────────────────────────

/**
 * A recorded state transition.
 */
export interface StateTransitionRecord {
  from: PipelineState;
  to: PipelineState;
  triggeredBy: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * A recorded agent execution.
 */
export interface AgentExecutionRecord {
  agentType: string;
  agentId: string;
  sessionId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  exitCode: number | null;
  outputLineCount: number;
  result: Record<string, any> | null;
}

/**
 * A recorded handoff for E2E testing (compatible with handoff.interfaces HandoffRecord).
 */
export interface HandoffRecordE2E {
  id: string;
  fromAgentType: string;
  toAgentType: string;
  fromPhase: string;
  toPhase: string;
  handoffType: 'normal' | 'rejection' | 'escalation' | 'completion';
  context: Record<string, any>;
  timestamp: Date;
}

/**
 * A recorded WebSocket event.
 */
export interface EmittedEventRecord {
  type: string;
  timestamp: Date;
  payload: Record<string, any>;
}

/**
 * A recorded git operation.
 */
export interface GitOperationRecord {
  operation: 'branch' | 'commit' | 'push' | 'pr' | 'merge';
  branch: string | null;
  commitHash: string | null;
  prNumber: number | null;
  prUrl: string | null;
  timestamp: Date;
}

/**
 * A recorded checkpoint (E2E tracking).
 */
export interface CheckpointRecordE2E {
  id: string;
  sessionId: string;
  commitHash: string;
  branch: string;
  description: string;
  createdAt: Date;
}

// ─── Memory Monitoring ──────────────────────────────────────────────────────

/**
 * A point-in-time memory snapshot.
 */
export interface MemorySnapshot {
  /** Timestamp when snapshot was taken */
  timestamp: Date;
  /** Pipeline phase at snapshot time */
  phase: string;
  /** V8 heap used (bytes) */
  heapUsed: number;
  /** V8 heap total (bytes) */
  heapTotal: number;
  /** Resident set size (bytes) */
  rss: number;
  /** External memory (bytes) */
  external: number;
}

/**
 * Memory leak analysis report.
 */
export interface MemoryLeakReport {
  /** Initial heap usage */
  initialHeapUsed: number;
  /** Final heap usage */
  finalHeapUsed: number;
  /** Maximum heap usage during pipeline */
  peakHeapUsed: number;
  /** Heap growth from initial to final */
  heapGrowthBytes: number;
  /** Whether growth exceeds configured threshold */
  leakDetected: boolean;
  /** All snapshots for analysis */
  snapshots: MemorySnapshot[];
}

// ─── Error Tracking ─────────────────────────────────────────────────────────

/**
 * A pipeline error record for E2E test diagnostics.
 */
export interface PipelineErrorRecord {
  phase: string;
  agentType: string | null;
  errorType: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

// ─── Assertion Structures ───────────────────────────────────────────────────

/**
 * Per-stage assertion results for the pipeline.
 */
export interface PipelineStageAssertions {
  /** State machine was in expected state during this stage */
  correctState: boolean;
  /** Agent was spawned with correct type and configuration */
  agentSpawned: boolean;
  /** CLI session was created and produced output */
  cliSessionCreated: boolean;
  /** Output was streamed (WebSocket events emitted) */
  outputStreamed: boolean;
  /** Handoff to next agent occurred with correct context */
  handoffCompleted: boolean;
  /** Expected git operations were performed */
  gitOpsPerformed: boolean;
  /** Expected WebSocket events were emitted */
  eventsEmitted: boolean;
  /** No unexpected errors occurred */
  noErrors: boolean;
}

/**
 * Teardown report after test cleanup.
 */
export interface TeardownReport {
  unclosedSessions: number;
  danglingTimers: number;
  eventListenerLeaks: number;
  warnings: string[];
}

/**
 * Smoke test assertion results (infrastructure-only validation).
 */
export interface SmokeTestAssertions {
  /** NestJS testing module created successfully with all providers */
  moduleCreated: boolean;
  /** PipelineStateMachineService is injectable and functional */
  stateMachineReady: boolean;
  /** PipelineStateStore Redis operations succeed (mocked) */
  stateStoreReady: boolean;
  /** EventEmitter2 is wired and events can be emitted/received */
  eventEmitterReady: boolean;
  /** HandoffCoordinatorService is injectable and functional */
  handoffCoordinatorReady: boolean;
  /** AgentFailureDetectorService is injectable and functional */
  failureDetectorReady: boolean;
  /** CheckpointService is injectable and functional */
  checkpointServiceReady: boolean;
  /** PipelineFailureRecoveryService is injectable and functional */
  failureRecoveryReady: boolean;
  /** Pipeline can start (IDLE -> PLANNING transition works) */
  pipelineCanStart: boolean;
  /** Pipeline can pause and resume */
  pipelineCanPauseResume: boolean;
  /** No circular dependency errors in module */
  noDependencyErrors: boolean;
}

// ─── Expected Sequences ─────────────────────────────────────────────────────

/**
 * Expected state transition sequence for a full pipeline run.
 */
export const EXPECTED_TRANSITION_SEQUENCE: Array<{
  from: PipelineState;
  to: PipelineState;
  triggeredBy: string;
}> = [
  {
    from: PipelineState.IDLE,
    to: PipelineState.PLANNING,
    triggeredBy: 'pipeline:start',
  },
  {
    from: PipelineState.PLANNING,
    to: PipelineState.IMPLEMENTING,
    triggeredBy: 'handoff:planner->dev',
  },
  {
    from: PipelineState.IMPLEMENTING,
    to: PipelineState.QA,
    triggeredBy: 'handoff:dev->qa',
  },
  {
    from: PipelineState.QA,
    to: PipelineState.DEPLOYING,
    triggeredBy: 'handoff:qa->devops',
  },
  {
    from: PipelineState.DEPLOYING,
    to: PipelineState.COMPLETE,
    triggeredBy: 'handoff:devops->complete',
  },
];

/**
 * Expected handoff chain for a full pipeline run.
 */
export const EXPECTED_HANDOFFS: Array<{
  fromAgent: string;
  toAgent: string;
  requiredContext: string[];
}> = [
  {
    fromAgent: 'planner',
    toAgent: 'dev',
    requiredContext: [
      'storyId',
      'storyTitle',
      'acceptanceCriteria',
      'techStack',
    ],
  },
  {
    fromAgent: 'dev',
    toAgent: 'qa',
    requiredContext: ['branch', 'prUrl', 'prNumber', 'testResults'],
  },
  {
    fromAgent: 'qa',
    toAgent: 'devops',
    requiredContext: ['prUrl', 'prNumber', 'qaVerdict', 'qaReportSummary'],
  },
  {
    fromAgent: 'devops',
    toAgent: 'complete',
    requiredContext: ['deploymentUrl', 'smokeTestsPassed'],
  },
];

/**
 * Expected WebSocket event types in a full pipeline run.
 */
export const EXPECTED_EVENT_TYPES: string[] = [
  'pipeline:state_changed', // IDLE -> PLANNING
  'orchestrator:pipeline_status', // Pipeline status update
  // Planner phase
  'orchestrator:story_progress', // Story enters PLANNING
  'pipeline:state_changed', // PLANNING -> IMPLEMENTING
  'orchestrator:handoff', // Planner -> Dev handoff
  'orchestrator:story_progress', // Story enters IMPLEMENTING
  // Dev phase
  'pipeline:state_changed', // IMPLEMENTING -> QA
  'orchestrator:handoff', // Dev -> QA handoff
  'orchestrator:story_progress', // Story enters QA
  // QA phase
  'pipeline:state_changed', // QA -> DEPLOYING
  'orchestrator:handoff', // QA -> DevOps handoff
  'orchestrator:story_progress', // Story enters DEPLOYING
  // DevOps phase
  'pipeline:state_changed', // DEPLOYING -> COMPLETE
  'orchestrator:handoff', // DevOps -> Complete handoff
  'orchestrator:story_progress', // Story enters COMPLETE
  'orchestrator:pipeline_status', // Final pipeline status
];
