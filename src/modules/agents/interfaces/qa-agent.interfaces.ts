/**
 * QA Agent Interfaces
 * Story 5.5: QA Agent Implementation
 *
 * TypeScript interfaces for QA agent task inputs and result types.
 */

import { TokenUsage } from './claude-api.interfaces';

/**
 * Input task for the QA Agent.
 * Each task type maps to a specific QA operation.
 */
export interface QAAgentTask {
  type: 'run-tests' | 'code-review' | 'security-audit' | 'coverage-analysis';
  storyId?: string;
  pullRequestId?: string;
  description: string;
  files?: string[];
  acceptanceCriteria?: string[];
  codebase?: string;
}

/**
 * Result for run-tests task type
 */
export interface RunTestsResult {
  status: 'tests_completed';
  storyId: string;
  testResults: Array<{
    file: string;
    testName: string;
    status: 'pass' | 'fail' | 'skip';
    message: string;
  }>;
  passed: number;
  failed: number;
  skipped: number;
  coverageEstimate: number;
  recommendations: string[];
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for code-review task type
 */
export interface CodeReviewResult {
  status: 'review_completed';
  pullRequestId: string;
  issues: Array<{
    file: string;
    line: number;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: 'bug' | 'security' | 'performance' | 'style' | 'maintainability';
    description: string;
    suggestion: string;
  }>;
  approved: boolean;
  decision: 'PASS' | 'FAIL' | 'NEEDS_INFO';
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for security-audit task type
 */
export interface SecurityAuditResult {
  status: 'audit_completed';
  vulnerabilities: Array<{
    file: string;
    line: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    description: string;
    remediation: string;
  }>;
  hardcodedSecrets: boolean;
  dependencyIssues: string[];
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
  recommendations: string[];
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for coverage-analysis task type
 */
export interface CoverageAnalysisResult {
  status: 'coverage_analyzed';
  description: string;
  coverageGaps: Array<{
    file: string;
    untestedPaths: string[];
    suggestedTests: string[];
    priority: 'high' | 'medium' | 'low';
  }>;
  overallCoverage: number;
  meetsCoverageThreshold: boolean;
  additionalTestsNeeded: number;
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Union type of all QA agent result types
 */
export type QAAgentResult =
  | RunTestsResult
  | CodeReviewResult
  | SecurityAuditResult
  | CoverageAnalysisResult;
