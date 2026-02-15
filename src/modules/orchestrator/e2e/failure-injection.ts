/**
 * Failure Injection Utilities
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Functions for injecting failures into the E2E pipeline test
 * to exercise failure detection and recovery paths.
 */

import { PipelineE2ETestHarness } from './pipeline-e2e-test-harness';
import { MockCLIResponseProvider, MockCLIResponse } from './mock-cli-response-provider';

/**
 * Configures mock CLI to exit with code 1 at specified phase.
 * Simulates a CLI crash during agent execution.
 */
export function injectCLICrash(
  provider: MockCLIResponseProvider,
  atPhase: string,
  storyId: string,
): void {
  const crashSequence = provider.getFailureSequence('crash');
  provider.registerCustomSequence(
    `${atPhase}:${storyId}`,
    crashSequence,
    {
      sessionId: `crash-session-${atPhase}`,
      exitCode: 1,
      branch: null,
      commitHash: null,
      outputLineCount: crashSequence.length,
      durationMs: 200,
      error: 'CLI process crashed with exit code 1',
    },
  );
}

/**
 * Configures mock CLI to crash N times before succeeding.
 * Used for testing retry and escalation paths.
 */
export function injectRepeatedCrashes(
  provider: MockCLIResponseProvider,
  atPhase: string,
  storyId: string,
  count: number,
): { crashSequences: MockCLIResponse[][]; successSequence: MockCLIResponse[] } {
  // Save the success sequence BEFORE registering crashes (uses default)
  const successSequence = provider.getResponseSequence(atPhase, storyId);

  const crashSequences: MockCLIResponse[][] = [];

  for (let i = 0; i < count; i++) {
    const crashSequence = provider.getFailureSequence('crash');
    crashSequences.push(crashSequence);
  }

  // Register the first crash sequence so the provider returns it on next call
  if (crashSequences.length > 0) {
    provider.registerCustomSequence(
      `${atPhase}:${storyId}`,
      crashSequences[0],
      {
        sessionId: `crash-session-${atPhase}-0`,
        exitCode: 1,
        branch: null,
        commitHash: null,
        outputLineCount: crashSequences[0].length,
        durationMs: 200,
        error: `CLI process crashed with exit code 1 (attempt 1 of ${count})`,
      },
    );
  }

  return { crashSequences, successSequence };
}

/**
 * Configures mock CLI to stop producing output (stuck agent).
 */
export function injectStuckAgent(
  provider: MockCLIResponseProvider,
  atPhase: string,
  storyId: string,
): void {
  const stuckSequence = provider.getFailureSequence('stuck');
  provider.registerCustomSequence(
    `${atPhase}:${storyId}`,
    stuckSequence,
    {
      sessionId: `stuck-session-${atPhase}`,
      exitCode: null,
      branch: null,
      commitHash: null,
      outputLineCount: stuckSequence.length,
      durationMs: 0,
      error: 'Agent stuck - no output for extended period',
    },
  );
}

/**
 * Configures mock CLI to simulate 429 rate limit responses.
 */
export function injectAPIRateLimit(
  provider: MockCLIResponseProvider,
  atPhase: string,
  storyId: string,
): void {
  const apiErrorSequence = provider.getFailureSequence('api_error');
  provider.registerCustomSequence(
    `${atPhase}:${storyId}`,
    apiErrorSequence,
    {
      sessionId: `rate-limit-session-${atPhase}`,
      exitCode: 1,
      branch: null,
      commitHash: null,
      outputLineCount: apiErrorSequence.length,
      durationMs: 100,
      error: 'API rate limit exceeded (429)',
    },
  );
}

/**
 * Configures mock CLI to simulate infinite loop (modifying same file repeatedly).
 */
export function injectInfiniteLoop(
  provider: MockCLIResponseProvider,
  atPhase: string,
  storyId: string,
): void {
  const loopSequence: MockCLIResponse[] = [];
  for (let i = 0; i < 25; i++) {
    loopSequence.push({
      delayMs: 10,
      content: `[${atPhase}] Modifying src/services/auth.service.ts (attempt ${i + 1})`,
      stream: 'stdout',
      fileEvent: {
        path: 'src/services/auth.service.ts',
        action: 'modify',
      },
    });
  }

  provider.registerCustomSequence(
    `${atPhase}:${storyId}`,
    loopSequence,
    {
      sessionId: `loop-session-${atPhase}`,
      exitCode: null,
      branch: null,
      commitHash: null,
      outputLineCount: loopSequence.length,
      durationMs: 300,
      error: 'Infinite loop detected - same file modified 25 times',
    },
  );
}
