/**
 * QA Agent Execution Interfaces
 * Story 11.5: QA Agent CLI Integration
 *
 * Defines types and interfaces for the QA Agent pipeline execution,
 * including execution params/results, test results, security scans,
 * static analysis, acceptance criteria validation, coverage analysis,
 * progress events, and the comprehensive QA report.
 */

import { DevAgentTestResults } from './dev-agent-execution.interfaces';

// ─── QA Agent Execution Params ──────────────────────────────────────────────

/**
 * Parameters required to execute a full QA cycle for a story.
 * Passed from PipelineJobHandler to QAAgentPipelineExecutor.
 * Extends DevAgentExecutionParams with QA-specific fields like PR info
 * and Dev Agent handoff data.
 */
export interface QAAgentExecutionParams {
  workspaceId: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  storyDescription: string;
  acceptanceCriteria: string[];
  techStack: string;
  testingStrategy: string;
  workspacePath: string;
  gitRepoUrl: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
  /** PR URL from Dev Agent (Story 11.4 handoff) */
  prUrl: string;
  /** PR number from Dev Agent */
  prNumber: number;
  /** Feature branch from Dev Agent */
  devBranch: string;
  /** Dev Agent's test baseline for comparison */
  devTestResults: DevAgentTestResults | null;
}

// ─── QA Agent Execution Result ──────────────────────────────────────────────

/**
 * Result returned after a QA agent execution completes.
 * Includes verdict, QA report, session info, and duration.
 */
export interface QAAgentExecutionResult {
  success: boolean;
  verdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES';
  qaReport: QAReport;
  additionalTestsWritten: number;
  sessionId: string;
  durationMs: number;
  error: string | null;
}

// ─── QA Report ──────────────────────────────────────────────────────────────

/**
 * Comprehensive QA report containing results from all QA checks.
 */
export interface QAReport {
  storyId: string;
  verdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES';
  testResults: QATestResults;
  securityScan: QASecurityScan;
  lintResults: QALintResults;
  typeCheckResults: QATypeCheckResults;
  acceptanceCriteria: QAAcceptanceCriterionResult[];
  coverageAnalysis: QACoverageAnalysis;
  comments: string[];
  summary: string;
}

// ─── QA Test Results ────────────────────────────────────────────────────────

/**
 * Test execution results extracted from CLI output or explicit test run.
 */
export interface QATestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: number | null;
  testCommand: string;
  failedTests: QAFailedTest[];
}

/**
 * Information about an individual failed test.
 */
export interface QAFailedTest {
  testName: string;
  file: string;
  error: string;
}

// ─── QA Test Comparison ─────────────────────────────────────────────────────

/**
 * Comparison between QA test results and Dev Agent baseline.
 * Used to detect regressions.
 */
export interface QATestComparison {
  /** Change in total test count */
  totalDelta: number;
  /** Change in passing tests */
  passedDelta: number;
  /** Change in failing tests */
  failedDelta: number;
  /** Change in coverage percentage */
  coverageDelta: number | null;
  /** Whether tests that previously passed now fail */
  hasRegressions: boolean;
  /** Number of regressed tests */
  regressionCount: number;
}

// ─── QA Lint Results ────────────────────────────────────────────────────────

/**
 * ESLint / linter results.
 */
export interface QALintResults {
  errors: number;
  warnings: number;
  fixableErrors: number;
  fixableWarnings: number;
  /** true if zero errors */
  passed: boolean;
  /** Raw lint output (truncated to 2000 chars) */
  details: string;
}

// ─── QA Type Check Results ──────────────────────────────────────────────────

/**
 * TypeScript type check results.
 */
export interface QATypeCheckResults {
  errors: number;
  /** true if zero errors */
  passed: boolean;
  /** Raw tsc output (truncated to 2000 chars) */
  details: string;
}

// ─── QA Security Scan ───────────────────────────────────────────────────────

/**
 * npm audit security scan results.
 */
export interface QASecurityScan {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
  /** true if zero critical/high */
  passed: boolean;
  /** Raw audit output (truncated to 2000 chars) */
  details: string;
}

// ─── QA Secret Scan Result ──────────────────────────────────────────────────

/**
 * Result of scanning source files for hardcoded secrets.
 */
export interface QASecretScanResult {
  secretsFound: boolean;
  findings: Array<{
    file: string;
    line: number;
    /** What pattern matched (e.g., "API_KEY", "password") */
    pattern: string;
  }>;
}

// ─── QA Acceptance Criterion Result ─────────────────────────────────────────

/**
 * Verification result for a single acceptance criterion.
 */
export interface QAAcceptanceCriterionResult {
  criterion: string;
  met: boolean;
  /** Brief explanation of how it was verified */
  evidence: string;
}

// ─── QA Coverage Analysis ───────────────────────────────────────────────────

/**
 * Coverage analysis comparing current vs baseline.
 */
export interface QACoverageAnalysis {
  currentCoverage: number | null;
  baselineCoverage: number | null;
  delta: number | null;
  /** true if coverage >= 80% threshold */
  meetsThreshold: boolean;
}

// ─── QA Agent Progress Event ────────────────────────────────────────────────

/**
 * Progress event emitted during QA agent execution.
 * Sent to workspace WebSocket room for real-time UI updates.
 */
export interface QAAgentProgressEvent {
  type: 'qa-agent:progress';
  sessionId: string;
  storyId: string;
  workspaceId: string;
  step: QAAgentStep;
  status: 'started' | 'completed' | 'failed';
  details: string;
  timestamp: Date;
}

// ─── QA Agent Step ──────────────────────────────────────────────────────────

/**
 * Steps in the QA agent execution pipeline.
 * Each step reports estimated completion percentage.
 */
export type QAAgentStep =
  | 'checking-out-branch'
  | 'reading-criteria'
  | 'spawning-cli'
  | 'running-qa-checks'
  | 'running-tests'
  | 'running-lint'
  | 'running-type-check'
  | 'running-security-scan'
  | 'validating-acceptance'
  | 'generating-report'
  | 'submitting-review'
  | 'updating-status';

/**
 * Estimated completion percentage for each QA agent step.
 */
export const QA_AGENT_STEP_PROGRESS: Record<QAAgentStep, number> = {
  'checking-out-branch': 5,
  'reading-criteria': 10,
  'spawning-cli': 15,
  'running-qa-checks': 50,
  'running-tests': 60,
  'running-lint': 65,
  'running-type-check': 70,
  'running-security-scan': 75,
  'validating-acceptance': 80,
  'generating-report': 90,
  'submitting-review': 95,
  'updating-status': 100,
};

/** Coverage threshold: >= 80% required for PASS */
export const QA_COVERAGE_THRESHOLD = 80;

/** Coverage threshold for NEEDS_CHANGES (borderline) */
export const QA_COVERAGE_BORDERLINE_THRESHOLD = 70;
