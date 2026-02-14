/**
 * Dev Agent Execution Interfaces
 * Story 11.4: Dev Agent CLI Integration
 *
 * Defines types and interfaces for the Dev Agent pipeline execution,
 * including execution params/results, test results, progress events,
 * commit info, and changed file tracking.
 */

// ─── Dev Agent Execution Params ─────────────────────────────────────────────

/**
 * Parameters required to execute a full dev cycle for a story.
 * Passed from PipelineJobHandler to DevAgentPipelineExecutor.
 */
export interface DevAgentExecutionParams {
  workspaceId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  codeStylePreferences: string;
  testingStrategy: string;
  workspacePath: string;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
}

// ─── Dev Agent Execution Result ─────────────────────────────────────────────

/**
 * Result returned after a dev agent execution completes.
 * Includes branch info, PR details, test results, and file changes.
 */
export interface DevAgentExecutionResult {
  success: boolean;
  branch: string;
  commitHash: string | null;
  prUrl: string | null;
  prNumber: number | null;
  testResults: DevAgentTestResults | null;
  filesCreated: string[];
  filesModified: string[];
  sessionId: string;
  durationMs: number;
  error: string | null;
}

// ─── Dev Agent Test Results ─────────────────────────────────────────────────

/**
 * Test execution results extracted from CLI output or explicit test run.
 */
export interface DevAgentTestResults {
  total: number;
  passed: number;
  failed: number;
  coverage: number | null;
  testCommand: string;
}

// ─── Dev Agent Progress Event ───────────────────────────────────────────────

/**
 * Progress event emitted during dev agent execution.
 * Sent to workspace WebSocket room for real-time UI updates.
 */
export interface DevAgentProgressEvent {
  type: 'dev-agent:progress';
  sessionId: string;
  storyId: string;
  workspaceId: string;
  step: DevAgentStep;
  status: 'started' | 'completed' | 'failed';
  details: string;
  timestamp: Date;
}

// ─── Dev Agent Step ─────────────────────────────────────────────────────────

/**
 * Steps in the dev agent execution pipeline.
 * Each step reports estimated completion percentage.
 */
export type DevAgentStep =
  | 'reading-story'
  | 'creating-branch'
  | 'spawning-cli'
  | 'writing-code'
  | 'running-tests'
  | 'committing-code'
  | 'pushing-branch'
  | 'creating-pr'
  | 'updating-status';

/**
 * Estimated completion percentage for each dev agent step.
 */
export const DEV_AGENT_STEP_PROGRESS: Record<DevAgentStep, number> = {
  'reading-story': 5,
  'creating-branch': 10,
  'spawning-cli': 15,
  'writing-code': 60,
  'running-tests': 75,
  'committing-code': 80,
  'pushing-branch': 85,
  'creating-pr': 95,
  'updating-status': 100,
};

// ─── Dev Agent Commit Info ──────────────────────────────────────────────────

/**
 * Information about a Git commit made by the dev agent.
 */
export interface DevAgentCommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: Date;
}

// ─── Dev Agent Changed Files ────────────────────────────────────────────────

/**
 * Files changed on the feature branch vs the base branch.
 */
export interface DevAgentChangedFiles {
  created: string[];
  modified: string[];
  deleted: string[];
}
