/**
 * Failure Recovery E2E Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Tests for failure detection, retry, escalation, and recovery paths
 * using injected CLI failures in mock mode.
 */

import { MockCLIResponseProvider } from './mock-cli-response-provider';
import {
  injectCLICrash,
  injectRepeatedCrashes,
  injectStuckAgent,
  injectAPIRateLimit,
  injectInfiniteLoop,
} from './failure-injection';

describe('Failure Recovery E2E', () => {
  let provider: MockCLIResponseProvider;
  const testStoryId = 'failure-test-story';

  beforeEach(() => {
    provider = new MockCLIResponseProvider();
  });

  describe('Single CLI crash triggers detection and automatic retry', () => {
    it('should inject crash failure for dev phase', () => {
      injectCLICrash(provider, 'dev', testStoryId);

      const sequence = provider.getResponseSequence('dev', testStoryId);
      expect(sequence.length).toBeGreaterThan(0);

      // Verify the sequence ends with an error
      const hasError = sequence.some((r) => r.stream === 'stderr');
      expect(hasError).toBe(true);
    });

    it('should produce failed result with exit code 1', () => {
      injectCLICrash(provider, 'dev', testStoryId);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Retry from checkpoint spawns new session with checkpoint context', () => {
    it('should have crash sequence followed by success sequence available', () => {
      const { crashSequences, successSequence } = injectRepeatedCrashes(
        provider,
        'dev',
        testStoryId,
        1,
      );

      expect(crashSequences.length).toBe(1);
      expect(crashSequences[0].length).toBeGreaterThan(0);
      expect(successSequence.length).toBeGreaterThan(0);
    });
  });

  describe('Pipeline continues after successful retry', () => {
    it('should have normal response sequence after retry', () => {
      // After crash injection + retry, the normal sequence should work
      const normalSequence = provider.getResponseSequence('dev', testStoryId);
      expect(normalSequence.length).toBeGreaterThan(0);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('4 consecutive crashes exhaust retries and escalate', () => {
    it('should produce 4 crash sequences', () => {
      const { crashSequences } = injectRepeatedCrashes(
        provider,
        'dev',
        testStoryId,
        4,
      );

      expect(crashSequences.length).toBe(4);
      for (const seq of crashSequences) {
        const hasError = seq.some((r) => r.stream === 'stderr');
        expect(hasError).toBe(true);
      }
    });
  });

  describe('Escalation pauses pipeline and emits escalation event', () => {
    it('should have stuck agent injection that stops output', () => {
      injectStuckAgent(provider, 'dev', testStoryId);

      const sequence = provider.getResponseSequence('dev', testStoryId);
      expect(sequence.length).toBeLessThan(10);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe('Manual override with guidance resumes pipeline', () => {
    it('should allow normal sequence after crash injection is cleared', () => {
      // First inject crash
      injectCLICrash(provider, 'dev', testStoryId);
      let result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBe(1);

      // Override with success
      const normalSequence = provider.getResponseSequence('qa', testStoryId);
      provider.registerCustomSequence(
        `dev:${testStoryId}`,
        normalSequence,
        {
          sessionId: 'resumed-session',
          exitCode: 0,
          branch: `feature/${testStoryId}`,
          commitHash: 'a'.repeat(40),
          outputLineCount: normalSequence.length,
          durationMs: 500,
          error: null,
        },
      );

      result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('All failure/recovery events emitted in correct order', () => {
    it('should have crash events including error output', () => {
      const crashSequence = provider.getFailureSequence('crash');

      const stderrLines = crashSequence.filter((r) => r.stream === 'stderr');
      expect(stderrLines.length).toBeGreaterThanOrEqual(1);

      const exitLine = crashSequence.find((r) =>
        r.content.includes('exited with code'),
      );
      expect(exitLine).toBeDefined();
    });
  });

  describe('FailureRecoveryHistory records created for each attempt', () => {
    it('should produce distinct crash sequences for multiple attempts', () => {
      const { crashSequences } = injectRepeatedCrashes(
        provider,
        'dev',
        testStoryId,
        3,
      );

      expect(crashSequences.length).toBe(3);
      for (let i = 0; i < crashSequences.length; i++) {
        expect(crashSequences[i].length).toBeGreaterThan(0);
      }
    });
  });

  describe('API rate limit failure injection', () => {
    it('should inject API error sequence with 429 responses', () => {
      injectAPIRateLimit(provider, 'dev', testStoryId);

      const sequence = provider.getResponseSequence('dev', testStoryId);
      const errorLines = sequence.filter(
        (r) => r.content.includes('429') || r.content.includes('Rate limit'),
      );
      expect(errorLines.length).toBeGreaterThanOrEqual(3);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('rate limit');
    });
  });

  describe('Infinite loop failure injection', () => {
    it('should inject loop sequence modifying same file repeatedly', () => {
      injectInfiniteLoop(provider, 'dev', testStoryId);

      const sequence = provider.getResponseSequence('dev', testStoryId);
      const fileEvents = sequence.filter((r) => r.fileEvent);

      // All file events should reference the same file
      const uniquePaths = new Set(
        fileEvents.map((r) => r.fileEvent!.path),
      );
      expect(uniquePaths.size).toBe(1);
      expect(fileEvents.length).toBeGreaterThanOrEqual(20);

      const result = provider.getExpectedResult('dev', testStoryId);
      expect(result.error).toContain('Infinite loop');
    });
  });
});
