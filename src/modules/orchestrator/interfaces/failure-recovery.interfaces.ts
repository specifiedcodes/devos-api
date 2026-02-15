/**
 * Failure Recovery Interfaces & Types
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Defines all types, interfaces, DTOs, constants, and WebSocket event
 * interfaces for the pipeline failure detection, checkpoint, and recovery system.
 */
import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum session duration before timeout failure (2 hours) */
export const DEFAULT_MAX_SESSION_DURATION_MS = 7_200_000;

/** Maximum recovery retries before escalation */
export const DEFAULT_MAX_RECOVERY_RETRIES = 3;

/** Consecutive API errors before failure is triggered */
export const API_ERROR_THRESHOLD = 5;

/** Same-file modifications before infinite loop detection */
export const FILE_MODIFICATION_LOOP_THRESHOLD = 20;

/** Base delay for exponential backoff on API rate limits (30 seconds) */
export const API_BACKOFF_BASE_MS = 30_000;

/** Redis checkpoint TTL (7 days in seconds) */
export const CHECKPOINT_TTL = 604_800;

// ─── Failure Types ──────────────────────────────────────────────────────────────

export type FailureType = 'stuck' | 'crash' | 'api_error' | 'loop' | 'timeout';

export type RecoveryAction =
  | 'pending'
  | 'retry'
  | 'checkpoint_recovery'
  | 'context_refresh'
  | 'escalated'
  | 'manual_override';

export type RecoveryStrategy =
  | 'retry'
  | 'checkpoint_recovery'
  | 'context_refresh'
  | 'escalation'
  | 'manual_override';

export type ManualOverrideAction = 'terminate' | 'reassign' | 'provide_guidance';

// ─── Agent Failure ──────────────────────────────────────────────────────────────

export interface AgentFailure {
  id: string;
  sessionId: string;
  agentId: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  storyId: string;
  failureType: FailureType;
  retryCount: number;
  lastCheckpoint: string | null;
  errorDetails: string;
  recoveryAction: RecoveryAction;
  resolved: boolean;
  timestamp: Date;
  metadata: Record<string, any>;
}

// ─── Failure Detection Parameters ───────────────────────────────────────────────

export interface FailureMonitoringParams {
  sessionId: string;
  agentId: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  storyId: string;
  maxDurationMs?: number;
}

export interface ProcessExitParams {
  sessionId: string;
  exitCode: number;
  signal: string | null;
  stderr: string;
}

export interface ApiErrorParams {
  sessionId: string;
  statusCode: number;
  errorMessage: string;
  consecutiveCount?: number;
}

export interface FileModificationParams {
  sessionId: string;
  filePath: string;
  testsPassed: boolean;
}

// ─── Checkpoint ─────────────────────────────────────────────────────────────────

export interface CreateCheckpointParams {
  sessionId: string;
  agentId: string;
  projectId: string;
  workspaceId: string;
  storyId: string;
  commitHash: string;
  branch: string;
  filesModified: string[];
  testsPassed: boolean;
  description: string;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  agentId: string;
  projectId: string;
  workspaceId: string;
  storyId: string;
  commitHash: string;
  branch: string;
  filesModified: string[];
  testsPassed: boolean;
  description: string;
  createdAt: Date;
}

// ─── Recovery Result ────────────────────────────────────────────────────────────

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  failureId: string;
  retryCount: number;
  newSessionId: string | null;
  checkpointUsed: string | null;
  error: string | null;
}

// ─── Manual Override ────────────────────────────────────────────────────────────

export interface ManualOverrideParams {
  failureId: string;
  workspaceId: string;
  userId: string;
  action: ManualOverrideAction;
  guidance?: string;
  reassignToAgentType?: string;
}

// ─── Pipeline Recovery Status ───────────────────────────────────────────────────

export interface PipelineRecoveryStatus {
  projectId: string;
  activeFailures: AgentFailure[];
  recoveryHistory: RecoveryHistoryEntry[];
  isEscalated: boolean;
  totalRetries: number;
  maxRetries: number;
}

export interface RecoveryHistoryEntry {
  failureId: string;
  failureType: string;
  strategy: string;
  success: boolean;
  timestamp: Date;
  durationMs: number;
}

// ─── WebSocket Event Interfaces ─────────────────────────────────────────────────

/** Agent failure detected */
export interface AgentFailureEvent {
  type: 'agent:failure';
  workspaceId: string;
  projectId: string;
  storyId: string;
  agentId: string;
  agentType: string;
  failureType: FailureType;
  errorDetails: string;
  retryCount: number;
  maxRetries: number;
  recoveryAction: string;
  timestamp: Date;
}

/** Recovery attempt started */
export interface RecoveryAttemptEvent {
  type: 'agent:recovery_attempt';
  workspaceId: string;
  projectId: string;
  storyId: string;
  agentId: string;
  failureId: string;
  strategy: string;
  retryCount: number;
  checkpointUsed: string | null;
  timestamp: Date;
}

/** Recovery succeeded */
export interface RecoverySuccessEvent {
  type: 'agent:recovery_success';
  workspaceId: string;
  projectId: string;
  storyId: string;
  agentId: string;
  failureId: string;
  strategy: string;
  newSessionId: string;
  timestamp: Date;
}

/** Recovery failed / Escalation required */
export interface RecoveryEscalationEvent {
  type: 'agent:recovery_escalation';
  workspaceId: string;
  projectId: string;
  storyId: string;
  agentId: string;
  failureId: string;
  totalRetries: number;
  lastFailureType: string;
  lastErrorDetails: string;
  overrideOptions: ManualOverrideAction[];
  timestamp: Date;
}

// ─── Validation Enums ────────────────────────────────────────────────────────

/** Enum object for class-validator @IsEnum() validation of manual override actions */
export enum ManualOverrideActionEnum {
  TERMINATE = 'terminate',
  REASSIGN = 'reassign',
  PROVIDE_GUIDANCE = 'provide_guidance',
}

// ─── DTOs ───────────────────────────────────────────────────────────────────────

export class ManualOverrideDto {
  @IsEnum(ManualOverrideActionEnum)
  action!: ManualOverrideAction;

  @IsOptional()
  @IsString()
  guidance?: string;

  @IsOptional()
  @IsString()
  reassignToAgentType?: string;
}

export class FailureHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
