/**
 * Handoff Interfaces and Types
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Defines all types, interfaces, constants, and error classes for the
 * multi-agent handoff coordination system in the BMAD pipeline.
 */

import { PipelineState } from './pipeline.interfaces';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default maximum number of parallel agents per workspace */
export const DEFAULT_MAX_PARALLEL_AGENTS = 5;

/** Default maximum QA rejection iterations before escalation */
export const DEFAULT_MAX_QA_ITERATIONS = 3;

/** Redis key TTL for dependency and queue data (30 days) */
export const HANDOFF_DATA_TTL = 60 * 60 * 24 * 30;

// ─── Handoff Chain Definition ───────────────────────────────────────────────

/**
 * Defines the agent-to-agent handoff chain for the BMAD pipeline.
 * Maps completing agent type to next agent type and phase transitions.
 */
export interface HandoffChainEntry {
  fromAgentType: string;
  toAgentType: string;
  fromPhase: string;
  toPhase: string;
  requiredContext: string[];
}

/**
 * Static handoff chain mapping: completing agent type -> next chain entry.
 * Handles both normal flow and the QA rejection re-routing case.
 */
export const HANDOFF_CHAIN: Record<string, HandoffChainEntry> = {
  planner: {
    fromAgentType: 'planner',
    toAgentType: 'dev',
    fromPhase: PipelineState.PLANNING,
    toPhase: PipelineState.IMPLEMENTING,
    requiredContext: [
      'storyId',
      'storyTitle',
      'acceptanceCriteria',
      'techStack',
    ],
  },
  dev: {
    fromAgentType: 'dev',
    toAgentType: 'qa',
    fromPhase: PipelineState.IMPLEMENTING,
    toPhase: PipelineState.QA,
    requiredContext: ['branch', 'prUrl', 'prNumber', 'testResults'],
  },
  qa: {
    fromAgentType: 'qa',
    toAgentType: 'devops',
    fromPhase: PipelineState.QA,
    toPhase: PipelineState.DEPLOYING,
    requiredContext: ['prUrl', 'prNumber', 'qaVerdict', 'qaReportSummary'],
  },
  devops: {
    fromAgentType: 'devops',
    toAgentType: 'complete',
    fromPhase: PipelineState.DEPLOYING,
    toPhase: PipelineState.COMPLETE,
    requiredContext: ['deploymentUrl', 'smokeTestsPassed'],
  },
};

/**
 * QA rejection re-routing chain entry (QA -> Dev with feedback).
 */
export const QA_REJECTION_CHAIN_ENTRY: HandoffChainEntry = {
  fromAgentType: 'qa',
  toAgentType: 'dev',
  fromPhase: PipelineState.QA,
  toPhase: PipelineState.IMPLEMENTING,
  requiredContext: [
    'qaVerdict',
    'qaReportSummary',
    'failedTests',
    'changeRequests',
  ],
};

// ─── Handoff Params and Result ──────────────────────────────────────────────

/**
 * Parameters for processing a handoff between agents.
 */
export interface HandoffParams {
  workspaceId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  completingAgentType: string;
  completingAgentId: string;
  phaseResult: Record<string, any>;
  pipelineMetadata: Record<string, any>;
}

/**
 * Result of a handoff processing attempt.
 */
export interface HandoffResult {
  success: boolean;
  nextAgentType: string | null;
  nextPhase: string | null;
  handoffContext: Record<string, any>;
  queued: boolean;
  queuePosition: number | null;
  error: string | null;
}

/**
 * Parameters for processing a QA rejection.
 */
export interface QARejectionParams {
  workspaceId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  qaResult: Record<string, any>;
  iterationCount: number;
  previousMetadata: Record<string, any>;
}

/**
 * Parameters for checking story dependencies.
 */
export interface StoryDependencyCheckParams {
  workspaceId: string;
  storyId: string;
}

// ─── Coordination Status ────────────────────────────────────────────────────

/**
 * Current coordination status for a workspace.
 */
export interface CoordinationStatus {
  activeHandoffs: ActiveAgentInfo[];
  blockedStories: string[];
  activeAgents: number;
  maxAgents: number;
  queuedHandoffs: number;
}

/**
 * Information about an active agent in the pipeline.
 */
export interface ActiveAgentInfo {
  agentId: string;
  agentType: string;
  storyId: string;
  phase: string;
  startedAt: Date;
}

// ─── Coordination Rules ─────────────────────────────────────────────────────

/**
 * Result of validating coordination rules before a handoff.
 */
export interface CoordinationRuleResult {
  allowed: boolean;
  violations: CoordinationViolation[];
}

/**
 * A single coordination rule violation.
 */
export interface CoordinationViolation {
  rule: string;
  description: string;
  severity: 'error' | 'warning';
}

// ─── Handoff Context Data Types ─────────────────────────────────────────────

/** Planner -> Dev handoff data */
export interface PlannerToDevHandoff {
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  codeStylePreferences: string;
  testingStrategy: string;
  epicId: string | null;
  planningDocuments: string[];
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
}

/** Dev -> QA handoff data */
export interface DevToQAHandoff {
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  testingStrategy: string;
  branch: string;
  prUrl: string;
  prNumber: number;
  devTestResults: Record<string, any> | null;
  filesCreated: string[];
  filesModified: string[];
  commitHash: string | null;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
}

/** QA -> DevOps handoff data (PASS) */
export interface QAToDevOpsHandoff {
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  prUrl: string;
  prNumber: number;
  devBranch: string;
  qaVerdict: 'PASS';
  qaReportSummary: string;
  deploymentPlatform: 'railway' | 'vercel' | 'auto';
  supabaseConfigured: boolean;
  environment: string;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
}

/** QA -> Dev rejection handoff data (FAIL/NEEDS_CHANGES) */
export interface QAToDevRejectionHandoff {
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  codeStylePreferences: string;
  testingStrategy: string;
  qaVerdict: 'FAIL' | 'NEEDS_CHANGES';
  qaReportSummary: string;
  failedTests: string[];
  lintErrors: string;
  securityIssues: string;
  changeRequests: string[];
  previousBranch: string;
  previousPrUrl: string;
  previousPrNumber: number;
  iterationCount: number;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
}

/** DevOps -> Completion handoff data */
export interface DevOpsCompletionHandoff {
  storyId: string;
  deploymentUrl: string | null;
  deploymentPlatform: 'railway' | 'vercel' | null;
  mergeCommitHash: string | null;
  smokeTestsPassed: boolean;
}

// ─── Story Dependency Types ─────────────────────────────────────────────────

/**
 * Complete dependency graph for a workspace.
 */
export interface StoryDependencyGraph {
  stories: Map<string, StoryDependencyNode>;
  blockedStories: string[];
  unblockedStories: string[];
}

/**
 * Single node in the dependency graph.
 */
export interface StoryDependencyNode {
  storyId: string;
  dependsOn: string[];
  blockedBy: string[];
  status: 'pending' | 'in-progress' | 'complete';
}

// ─── Handoff Queue Types ────────────────────────────────────────────────────

/**
 * A queued handoff waiting for agent capacity.
 */
export interface QueuedHandoff {
  id: string;
  storyId: string;
  toAgentType: string;
  priority: number;
  queuedAt: Date;
  estimatedWait: number;
  handoffParams: HandoffParams;
}

// ─── Handoff History / Audit Trail ──────────────────────────────────────────

/**
 * A recorded handoff for audit trail purposes.
 */
export interface HandoffRecord {
  id: string;
  workspaceId: string;
  storyId: string;
  fromAgentType: string;
  fromAgentId: string;
  toAgentType: string;
  toAgentId: string;
  fromPhase: string;
  toPhase: string;
  handoffType: 'normal' | 'rejection' | 'escalation' | 'completion';
  contextSummary: string;
  iterationCount: number;
  timestamp: Date;
  durationMs: number;
  metadata: Record<string, any>;
}

// ─── WebSocket Coordination Events ──────────────────────────────────────────

/** Agent handoff occurred */
export interface HandoffEvent {
  type: 'orchestrator:handoff';
  workspaceId: string;
  storyId: string;
  fromAgent: { type: string; id: string };
  toAgent: { type: string; id: string };
  handoffContext: Record<string, any>;
  timestamp: Date;
}

/** Story moved to next phase */
export interface StoryProgressEvent {
  type: 'orchestrator:story_progress';
  workspaceId: string;
  storyId: string;
  storyTitle: string;
  previousPhase: string;
  newPhase: string;
  agentType: string;
  timestamp: Date;
}

/** Overall pipeline status update */
export interface PipelineStatusEvent {
  type: 'orchestrator:pipeline_status';
  workspaceId: string;
  activeStories: PipelineStoryStatus[];
  activeAgents: number;
  maxAgents: number;
  blockedStories: number;
  queuedHandoffs: number;
  timestamp: Date;
}

export interface PipelineStoryStatus {
  storyId: string;
  storyTitle: string;
  currentPhase: string;
  agentType: string;
  agentId: string;
  startedAt: Date;
  iterationCount: number;
}

/** Story blocked by dependency */
export interface StoryBlockedEvent {
  type: 'orchestrator:story_blocked';
  workspaceId: string;
  storyId: string;
  blockedBy: string[];
  reason: string;
  timestamp: Date;
}

/** Story unblocked and queued for execution */
export interface StoryUnblockedEvent {
  type: 'orchestrator:story_unblocked';
  workspaceId: string;
  storyId: string;
  previouslyBlockedBy: string[];
  timestamp: Date;
}

/** QA rejection with re-routing */
export interface QARejectionEvent {
  type: 'orchestrator:qa_rejection';
  workspaceId: string;
  storyId: string;
  qaVerdict: 'FAIL' | 'NEEDS_CHANGES';
  iterationCount: number;
  maxIterations: number;
  feedback: string;
  timestamp: Date;
}

/** Iteration limit exceeded, escalating to user */
export interface EscalationEvent {
  type: 'orchestrator:escalation';
  workspaceId: string;
  storyId: string;
  reason: string;
  iterationCount: number;
  lastQAReport: string;
  timestamp: Date;
}

// ─── Custom Error Classes ───────────────────────────────────────────────────

/**
 * Thrown when a coordination rule is violated during handoff.
 */
export class CoordinationRuleViolationError extends Error {
  public readonly violations: CoordinationViolation[];

  constructor(violations: CoordinationViolation[]) {
    const descriptions = violations.map((v) => `${v.rule}: ${v.description}`);
    super(`Coordination rule violations: ${descriptions.join('; ')}`);
    this.name = 'CoordinationRuleViolationError';
    this.violations = violations;
  }
}

/**
 * Thrown when a circular dependency is detected.
 */
export class CircularDependencyError extends Error {
  public readonly storyId: string;
  public readonly dependsOnStoryId: string;

  constructor(storyId: string, dependsOnStoryId: string) {
    super(
      `Circular dependency detected: ${storyId} <-> ${dependsOnStoryId}`,
    );
    this.name = 'CircularDependencyError';
    this.storyId = storyId;
    this.dependsOnStoryId = dependsOnStoryId;
  }
}
