/**
 * CLI Session Configuration Interfaces
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Defines types, interfaces, and constants for CLI session configuration,
 * BYOK key integration, workspace management, and session lifecycle.
 */

import { PipelineContext } from './pipeline.interfaces';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default max tokens per CLI session (200,000) */
export const DEFAULT_MAX_TOKENS = 200_000;

/** Default session timeout: 2 hours in milliseconds */
export const DEFAULT_TIMEOUT_MS = 7_200_000;

/** Maximum allowed session timeout: 4 hours in milliseconds */
export const MAX_TIMEOUT_MS = 14_400_000;

/** Default Claude model for CLI sessions */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default max concurrent sessions per workspace */
export const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;

/** Default session cleanup interval: 5 minutes in milliseconds */
export const DEFAULT_CLEANUP_INTERVAL_MS = 300_000;

// ─── Session Status ──────────────────────────────────────────────────────────

export enum SessionStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  TIMED_OUT = 'timed_out',
}

// ─── CLI Session Config ──────────────────────────────────────────────────────

/**
 * Full configuration for spawning a Claude Code CLI session.
 * Extends the existing ClaudeCodeSession concept with BYOK key integration
 * and pipeline-aware configuration.
 */
export interface CLISessionConfig {
  /** User's BYOK Anthropic API key (decrypted at spawn time) */
  apiKey: string;
  /** Local clone of user's repository */
  projectPath: string;
  /** Task description from story / pipeline phase */
  task: string;
  /** Budget per session in tokens */
  maxTokens: number;
  /** Max session duration in milliseconds */
  timeout: number;
  /** Always stream for real-time visibility */
  outputFormat: 'stream';
  /** Claude model to use */
  model?: string;
  /** Permitted tool categories for safety */
  allowedTools?: string[];
}

// ─── Session Defaults ────────────────────────────────────────────────────────

/**
 * Default configuration values for a workspace.
 * Read from workspace settings with fallback to environment defaults.
 */
export interface CLISessionDefaults {
  maxTokens: number;
  timeout: number;
  model: string;
  maxConcurrentSessions: number;
  allowedTools?: string[];
}

// ─── Session Spawn Params ────────────────────────────────────────────────────

/**
 * Parameters for spawning a new CLI session via the lifecycle service.
 * This is the primary entry point called by the pipeline state machine.
 */
export interface CLISessionSpawnParams {
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentType: string;
  task: string;
  storyId?: string;
  gitRepoUrl: string;
  gitToken?: string;
  pipelineContext: PipelineContext;
}

// ─── Session Status Result ───────────────────────────────────────────────────

/**
 * Status of a running or completed CLI session.
 */
export interface CLISessionStatusResult {
  status: SessionStatus;
  pid: number | null;
  outputLineCount: number;
  durationMs: number;
}

// ─── Session Spawn Result ────────────────────────────────────────────────────

/**
 * Result of spawning a new CLI session.
 */
export interface CLISessionSpawnResult {
  sessionId: string;
  pid: number;
}

// ─── Session Events ──────────────────────────────────────────────────────────

/**
 * Events emitted during CLI session lifecycle.
 */
export interface CLISessionEvent {
  type:
    | 'cli:session:started'
    | 'cli:session:output'
    | 'cli:session:completed'
    | 'cli:session:failed'
    | 'cli:session:terminated';
  sessionId: string;
  agentId: string;
  agentType: string;
  workspaceId: string;
  projectId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ─── Tracked Session ─────────────────────────────────────────────────────────

/**
 * Internal tracked session in the lifecycle service.
 */
export interface TrackedSession {
  sessionId: string;
  pid: number;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentType: string;
  status: SessionStatus;
  startedAt: Date;
  outputLineCount: number;
  process: any; // Reference to the child process
}
