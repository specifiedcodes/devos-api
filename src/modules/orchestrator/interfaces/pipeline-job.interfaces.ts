/**
 * Pipeline Job Interfaces
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Defines types and interfaces for pipeline job execution,
 * task context assembly, and error handling.
 */

// ─── Pipeline Job Data ──────────────────────────────────────────────────────

/**
 * Data required to execute a pipeline phase job.
 * Passed from the pipeline state machine via BullMQ.
 */
export interface PipelineJobData {
  pipelineProjectId: string;
  pipelineWorkflowId: string;
  phase: string; // 'planning' | 'implementing' | 'qa' | 'deploying'
  storyId: string | null;
  agentType: string; // 'planner' | 'dev' | 'qa' | 'devops'
  workspaceId: string;
  userId: string;
  /** Pipeline metadata containing story details, tech stack, previous agent output, etc. */
  pipelineMetadata?: Record<string, any>;
}

// ─── Pipeline Job Result ────────────────────────────────────────────────────

/**
 * Result returned after a pipeline job completes.
 */
export interface PipelineJobResult {
  sessionId: string;
  exitCode: number | null;
  branch: string | null;
  commitHash: string | null;
  outputLineCount: number;
  durationMs: number;
  error: string | null;
  /** Optional metadata for agent-specific result data (deployment URLs, test results, etc.) */
  metadata?: Record<string, any>;
}

// ─── Pipeline Job Error ─────────────────────────────────────────────────────

/**
 * Error types that can occur during pipeline job execution.
 */
export type PipelineJobErrorType =
  | 'cli_crash'
  | 'rate_limit'
  | 'git_conflict'
  | 'timeout'
  | 'workspace_error'
  | 'key_error';

/**
 * Structured error metadata for pipeline job failures.
 */
export interface PipelineJobError {
  type: PipelineJobErrorType;
  message: string;
  exitCode: number | null;
  sessionId: string | null;
  recoverable: boolean;
  metadata: Record<string, any>;
}

// ─── Agent Task Context ─────────────────────────────────────────────────────

/**
 * Rich context assembled for a Claude Code CLI session.
 * Contains all information the agent needs to perform meaningful work.
 */
export interface AgentTaskContext {
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  codeStylePreferences: string;
  testingStrategy: string;
  existingFiles: string[];
  projectContext: string;
  previousAgentOutput: string | null;
  /** Optional Graphiti memory context appended during assembly (Story 12.4) */
  memoryContext?: string;
}

// ─── Stream Params ──────────────────────────────────────────────────────────

/**
 * Parameters for starting CLI output streaming.
 */
export interface StreamParams {
  sessionId: string;
  workspaceId: string;
  agentId: string;
  agentType: string;
}

// ─── CLI Output Batch ───────────────────────────────────────────────────────

/**
 * Batched CLI output emitted to WebSocket rooms.
 */
export interface CLIOutputBatch {
  sessionId: string;
  lines: string[];
  timestamp: Date;
  lineOffset: number;
}
