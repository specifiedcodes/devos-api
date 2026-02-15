/**
 * MockCLIResponseProvider
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Provides deterministic mock responses for CLI sessions.
 * Each agent type has a scripted sequence of outputs that
 * simulate realistic agent behavior without calling the Claude API.
 */

import { PipelineJobResult } from '../interfaces/pipeline-job.interfaces';

// ─── Mock Response Types ────────────────────────────────────────────────────

/**
 * A single mock CLI output line.
 */
export interface MockCLIResponse {
  /** Delay before this output line (ms) */
  delayMs: number;
  /** The CLI output line content */
  content: string;
  /** Stream type (stdout/stderr) */
  stream: 'stdout' | 'stderr';
  /** Optional: simulate a file creation/modification event */
  fileEvent?: { path: string; action: 'create' | 'modify' | 'delete' };
  /** Optional: simulate a test result event */
  testEvent?: { total: number; passed: number; failed: number };
  /** Optional: simulate a git commit event */
  commitEvent?: { hash: string; message: string; branch: string };
}

// ─── Helper to generate deterministic commit hashes ─────────────────────────

function mockHash(seed: string): string {
  // Generate 5 distinct 8-char hex segments from different seed variations
  const segments: string[] = [];
  for (let s = 0; s < 5; s++) {
    let hash = s * 2654435761; // Different starting value per segment
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash + char + s) | 0;
    }
    segments.push(Math.abs(hash).toString(16).padStart(8, '0'));
  }
  return segments.join('').substring(0, 40);
}

// ─── Default Mock Sequences ─────────────────────────────────────────────────

function getPlannerSequence(storyId: string): MockCLIResponse[] {
  return [
    { delayMs: 20, content: `[planner] Starting planning for story ${storyId}...`, stream: 'stdout' },
    { delayMs: 15, content: '[planner] Reading project description and requirements...', stream: 'stdout' },
    { delayMs: 30, content: '[planner] Analyzing tech stack: NestJS + TypeScript + PostgreSQL', stream: 'stdout' },
    { delayMs: 20, content: '[planner] Generating epic structure...', stream: 'stdout' },
    { delayMs: 25, content: '[planner] Creating epic-1.md: User Authentication & Account Management', stream: 'stdout', fileEvent: { path: 'epics/epic-1.md', action: 'create' } },
    { delayMs: 20, content: '[planner] Creating story-1-1.md: Repository Setup Foundation', stream: 'stdout', fileEvent: { path: 'stories/story-1-1.md', action: 'create' } },
    { delayMs: 15, content: '[planner] Creating story-1-2.md: PostgreSQL Multi-Tenant Setup', stream: 'stdout', fileEvent: { path: 'stories/story-1-2.md', action: 'create' } },
    { delayMs: 20, content: '[planner] Creating story-1-3.md: User Registration API', stream: 'stdout', fileEvent: { path: 'stories/story-1-3.md', action: 'create' } },
    { delayMs: 15, content: '[planner] Generating sprint-status.yaml...', stream: 'stdout', fileEvent: { path: 'sprint-status.yaml', action: 'create' } },
    { delayMs: 25, content: '[planner] Defining acceptance criteria for each story...', stream: 'stdout' },
    { delayMs: 20, content: '[planner] Setting story dependencies...', stream: 'stdout' },
    { delayMs: 15, content: '[planner] Validating BMAD template compliance...', stream: 'stdout' },
    { delayMs: 20, content: '[planner] All planning documents validated successfully', stream: 'stdout' },
    { delayMs: 25, content: '[planner] Staging planning documents for commit...', stream: 'stdout' },
    { delayMs: 30, content: '[planner] Committing planning documents...', stream: 'stdout', commitEvent: { hash: mockHash(`planner-${storyId}`), message: 'chore(planning): add epic-1 stories and sprint status', branch: 'main' } },
    { delayMs: 20, content: '[planner] Pushing planning documents to remote...', stream: 'stdout' },
    { delayMs: 15, content: '[planner] Sprint status updated: 3 stories in backlog', stream: 'stdout' },
    { delayMs: 10, content: `[planner] Planning complete for story ${storyId}`, stream: 'stdout' },
  ];
}

function getDevSequence(storyId: string): MockCLIResponse[] {
  const branch = `feature/${storyId}`;
  const commitHash = mockHash(`dev-${storyId}`);
  return [
    { delayMs: 20, content: `[dev] Starting implementation for story ${storyId}...`, stream: 'stdout' },
    { delayMs: 15, content: `[dev] Reading story requirements and acceptance criteria...`, stream: 'stdout' },
    { delayMs: 25, content: `[dev] Creating feature branch: ${branch}`, stream: 'stdout' },
    { delayMs: 20, content: '[dev] Analyzing tech stack: NestJS + TypeScript + PostgreSQL', stream: 'stdout' },
    { delayMs: 30, content: '[dev] Writing failing tests first (TDD)...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Creating src/services/auth.service.spec.ts', stream: 'stdout', fileEvent: { path: 'src/services/auth.service.spec.ts', action: 'create' } },
    { delayMs: 20, content: '[dev] Creating src/controllers/auth.controller.spec.ts', stream: 'stdout', fileEvent: { path: 'src/controllers/auth.controller.spec.ts', action: 'create' } },
    { delayMs: 15, content: '[dev] Running tests (expecting failures)...', stream: 'stdout' },
    { delayMs: 20, content: '[dev] Tests: 0 passed, 8 failed (as expected for TDD)', stream: 'stderr', testEvent: { total: 8, passed: 0, failed: 8 } },
    { delayMs: 30, content: '[dev] Implementing service layer...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Creating src/services/auth.service.ts', stream: 'stdout', fileEvent: { path: 'src/services/auth.service.ts', action: 'create' } },
    { delayMs: 20, content: '[dev] Creating src/controllers/auth.controller.ts', stream: 'stdout', fileEvent: { path: 'src/controllers/auth.controller.ts', action: 'create' } },
    { delayMs: 25, content: '[dev] Creating src/dto/auth.dto.ts', stream: 'stdout', fileEvent: { path: 'src/dto/auth.dto.ts', action: 'create' } },
    { delayMs: 20, content: '[dev] Creating src/entities/user.entity.ts', stream: 'stdout', fileEvent: { path: 'src/entities/user.entity.ts', action: 'create' } },
    { delayMs: 15, content: '[dev] Implementing controller layer...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Modifying src/app.module.ts', stream: 'stdout', fileEvent: { path: 'src/app.module.ts', action: 'modify' } },
    { delayMs: 20, content: '[dev] Adding validation pipes and guards...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Creating src/guards/jwt-auth.guard.ts', stream: 'stdout', fileEvent: { path: 'src/guards/jwt-auth.guard.ts', action: 'create' } },
    { delayMs: 30, content: '[dev] Running full test suite...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Tests: 8 passed, 0 failed', stream: 'stdout', testEvent: { total: 8, passed: 8, failed: 0 } },
    { delayMs: 20, content: '[dev] Running lint check...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Lint: 0 errors, 0 warnings', stream: 'stdout' },
    { delayMs: 20, content: '[dev] Running type check...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] TypeScript: no errors found', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Staging all changes...', stream: 'stdout' },
    { delayMs: 30, content: `[dev] Committing: feat(auth): implement authentication service`, stream: 'stdout', commitEvent: { hash: commitHash, message: `feat(auth): implement authentication service for ${storyId}`, branch } },
    { delayMs: 20, content: `[dev] Pushing branch ${branch} to origin...`, stream: 'stdout' },
    { delayMs: 25, content: '[dev] Creating pull request...', stream: 'stdout' },
    { delayMs: 30, content: `[dev] PR #42 created: https://github.com/test-org/e2e-test-repo/pull/42`, stream: 'stdout' },
    { delayMs: 20, content: '[dev] Verifying PR checks...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] All PR checks passing', stream: 'stdout' },
    { delayMs: 20, content: '[dev] Adding PR description with acceptance criteria mapping...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] PR description updated with test results', stream: 'stdout' },
    { delayMs: 10, content: `[dev] Implementation complete for story ${storyId}`, stream: 'stdout' },
    { delayMs: 5, content: `[dev] Branch: ${branch}, PR: #42, Tests: 8/8 passed`, stream: 'stdout' },
  ];
}

function getQASequence(storyId: string): MockCLIResponse[] {
  return [
    { delayMs: 20, content: `[qa] Starting QA review for story ${storyId}...`, stream: 'stdout' },
    { delayMs: 15, content: `[qa] Checking out branch: feature/${storyId}`, stream: 'stdout' },
    { delayMs: 25, content: '[qa] Reviewing PR #42...', stream: 'stdout' },
    { delayMs: 20, content: '[qa] Running test suite...', stream: 'stdout' },
    { delayMs: 30, content: '[qa] Tests: 8 passed, 0 failed', stream: 'stdout', testEvent: { total: 8, passed: 8, failed: 0 } },
    { delayMs: 20, content: '[qa] Running lint analysis...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] Lint: 0 errors, 0 warnings (clean)', stream: 'stdout' },
    { delayMs: 25, content: '[qa] Running type check...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] TypeScript: no errors found', stream: 'stdout' },
    { delayMs: 20, content: '[qa] Running npm audit...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] npm audit: 0 vulnerabilities (clean)', stream: 'stdout' },
    { delayMs: 25, content: '[qa] Checking acceptance criteria...', stream: 'stdout' },
    { delayMs: 20, content: '[qa] AC #1: User can register - VERIFIED', stream: 'stdout' },
    { delayMs: 15, content: '[qa] AC #2: Password hashed with bcrypt - VERIFIED', stream: 'stdout' },
    { delayMs: 15, content: '[qa] AC #3: JWT token returned - VERIFIED', stream: 'stdout' },
    { delayMs: 20, content: '[qa] AC #4: Input validation works - VERIFIED', stream: 'stdout' },
    { delayMs: 25, content: '[qa] All acceptance criteria verified', stream: 'stdout' },
    { delayMs: 20, content: '[qa] Code coverage: 92% (exceeds 80% threshold)', stream: 'stdout' },
    { delayMs: 15, content: '[qa] No secret scanning issues found', stream: 'stdout' },
    { delayMs: 30, content: '[qa] Generating QA report...', stream: 'stdout' },
    { delayMs: 20, content: '[qa] QA Verdict: PASS', stream: 'stdout' },
    { delayMs: 25, content: '[qa] Submitting PR approval...', stream: 'stdout' },
    { delayMs: 20, content: '[qa] PR #42 approved with review comment', stream: 'stdout' },
    { delayMs: 15, content: '[qa] QA report attached to PR', stream: 'stdout' },
    { delayMs: 10, content: `[qa] QA review complete for story ${storyId}: PASS`, stream: 'stdout' },
  ];
}

function getDevOpsSequence(storyId: string): MockCLIResponse[] {
  const mergeHash = mockHash(`devops-merge-${storyId}`);
  return [
    { delayMs: 20, content: `[devops] Starting deployment for story ${storyId}...`, stream: 'stdout' },
    { delayMs: 15, content: '[devops] Reviewing PR #42 QA approval...', stream: 'stdout' },
    { delayMs: 25, content: '[devops] Merging PR #42 to main...', stream: 'stdout' },
    { delayMs: 30, content: `[devops] PR #42 merged successfully (merge commit: ${mergeHash.substring(0, 7)})`, stream: 'stdout', commitEvent: { hash: mergeHash, message: 'Merge pull request #42', branch: 'main' } },
    { delayMs: 20, content: '[devops] Detecting deployment platform...', stream: 'stdout' },
    { delayMs: 15, content: '[devops] Platform detected: Railway (from project config)', stream: 'stdout' },
    { delayMs: 25, content: '[devops] Triggering deployment to Railway...', stream: 'stdout' },
    { delayMs: 30, content: '[devops] Deployment initiated: deploy-e2e-12345', stream: 'stdout' },
    { delayMs: 40, content: '[devops] Deployment progress: Building... (1/3)', stream: 'stdout' },
    { delayMs: 40, content: '[devops] Deployment progress: Deploying... (2/3)', stream: 'stdout' },
    { delayMs: 30, content: '[devops] Deployment progress: Health check... (3/3)', stream: 'stdout' },
    { delayMs: 20, content: '[devops] Deployment successful!', stream: 'stdout' },
    { delayMs: 15, content: '[devops] URL: https://e2e-test-project.railway.app', stream: 'stdout' },
    { delayMs: 25, content: '[devops] Running smoke tests...', stream: 'stdout' },
    { delayMs: 30, content: '[devops] Smoke test: GET /health -> 200 OK', stream: 'stdout', testEvent: { total: 3, passed: 3, failed: 0 } },
    { delayMs: 20, content: '[devops] Smoke test: GET /api/version -> 200 OK', stream: 'stdout' },
    { delayMs: 15, content: '[devops] Smoke test: POST /api/auth/register -> 201 Created', stream: 'stdout' },
    { delayMs: 10, content: `[devops] Deployment complete for story ${storyId}: SUCCESS`, stream: 'stdout' },
  ];
}

function getQARejectionSequence(storyId: string): MockCLIResponse[] {
  return [
    { delayMs: 20, content: `[qa] Starting QA review for story ${storyId}...`, stream: 'stdout' },
    { delayMs: 15, content: `[qa] Checking out branch: feature/${storyId}`, stream: 'stdout' },
    { delayMs: 25, content: '[qa] Running test suite...', stream: 'stdout' },
    { delayMs: 30, content: '[qa] Tests: 6 passed, 2 failed', stream: 'stderr', testEvent: { total: 8, passed: 6, failed: 2 } },
    { delayMs: 20, content: '[qa] FAILED: auth.service.spec.ts > should hash password with bcrypt', stream: 'stderr' },
    { delayMs: 15, content: '[qa] FAILED: auth.controller.spec.ts > should validate input', stream: 'stderr' },
    { delayMs: 20, content: '[qa] Running lint analysis...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] Lint: 3 errors found', stream: 'stderr' },
    { delayMs: 15, content: '[qa] Error: src/services/auth.service.ts:42 - no-unused-vars', stream: 'stderr' },
    { delayMs: 20, content: '[qa] Checking acceptance criteria...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] AC #1: User can register - VERIFIED', stream: 'stdout' },
    { delayMs: 15, content: '[qa] AC #2: Password hashed with bcrypt - FAILED', stream: 'stderr' },
    { delayMs: 15, content: '[qa] AC #3: JWT token returned - VERIFIED', stream: 'stdout' },
    { delayMs: 15, content: '[qa] AC #4: Input validation works - FAILED', stream: 'stderr' },
    { delayMs: 25, content: '[qa] Generating QA report...', stream: 'stdout' },
    { delayMs: 20, content: '[qa] QA Verdict: FAIL', stream: 'stderr' },
    { delayMs: 15, content: '[qa] Reason: 2 test failures, 3 lint errors, 2 acceptance criteria not met', stream: 'stderr' },
    { delayMs: 20, content: '[qa] Requesting changes on PR #42...', stream: 'stdout' },
    { delayMs: 15, content: '[qa] Change requests submitted to Dev agent', stream: 'stdout' },
    { delayMs: 10, content: `[qa] QA review complete for story ${storyId}: FAIL`, stream: 'stdout' },
  ];
}

function getFailureCrashSequence(): MockCLIResponse[] {
  return [
    { delayMs: 20, content: '[dev] Starting implementation...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Reading story requirements...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Creating feature branch...', stream: 'stdout' },
    { delayMs: 20, content: '[dev] Writing tests...', stream: 'stdout' },
    { delayMs: 15, content: 'Error: Connection reset by peer', stream: 'stderr' },
    { delayMs: 5, content: 'Claude CLI process exited with code 1', stream: 'stderr' },
  ];
}

function getFailureStuckSequence(): MockCLIResponse[] {
  return [
    { delayMs: 20, content: '[dev] Starting implementation...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Reading story requirements...', stream: 'stdout' },
    { delayMs: 25, content: '[dev] Analyzing codebase...', stream: 'stdout' },
    // No more output -- agent is "stuck"
  ];
}

function getFailureTimeoutSequence(): MockCLIResponse[] {
  return [
    { delayMs: 20, content: '[dev] Starting implementation...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Reading story requirements...', stream: 'stdout' },
    { delayMs: 100000, content: '[dev] Still working...', stream: 'stdout' }, // Very long delay = timeout
  ];
}

function getFailureAPIErrorSequence(): MockCLIResponse[] {
  return [
    { delayMs: 20, content: '[dev] Starting implementation...', stream: 'stdout' },
    { delayMs: 15, content: '[dev] Reading story requirements...', stream: 'stdout' },
    { delayMs: 10, content: 'Error: 429 Too Many Requests - Rate limit exceeded', stream: 'stderr' },
    { delayMs: 10, content: 'Error: 429 Too Many Requests - Rate limit exceeded', stream: 'stderr' },
    { delayMs: 10, content: 'Error: 429 Too Many Requests - Rate limit exceeded', stream: 'stderr' },
    { delayMs: 10, content: 'Error: 429 Too Many Requests - Rate limit exceeded', stream: 'stderr' },
    { delayMs: 10, content: 'Error: 429 Too Many Requests - Rate limit exceeded', stream: 'stderr' },
    { delayMs: 5, content: 'Claude CLI process exited with code 1', stream: 'stderr' },
  ];
}

// ─── MockCLIResponseProvider ────────────────────────────────────────────────

/**
 * Provides deterministic mock responses for CLI sessions.
 */
export class MockCLIResponseProvider {
  private customSequences = new Map<
    string,
    { responses: MockCLIResponse[]; result: PipelineJobResult }
  >();

  /**
   * Get the mock response sequence for an agent type.
   */
  getResponseSequence(
    agentType: string,
    storyId: string,
  ): MockCLIResponse[] {
    // Check custom sequences first
    const customKey = `${agentType}:${storyId}`;
    if (this.customSequences.has(customKey)) {
      return this.customSequences.get(customKey)!.responses;
    }

    switch (agentType) {
      case 'planner':
        return getPlannerSequence(storyId);
      case 'dev':
        return getDevSequence(storyId);
      case 'qa':
        return getQASequence(storyId);
      case 'devops':
        return getDevOpsSequence(storyId);
      default:
        throw new Error(
          `Unknown agent type: '${agentType}'. ` +
            `Supported types: planner, dev, qa, devops`,
        );
    }
  }

  /**
   * Get the expected pipeline result for an agent type.
   */
  getExpectedResult(
    agentType: string,
    storyId: string,
  ): PipelineJobResult {
    // Check custom sequences first
    const customKey = `${agentType}:${storyId}`;
    if (this.customSequences.has(customKey)) {
      return this.customSequences.get(customKey)!.result;
    }

    const sessionId = `mock-session-${agentType}-${storyId}`;

    switch (agentType) {
      case 'planner':
        return {
          sessionId,
          exitCode: 0,
          branch: 'main',
          commitHash: mockHash(`planner-${storyId}`),
          outputLineCount: 18,
          durationMs: 350,
          error: null,
          metadata: {
            storiesCreated: 3,
            epicId: 'epic-1',
            sprintStatusUpdated: true,
          },
        };
      case 'dev':
        return {
          sessionId,
          exitCode: 0,
          branch: `feature/${storyId}`,
          commitHash: mockHash(`dev-${storyId}`),
          outputLineCount: 35,
          durationMs: 700,
          error: null,
          metadata: {
            prNumber: 42,
            prUrl: 'https://github.com/test-org/e2e-test-repo/pull/42',
            testResults: { total: 8, passed: 8, failed: 0 },
            filesCreated: [
              'src/services/auth.service.ts',
              'src/services/auth.service.spec.ts',
              'src/controllers/auth.controller.ts',
              'src/controllers/auth.controller.spec.ts',
              'src/dto/auth.dto.ts',
              'src/entities/user.entity.ts',
              'src/guards/jwt-auth.guard.ts',
            ],
          },
        };
      case 'qa':
        return {
          sessionId,
          exitCode: 0,
          branch: `feature/${storyId}`,
          commitHash: null,
          outputLineCount: 25,
          durationMs: 500,
          error: null,
          metadata: {
            qaVerdict: 'PASS',
            testResults: { total: 8, passed: 8, failed: 0 },
            lintErrors: 0,
            securityIssues: 0,
            coveragePercent: 92,
            acceptanceCriteriaMet: 4,
            acceptanceCriteriaTotal: 4,
          },
        };
      case 'devops':
        return {
          sessionId,
          exitCode: 0,
          branch: 'main',
          commitHash: mockHash(`devops-merge-${storyId}`),
          outputLineCount: 18,
          durationMs: 450,
          error: null,
          metadata: {
            deploymentUrl: 'https://e2e-test-project.railway.app',
            deploymentPlatform: 'railway',
            smokeTestsPassed: true,
            mergeCommitHash: mockHash(`devops-merge-${storyId}`),
            prMerged: 42,
          },
        };
      default:
        throw new Error(
          `Unknown agent type: '${agentType}'. ` +
            `Supported types: planner, dev, qa, devops`,
        );
    }
  }

  /**
   * Register a custom response sequence for a specific test scenario.
   */
  registerCustomSequence(
    key: string,
    responses: MockCLIResponse[],
    result: PipelineJobResult,
  ): void {
    this.customSequences.set(key, { responses, result });
  }

  /**
   * Get mock QA rejection sequence for testing rejection loops.
   */
  getQARejectionSequence(storyId: string): MockCLIResponse[] {
    return getQARejectionSequence(storyId);
  }

  /**
   * Get failure injection mock sequences.
   */
  getFailureSequence(
    failureType: 'crash' | 'stuck' | 'timeout' | 'api_error',
  ): MockCLIResponse[] {
    switch (failureType) {
      case 'crash':
        return getFailureCrashSequence();
      case 'stuck':
        return getFailureStuckSequence();
      case 'timeout':
        return getFailureTimeoutSequence();
      case 'api_error':
        return getFailureAPIErrorSequence();
      default:
        throw new Error(
          `Unknown failure type: '${failureType}'. ` +
            `Supported types: crash, stuck, timeout, api_error`,
        );
    }
  }
}
