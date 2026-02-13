/**
 * Orchestrator Interfaces
 * Story 5.8: Super Orchestrator Coordination
 *
 * TypeScript interfaces and enums for the Super Orchestrator's
 * workflow state machine, task routing, and result types.
 */

/**
 * Workflow phases for the orchestrator state machine.
 * Transitions: planning -> implementation -> qa -> deployment -> completed
 * Failed phases can retry from last checkpoint or abort.
 */
export enum WorkflowPhase {
  PLANNING = 'planning',
  IMPLEMENTATION = 'implementation',
  QA = 'qa',
  DEPLOYMENT = 'deployment',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Tracks the state of a multi-agent workflow.
 * In-memory storage (Map<string, WorkflowState>) for now;
 * future: persist to database for durability.
 */
export interface WorkflowState {
  id: string;
  taskId: string;
  workspaceId: string;
  phase: WorkflowPhase;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  agents: Record<string, string>; // agentType -> current agentId mapping
  agentHistory: Array<{ agentType: string; agentId: string; phase: WorkflowPhase }>; // audit trail of all spawned agents
  phaseResults: Record<string, any>; // phase -> result mapping
  retryCount: number;
  maxRetries: number;
  error?: string;
  autonomyMode: 'full' | 'semi';
  approvalGates: string[]; // phases requiring user approval in semi mode
}

/**
 * Input task for the Super Orchestrator.
 * Replaces the inline OrchestratorTask from orchestrator.service.ts.
 */
export interface OrchestratorTask {
  id: string;
  type: 'implement-feature' | 'fix-bug' | 'deploy' | 'full-lifecycle' | 'custom';
  description: string;
  workspaceId: string;
  projectId?: string;
  userId: string;
  config?: Record<string, any>;
  autonomyMode?: 'full' | 'semi';
  approvalGates?: string[];
}

/**
 * Result returned by orchestrator workflows.
 * Contains the final workflow state and all phase results.
 */
export interface OrchestratorResult {
  status: 'completed' | 'failed' | 'cancelled';
  workflowState: WorkflowState;
  phaseResults: Record<string, any>;
  agents: Record<string, string>;
}

/**
 * Workflow event for structured logging.
 * Future: emitted to WebSocket in Epic 8.
 */
export interface WorkflowEvent {
  type:
    | 'workflow.started'
    | 'workflow.phase.started'
    | 'workflow.phase.completed'
    | 'workflow.phase.failed'
    | 'workflow.agent.spawned'
    | 'workflow.agent.completed'
    | 'workflow.completed'
    | 'workflow.failed';
  workflowId: string;
  phase?: WorkflowPhase;
  agentId?: string;
  timestamp: Date;
  data?: Record<string, any>;
}
