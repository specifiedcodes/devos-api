/**
 * MockCLIResponseProvider Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Tests for the deterministic mock CLI response provider.
 */

import {
  MockCLIResponseProvider,
  MockCLIResponse,
} from './mock-cli-response-provider';

describe('MockCLIResponseProvider', () => {
  let provider: MockCLIResponseProvider;
  const testStoryId = 'test-story-1';

  beforeEach(() => {
    provider = new MockCLIResponseProvider();
  });

  describe('getResponseSequence("planner")', () => {
    it('should return 15-20 planner output lines', () => {
      const sequence = provider.getResponseSequence('planner', testStoryId);

      expect(sequence.length).toBeGreaterThanOrEqual(15);
      expect(sequence.length).toBeLessThanOrEqual(20);
    });

    it('should include file creation events for planning docs', () => {
      const sequence = provider.getResponseSequence('planner', testStoryId);
      const fileEvents = sequence.filter((r) => r.fileEvent);

      expect(fileEvents.length).toBeGreaterThan(0);
      expect(
        fileEvents.some((r) => r.fileEvent!.action === 'create'),
      ).toBe(true);
    });

    it('should include a commit event', () => {
      const sequence = provider.getResponseSequence('planner', testStoryId);
      const commitEvents = sequence.filter((r) => r.commitEvent);

      expect(commitEvents.length).toBe(1);
      expect(commitEvents[0].commitEvent!.branch).toBe('main');
    });
  });

  describe('getResponseSequence("dev")', () => {
    it('should return 30-40 dev output lines with file/test/commit events', () => {
      const sequence = provider.getResponseSequence('dev', testStoryId);

      expect(sequence.length).toBeGreaterThanOrEqual(30);
      expect(sequence.length).toBeLessThanOrEqual(40);
    });

    it('should include file events for source and test files', () => {
      const sequence = provider.getResponseSequence('dev', testStoryId);
      const fileEvents = sequence.filter((r) => r.fileEvent);

      expect(fileEvents.length).toBeGreaterThan(5);
      expect(
        fileEvents.some((r) => r.fileEvent!.path.endsWith('.spec.ts')),
      ).toBe(true);
      expect(
        fileEvents.some(
          (r) =>
            r.fileEvent!.path.endsWith('.ts') &&
            !r.fileEvent!.path.endsWith('.spec.ts'),
        ),
      ).toBe(true);
    });

    it('should include test events showing TDD progression', () => {
      const sequence = provider.getResponseSequence('dev', testStoryId);
      const testEvents = sequence.filter((r) => r.testEvent);

      expect(testEvents.length).toBe(2);
      // First test run: all failures (TDD red phase)
      expect(testEvents[0].testEvent!.failed).toBeGreaterThan(0);
      expect(testEvents[0].testEvent!.passed).toBe(0);
      // Second test run: all passing (TDD green phase)
      expect(testEvents[1].testEvent!.passed).toBeGreaterThan(0);
      expect(testEvents[1].testEvent!.failed).toBe(0);
    });

    it('should include commit and PR events', () => {
      const sequence = provider.getResponseSequence('dev', testStoryId);
      const commitEvents = sequence.filter((r) => r.commitEvent);

      expect(commitEvents.length).toBe(1);
      expect(commitEvents[0].commitEvent!.branch).toBe(
        `feature/${testStoryId}`,
      );
    });
  });

  describe('getResponseSequence("qa")', () => {
    it('should return 20-30 QA output lines with test/lint events', () => {
      const sequence = provider.getResponseSequence('qa', testStoryId);

      expect(sequence.length).toBeGreaterThanOrEqual(20);
      expect(sequence.length).toBeLessThanOrEqual(30);
    });

    it('should include test result events', () => {
      const sequence = provider.getResponseSequence('qa', testStoryId);
      const testEvents = sequence.filter((r) => r.testEvent);

      expect(testEvents.length).toBeGreaterThanOrEqual(1);
      expect(testEvents[0].testEvent!.passed).toBeGreaterThan(0);
      expect(testEvents[0].testEvent!.failed).toBe(0);
    });
  });

  describe('getResponseSequence("devops")', () => {
    it('should return 15-20 DevOps output lines with deployment events', () => {
      const sequence = provider.getResponseSequence('devops', testStoryId);

      expect(sequence.length).toBeGreaterThanOrEqual(15);
      expect(sequence.length).toBeLessThanOrEqual(20);
    });

    it('should include merge commit event', () => {
      const sequence = provider.getResponseSequence('devops', testStoryId);
      const commitEvents = sequence.filter((r) => r.commitEvent);

      expect(commitEvents.length).toBe(1);
      expect(commitEvents[0].commitEvent!.branch).toBe('main');
    });

    it('should include smoke test events', () => {
      const sequence = provider.getResponseSequence('devops', testStoryId);
      const testEvents = sequence.filter((r) => r.testEvent);

      expect(testEvents.length).toBeGreaterThanOrEqual(1);
      expect(testEvents[0].testEvent!.failed).toBe(0);
    });
  });

  describe('getExpectedResult("planner")', () => {
    it('should return PipelineJobResult with planning metadata', () => {
      const result = provider.getExpectedResult('planner', testStoryId);

      expect(result.exitCode).toBe(0);
      expect(result.branch).toBe('main');
      expect(result.commitHash).toBeDefined();
      expect(result.error).toBeNull();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.storiesCreated).toBeGreaterThan(0);
      expect(result.metadata!.sprintStatusUpdated).toBe(true);
    });
  });

  describe('getExpectedResult("dev")', () => {
    it('should return PipelineJobResult with branch, commit, PR data', () => {
      const result = provider.getExpectedResult('dev', testStoryId);

      expect(result.exitCode).toBe(0);
      expect(result.branch).toBe(`feature/${testStoryId}`);
      expect(result.commitHash).toBeDefined();
      expect(result.error).toBeNull();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.prNumber).toBeDefined();
      expect(result.metadata!.prUrl).toContain('github.com');
      expect(result.metadata!.testResults).toBeDefined();
      expect(result.metadata!.testResults.passed).toBeGreaterThan(0);
    });
  });

  describe('getExpectedResult("qa")', () => {
    it('should return PipelineJobResult with QA report metadata', () => {
      const result = provider.getExpectedResult('qa', testStoryId);

      expect(result.exitCode).toBe(0);
      expect(result.error).toBeNull();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.qaVerdict).toBe('PASS');
      expect(result.metadata!.testResults).toBeDefined();
      expect(result.metadata!.coveragePercent).toBeGreaterThan(80);
    });
  });

  describe('getExpectedResult("devops")', () => {
    it('should return PipelineJobResult with deployment URL and merge hash', () => {
      const result = provider.getExpectedResult('devops', testStoryId);

      expect(result.exitCode).toBe(0);
      expect(result.error).toBeNull();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.deploymentUrl).toBeDefined();
      expect(result.metadata!.smokeTestsPassed).toBe(true);
      expect(result.metadata!.mergeCommitHash).toBeDefined();
    });
  });

  describe('registerCustomSequence', () => {
    it('should override default for given key', () => {
      const customResponses: MockCLIResponse[] = [
        { delayMs: 10, content: 'custom response', stream: 'stdout' },
      ];
      const customResult = {
        sessionId: 'custom-session',
        exitCode: 0,
        branch: 'custom-branch',
        commitHash: 'abc123',
        outputLineCount: 1,
        durationMs: 100,
        error: null,
      };

      provider.registerCustomSequence(
        `dev:${testStoryId}`,
        customResponses,
        customResult,
      );

      const sequence = provider.getResponseSequence('dev', testStoryId);
      expect(sequence).toEqual(customResponses);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result).toEqual(customResult);
    });
  });

  describe('Unknown agent type handling', () => {
    it('should throw descriptive error for unknown agent type in getResponseSequence', () => {
      expect(() =>
        provider.getResponseSequence('unknown-agent', testStoryId),
      ).toThrow("Unknown agent type: 'unknown-agent'");
    });

    it('should throw descriptive error for unknown agent type in getExpectedResult', () => {
      expect(() =>
        provider.getExpectedResult('unknown-agent', testStoryId),
      ).toThrow("Unknown agent type: 'unknown-agent'");
    });
  });

  describe('Mock response quality', () => {
    it('should include realistic timing (delays between lines)', () => {
      const agentTypes = ['planner', 'dev', 'qa', 'devops'];

      for (const agentType of agentTypes) {
        const sequence = provider.getResponseSequence(agentType, testStoryId);
        const totalDelay = sequence.reduce((sum, r) => sum + r.delayMs, 0);

        // Each sequence should have non-trivial total timing
        expect(totalDelay).toBeGreaterThan(100);

        // Each line should have a non-zero delay
        for (const response of sequence) {
          expect(response.delayMs).toBeGreaterThan(0);
        }
      }
    });

    it('should reference plausible file paths for the tech stack', () => {
      const devSequence = provider.getResponseSequence('dev', testStoryId);
      const fileEvents = devSequence.filter((r) => r.fileEvent);

      for (const event of fileEvents) {
        const path = event.fileEvent!.path;
        // Should be TypeScript files (for NestJS tech stack)
        expect(path).toMatch(/\.(ts|json|yaml|yml|md)$/);
      }
    });

    it('should include valid-format commit hashes (40 hex chars)', () => {
      const agentTypes = ['planner', 'dev', 'devops'];

      for (const agentType of agentTypes) {
        const sequence = provider.getResponseSequence(agentType, testStoryId);
        const commitEvents = sequence.filter((r) => r.commitEvent);

        for (const event of commitEvents) {
          expect(event.commitEvent!.hash).toMatch(/^[0-9a-f]{40}$/);
        }
      }
    });
  });

  describe('getQARejectionSequence', () => {
    it('should return a QA output with FAIL verdict', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      expect(sequence.length).toBeGreaterThanOrEqual(15);
      const hasFailVerdict = sequence.some((r) =>
        r.content.includes('FAIL'),
      );
      expect(hasFailVerdict).toBe(true);
    });

    it('should include failed test details', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);
      const testEvents = sequence.filter((r) => r.testEvent);

      expect(testEvents.length).toBeGreaterThanOrEqual(1);
      expect(testEvents[0].testEvent!.failed).toBeGreaterThan(0);
    });

    it('should include lint errors', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);
      const hasLintErrors = sequence.some(
        (r) =>
          r.content.includes('Lint') && r.content.includes('error'),
      );
      expect(hasLintErrors).toBe(true);
    });
  });

  describe('getFailureSequence', () => {
    it('should return crash sequence with error output', () => {
      const sequence = provider.getFailureSequence('crash');

      expect(sequence.length).toBeGreaterThan(0);
      const hasError = sequence.some((r) => r.stream === 'stderr');
      expect(hasError).toBe(true);
      const hasExitCode = sequence.some((r) =>
        r.content.includes('exited with code'),
      );
      expect(hasExitCode).toBe(true);
    });

    it('should return stuck sequence that stops producing output', () => {
      const sequence = provider.getFailureSequence('stuck');

      expect(sequence.length).toBeGreaterThan(0);
      expect(sequence.length).toBeLessThan(10); // Deliberately short
    });

    it('should return timeout sequence with long delay', () => {
      const sequence = provider.getFailureSequence('timeout');
      const maxDelay = Math.max(...sequence.map((r) => r.delayMs));

      expect(maxDelay).toBeGreaterThan(10000);
    });

    it('should return API error sequence with repeated 429s', () => {
      const sequence = provider.getFailureSequence('api_error');
      const errorLines = sequence.filter(
        (r) => r.content.includes('429') || r.content.includes('Rate limit'),
      );

      expect(errorLines.length).toBeGreaterThanOrEqual(3);
    });
  });
});
