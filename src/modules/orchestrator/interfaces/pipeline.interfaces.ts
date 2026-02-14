/**
 * Pipeline State Machine Interfaces
 * Story 11.1: Orchestrator State Machine Core
 *
 * Defines types, enums, transitions, and interfaces for the
 * autonomous BMAD pipeline state machine.
 */

/**
 * Pipeline states for the orchestrator state machine.
 * Extends the existing WorkflowPhase enum (Story 5.8) with additional states
 * for the full BMAD autonomous pipeline.
 */
export enum PipelineState {
  IDLE = 'idle',
  PLANNING = 'planning',
  IMPLEMENTING = 'implementing',
  QA = 'qa',
  DEPLOYING = 'deploying',
  COMPLETE = 'complete',
  FAILED = 'failed',
  PAUSED = 'paused',
}

/**
 * Valid state transitions map.
 * Key: current state, Value: array of allowed next states.
 * No skipping phases is enforced at this level.
 */
export const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  [PipelineState.IDLE]: [PipelineState.PLANNING, PipelineState.IMPLEMENTING],
  [PipelineState.PLANNING]: [
    PipelineState.IMPLEMENTING,
    PipelineState.FAILED,
    PipelineState.PAUSED,
  ],
  [PipelineState.IMPLEMENTING]: [
    PipelineState.QA,
    PipelineState.FAILED,
    PipelineState.PAUSED,
  ],
  [PipelineState.QA]: [
    PipelineState.DEPLOYING,
    PipelineState.IMPLEMENTING,
    PipelineState.FAILED,
    PipelineState.PAUSED,
  ],
  [PipelineState.DEPLOYING]: [
    PipelineState.COMPLETE,
    PipelineState.FAILED,
    PipelineState.PAUSED,
  ],
  [PipelineState.COMPLETE]: [PipelineState.IDLE],
  [PipelineState.FAILED]: [
    PipelineState.IDLE,
    PipelineState.PLANNING,
    PipelineState.IMPLEMENTING,
  ],
  [PipelineState.PAUSED]: [
    PipelineState.PLANNING,
    PipelineState.IMPLEMENTING,
    PipelineState.QA,
    PipelineState.DEPLOYING,
  ],
};

/**
 * Terminal states that indicate the pipeline is no longer active.
 */
export const TERMINAL_STATES: PipelineState[] = [
  PipelineState.COMPLETE,
  PipelineState.FAILED,
];

/**
 * Tracks the full context of an active pipeline.
 * Stored in Redis for fast access.
 */
export interface PipelineContext {
  projectId: string;
  workspaceId: string;
  workflowId: string;
  currentState: PipelineState;
  previousState: PipelineState | null;
  stateEnteredAt: Date;
  activeAgentId: string | null;
  activeAgentType: string | null;
  currentStoryId: string | null;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event emitted on every state transition.
 */
export interface PipelineStateEvent {
  type: 'pipeline:state_changed';
  projectId: string;
  workspaceId: string;
  previousState: PipelineState;
  newState: PipelineState;
  agentId: string | null;
  storyId: string | null;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Guard that controls entry/exit of pipeline states.
 */
export interface StateTransitionGuard {
  canEnter(context: PipelineContext): { allowed: boolean; reason?: string };
  onEnter(context: PipelineContext): Promise<void>;
  onExit(context: PipelineContext): Promise<void>;
}

/**
 * Options for the transition method.
 */
export interface TransitionOptions {
  triggeredBy: string;
  agentId?: string | null;
  storyId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Result of pipeline recovery on startup.
 */
export interface PipelineRecoveryResult {
  recovered: number;
  stale: number;
  total: number;
}

/**
 * Custom error thrown when attempting an invalid state transition.
 */
export class InvalidStateTransitionError extends Error {
  public readonly currentState: PipelineState;
  public readonly targetState: PipelineState;

  constructor(currentState: PipelineState, targetState: PipelineState) {
    super(
      `Invalid state transition: ${currentState} -> ${targetState}. ` +
        `Allowed transitions from ${currentState}: [${VALID_TRANSITIONS[currentState].join(', ')}]`,
    );
    this.name = 'InvalidStateTransitionError';
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

/**
 * Custom error thrown when a pipeline lock cannot be acquired.
 */
export class PipelineLockError extends Error {
  public readonly projectId: string;

  constructor(projectId: string) {
    super(
      `Failed to acquire pipeline lock for project ${projectId}. ` +
        `Another transition may be in progress.`,
    );
    this.name = 'PipelineLockError';
    this.projectId = projectId;
  }
}
