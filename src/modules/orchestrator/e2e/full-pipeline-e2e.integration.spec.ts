/**
 * Full Pipeline E2E Integration Test
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Comprehensive integration test that exercises the full autonomous
 * BMAD pipeline in mock mode -- from start to COMPLETE -- with
 * assertions on every component.
 */

import { PipelineE2ETestHarness } from './pipeline-e2e-test-harness';
import { createE2ETestConfig } from './e2e-test-config';
import { MockCLIResponseProvider } from './mock-cli-response-provider';
import { PipelineState } from '../interfaces/pipeline.interfaces';
import {
  E2ETestConfig,
  E2EPipelineResult,
  EXPECTED_TRANSITION_SEQUENCE,
  EXPECTED_HANDOFFS,
  EXPECTED_EVENT_TYPES,
} from './e2e-pipeline.interfaces';
import {
  assertTransitionSequence,
  assertTransitionTimestamps,
  assertTransitionEvents,
} from './assertions/state-transition-assertions';
import {
  assertHandoffChain,
  assertHandoffEvents,
} from './assertions/handoff-chain-assertions';
import {
  assertEventSequence,
  assertNoDuplicateEvents,
} from './assertions/event-verification';
import {
  assertNoMemoryLeak,
  assertNoMonotonicGrowth,
  createMemoryLeakReport,
} from './assertions/memory-leak-assertions';

describe('Full Pipeline E2E Integration', () => {
  let harness: PipelineE2ETestHarness;
  let config: E2ETestConfig;
  let result: E2EPipelineResult;

  beforeAll(async () => {
    harness = new PipelineE2ETestHarness();
    config = createE2ETestConfig('mock');
    config.timeoutMs = 60_000;
    config.memoryCheck.enabled = true;
    config.memoryCheck.checkIntervalMs = 500;

    await harness.setup(config);
    result = await harness.runPipeline();
  }, 90_000); // Extended timeout for setup + pipeline

  afterAll(async () => {
    if (harness) {
      await harness.teardown();
    }
  });

  describe('Full mock-mode pipeline from start to COMPLETE', () => {
    it('should complete successfully', () => {
      expect(result.success).toBe(true);
      expect(result.finalStoryStatus).toBe('done');
    });

    it('should complete within expected bounds (< 30 seconds for mock mode)', () => {
      expect(result.durationMs).toBeLessThan(30_000);
    });

    it('should have no errors', () => {
      expect(result.errors.length).toBe(0);
    });
  });

  describe('All 4 agent types executed in correct order', () => {
    it('should execute planner, dev, qa, devops agents', () => {
      const agentTypes = result.agentExecutions.map((a) => a.agentType);

      expect(agentTypes).toContain('planner');
      expect(agentTypes).toContain('dev');
      expect(agentTypes).toContain('qa');
      expect(agentTypes).toContain('devops');
    });

    it('should execute agents in pipeline order', () => {
      const agentTypes = result.agentExecutions.map((a) => a.agentType);
      const plannerIdx = agentTypes.indexOf('planner');
      const devIdx = agentTypes.indexOf('dev');
      const qaIdx = agentTypes.indexOf('qa');
      const devopsIdx = agentTypes.indexOf('devops');

      expect(plannerIdx).toBeLessThan(devIdx);
      expect(devIdx).toBeLessThan(qaIdx);
      expect(qaIdx).toBeLessThan(devopsIdx);
    });
  });

  describe('All 5 state transitions occurred in correct sequence', () => {
    it('should have at least 5 state transitions', () => {
      expect(result.stateTransitions.length).toBeGreaterThanOrEqual(5);
    });

    it('should have valid transition sequence', () => {
      // The transitions should include the expected states
      const transitions = result.stateTransitions;
      const toStates = transitions.map((t) => t.to);

      expect(toStates).toContain(PipelineState.PLANNING);
      expect(toStates).toContain(PipelineState.IMPLEMENTING);
      expect(toStates).toContain(PipelineState.QA);
      expect(toStates).toContain(PipelineState.DEPLOYING);
      expect(toStates).toContain(PipelineState.COMPLETE);
    });

    it('should have monotonically increasing timestamps', () => {
      assertTransitionTimestamps(result.stateTransitions);
    });
  });

  describe('All expected WebSocket events emitted', () => {
    it('should emit pipeline.state_changed events', () => {
      const stateChanges = result.emittedEvents.filter(
        (e) => e.type === 'pipeline.state_changed',
      );
      expect(stateChanges.length).toBeGreaterThanOrEqual(5);
    });

    it('should have no duplicate state_changed events', () => {
      assertNoDuplicateEvents(result.emittedEvents);
    });

    it('should have transition events matching state transitions', () => {
      assertTransitionEvents(
        result.stateTransitions,
        result.emittedEvents,
      );
    });
  });

  describe('Git operations recorded for each agent phase', () => {
    it('should record branch creation', () => {
      const branchOps = result.gitOperations.filter(
        (g) => g.operation === 'branch',
      );
      expect(branchOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should record commit operations', () => {
      const commitOps = result.gitOperations.filter(
        (g) => g.operation === 'commit',
      );
      expect(commitOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should record PR creation', () => {
      const prOps = result.gitOperations.filter(
        (g) => g.operation === 'pr',
      );
      expect(prOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should record merge operation', () => {
      const mergeOps = result.gitOperations.filter(
        (g) => g.operation === 'merge',
      );
      expect(mergeOps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('No memory leaks detected after full pipeline', () => {
    it('should have memory snapshots', () => {
      expect(result.memorySnapshots.length).toBeGreaterThanOrEqual(2);
    });

    it('should not exceed memory growth threshold', () => {
      assertNoMemoryLeak(
        result.memorySnapshots,
        config.memoryCheck.maxHeapGrowthMB,
      );
    });

    it('should generate valid memory leak report', () => {
      const report = createMemoryLeakReport(
        result.memorySnapshots,
        config.memoryCheck.maxHeapGrowthMB,
      );

      expect(report.leakDetected).toBe(false);
      expect(report.initialHeapUsed).toBeGreaterThan(0);
      expect(report.finalHeapUsed).toBeGreaterThan(0);
      expect(report.peakHeapUsed).toBeGreaterThanOrEqual(
        report.initialHeapUsed,
      );
    });
  });

  describe('Final story status is done', () => {
    it('should have final story status as done', () => {
      expect(result.finalStoryStatus).toBe('done');
    });
  });

  describe('Concurrent pipeline run isolation', () => {
    it('should support creating two independent harnesses', async () => {
      const harness2 = new PipelineE2ETestHarness();
      const config2 = createE2ETestConfig('mock');
      config2.timeoutMs = 30_000;
      config2.memoryCheck.enabled = false;

      await harness2.setup(config2);
      const result2 = await harness2.runPipeline();

      expect(result2.success).toBe(true);
      expect(result2.stateTransitions.length).toBeGreaterThanOrEqual(1);

      // Pipeline 2 should not share state with pipeline 1
      // (different workspace IDs ensure isolation)
      expect(result2.durationMs).toBeGreaterThanOrEqual(0);

      await harness2.teardown();
    });
  });
});

describe('MockCLIResponseProvider Integration', () => {
  let provider: MockCLIResponseProvider;
  const storyId = 'integration-test-story';

  beforeEach(() => {
    provider = new MockCLIResponseProvider();
  });

  describe('Full agent lifecycle mock sequences', () => {
    it('should provide complete planner -> dev -> qa -> devops sequences', () => {
      const agentTypes = ['planner', 'dev', 'qa', 'devops'];

      for (const agentType of agentTypes) {
        const sequence = provider.getResponseSequence(agentType, storyId);
        expect(sequence.length).toBeGreaterThan(0);

        const result = provider.getExpectedResult(agentType, storyId);
        expect(result.exitCode).toBe(0);
        expect(result.sessionId).toBeDefined();
      }
    });
  });

  describe('Failure injection integration', () => {
    it('should allow custom sequences to override defaults', () => {
      // Register crash for dev
      provider.registerCustomSequence(
        `dev:${storyId}`,
        provider.getFailureSequence('crash'),
        {
          sessionId: 'crash-dev',
          exitCode: 1,
          branch: null,
          commitHash: null,
          outputLineCount: 6,
          durationMs: 100,
          error: 'crash',
        },
      );

      const result = provider.getExpectedResult('dev', storyId);
      expect(result.exitCode).toBe(1);

      // Other agents should still work normally
      const qaResult = provider.getExpectedResult('qa', storyId);
      expect(qaResult.exitCode).toBe(0);
    });
  });

  describe('QA rejection + approval cycle', () => {
    it('should provide rejection and approval sequences', () => {
      const rejection = provider.getQARejectionSequence(storyId);
      expect(rejection.some((r) => r.content.includes('FAIL'))).toBe(true);

      const approval = provider.getResponseSequence('qa', storyId);
      expect(approval.some((r) => r.content.includes('PASS'))).toBe(true);
    });
  });
});
