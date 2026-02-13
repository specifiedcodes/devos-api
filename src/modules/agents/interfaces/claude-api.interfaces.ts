/**
 * Claude API Interfaces
 * Story 5.3: Dev Agent Implementation
 *
 * TypeScript interfaces for Claude API request/response types
 * and Dev Agent task result types
 */

export interface ClaudeApiRequest {
  workspaceId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number; // default: 4096
  temperature?: number; // default: 0.3
  model?: string; // default: 'claude-sonnet-4-20250514'
}

export interface ClaudeApiResponse {
  content: string; // The generated text response
  model: string; // Model used
  inputTokens: number; // Input token count
  outputTokens: number; // Output token count
  stopReason: string; // 'end_turn', 'max_tokens', etc.
}

export interface CodeBlock {
  filename: string;
  language: string;
  content: string;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface ImplementStoryResult {
  status: 'implemented';
  storyId: string;
  plan: string;
  filesGenerated: string[];
  codeBlocks: CodeBlock[];
  testsGenerated: boolean;
  summary: string;
  tokensUsed: TokenUsage;
}

export interface FixBugResult {
  status: 'fixed';
  description: string;
  rootCause: string;
  fix: string;
  filesModified: string[];
  codeChanges: CodeBlock[];
  testsAdded: boolean;
  tokensUsed: TokenUsage;
}

export interface TestFileResult {
  filename: string;
  language: string;
  content: string;
  testCount: number;
}

export interface WriteTestsResult {
  status: 'tests_written';
  description: string;
  testFiles: TestFileResult[];
  totalTests: number;
  coverageEstimate: 'high' | 'medium' | 'low';
  tokensUsed: TokenUsage;
}

export interface RefactorResult {
  status: 'refactored';
  description: string;
  improvements: string[];
  filesModified: string[];
  codeChanges: CodeBlock[];
  qualityMetrics: {
    complexityReduction: string;
    maintainabilityImprovement: string;
  };
  tokensUsed: TokenUsage;
}

export interface AnalyzeCodeResult {
  issues: Array<{
    file: string;
    line: number;
    severity: string;
    description: string;
  }>;
  suggestions: Array<{
    file: string;
    description: string;
  }>;
  metrics: {
    complexity: string;
    maintainability: string;
  };
  tokensUsed: TokenUsage;
}

export type DevAgentResult =
  | ImplementStoryResult
  | FixBugResult
  | WriteTestsResult
  | RefactorResult;
