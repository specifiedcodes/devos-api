/**
 * DevOps Agent Execution Interfaces
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Defines types and interfaces for the DevOps Agent pipeline execution,
 * including execution params/results, merge results, deployment triggers,
 * smoke test results, rollback handling, incident reports, and progress events.
 */

// ─── DevOps Agent Execution Params ──────────────────────────────────────────

/**
 * Parameters required to execute a full deployment cycle for a story.
 * Passed from PipelineJobHandler to DevOpsAgentPipelineExecutor.
 */
export interface DevOpsAgentExecutionParams {
  workspaceId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  workspacePath: string;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
  /** PR URL from QA Agent handoff (Story 11.5) */
  prUrl: string;
  /** PR number from QA Agent */
  prNumber: number;
  /** Feature branch from Dev Agent (via QA) */
  devBranch: string;
  /** QA verdict - should be 'PASS' for deployment */
  qaVerdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES';
  /** QA report summary for deployment context */
  qaReportSummary: string;
  /** Deployment platform preference */
  deploymentPlatform: 'railway' | 'vercel' | 'auto';
  /** Supabase configured for this project */
  supabaseConfigured: boolean;
  /** Target deployment environment */
  environment: string;
}

// ─── DevOps Agent Execution Result ──────────────────────────────────────────

/**
 * Result returned after a DevOps agent execution completes.
 * Includes merge info, deployment details, smoke test results,
 * rollback info, incident report, and timing.
 */
export interface DevOpsAgentExecutionResult {
  success: boolean;
  mergeCommitHash: string | null;
  deploymentUrl: string | null;
  deploymentId: string | null;
  deploymentPlatform: 'railway' | 'vercel' | null;
  smokeTestResults: DevOpsSmokeTestResults | null;
  rollbackPerformed: boolean;
  rollbackReason: string | null;
  incidentReport: DevOpsIncidentReport | null;
  sessionId: string;
  durationMs: number;
  error: string | null;
}

// ─── DevOps Merge Result ────────────────────────────────────────────────────

/**
 * Result of merging a PR to the target branch via GitHub API.
 */
export interface DevOpsMergeResult {
  success: boolean;
  mergeCommitHash: string | null;
  mergedAt: Date | null;
  error: string | null;
}

// ─── DevOps Deployment Trigger Result ───────────────────────────────────────

/**
 * Result of triggering a deployment on Railway or Vercel.
 */
export interface DevOpsDeploymentTriggerResult {
  success: boolean;
  deploymentId: string | null;
  deploymentUrl: string | null;
  platform: 'railway' | 'vercel';
  error: string | null;
}

// ─── DevOps Deployment Status ───────────────────────────────────────────────

/**
 * Status of a deployment after monitoring/polling.
 */
export interface DevOpsDeploymentStatus {
  status: 'success' | 'failed' | 'timeout';
  deploymentUrl: string | null;
  deployedAt: Date | null;
  buildLogs: string | null;
  error: string | null;
}

// ─── DevOps Smoke Test Results ──────────────────────────────────────────────

/**
 * Aggregate smoke test results from CLI execution.
 */
export interface DevOpsSmokeTestResults {
  passed: boolean;
  healthCheck: DevOpsSmokeCheck;
  apiChecks: DevOpsSmokeCheck[];
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  durationMs: number;
  details: string;
}

/**
 * Individual smoke check result (health check or API endpoint).
 */
export interface DevOpsSmokeCheck {
  name: string;
  url: string;
  method: string;
  expectedStatus: number;
  actualStatus: number | null;
  passed: boolean;
  responseTimeMs: number | null;
  error: string | null;
}

// ─── DevOps Rollback Result ─────────────────────────────────────────────────

/**
 * Result of performing a deployment rollback.
 */
export interface DevOpsRollbackResult {
  success: boolean;
  previousDeploymentId: string | null;
  rollbackUrl: string | null;
  error: string | null;
}

// ─── DevOps Incident Report ─────────────────────────────────────────────────

/**
 * Structured incident report for failed deployments.
 * Stored as pipeline metadata for audit trail.
 */
export interface DevOpsIncidentReport {
  storyId: string;
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium';
  failureType: 'deployment_failed' | 'smoke_tests_failed' | 'timeout';
  description: string;
  deploymentId: string;
  rollbackPerformed: boolean;
  rollbackSuccessful: boolean;
  rootCause: string;
  resolution: string;
  recommendations: string[];
}

// ─── DevOps Agent Progress Event ────────────────────────────────────────────

/**
 * Progress event emitted during DevOps agent execution.
 * Sent to workspace WebSocket room for real-time UI updates.
 */
export interface DevOpsAgentProgressEvent {
  type: 'devops-agent:progress';
  sessionId: string;
  storyId: string;
  workspaceId: string;
  step: DevOpsAgentStep;
  status: 'started' | 'completed' | 'failed';
  details: string;
  percentage: number;
  timestamp: Date;
}

// ─── DevOps Agent Step ──────────────────────────────────────────────────────

/**
 * Steps in the DevOps agent execution pipeline.
 * Each step reports estimated completion percentage.
 */
export type DevOpsAgentStep =
  | 'merging-pr'
  | 'detecting-platform'
  | 'running-migrations'
  | 'triggering-deployment'
  | 'monitoring-deployment'
  | 'running-smoke-tests'
  | 'handling-rollback'
  | 'creating-incident-report'
  | 'updating-status';

/**
 * Estimated completion percentage for each DevOps agent step.
 */
export const DEVOPS_AGENT_STEP_PROGRESS: Record<DevOpsAgentStep, number> = {
  'merging-pr': 10,
  'detecting-platform': 15,
  'running-migrations': 25,
  'triggering-deployment': 35,
  'monitoring-deployment': 60,
  'running-smoke-tests': 80,
  'handling-rollback': 90,
  'creating-incident-report': 95,
  'updating-status': 100,
};
