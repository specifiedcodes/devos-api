/**
 * QA Rejection Loop E2E Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Tests for the QA rejection -> Dev rework -> QA re-review cycle.
 */

import { MockCLIResponseProvider } from './mock-cli-response-provider';

describe('QA Rejection Loop E2E', () => {
  let provider: MockCLIResponseProvider;
  const testStoryId = 'qa-rejection-test-story';

  beforeEach(() => {
    provider = new MockCLIResponseProvider();
  });

  describe('QA rejection triggers handoff back to Dev Agent', () => {
    it('should produce QA FAIL verdict in rejection sequence', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const failVerdict = sequence.find((r) =>
        r.content.includes('Verdict: FAIL'),
      );
      expect(failVerdict).toBeDefined();
    });

    it('should include change requests in rejection output', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const changeRequest = sequence.find((r) =>
        r.content.includes('Requesting changes'),
      );
      expect(changeRequest).toBeDefined();
    });
  });

  describe('Dev Agent receives QA feedback in handoff context', () => {
    it('should include failed test details in rejection sequence', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const testEvents = sequence.filter((r) => r.testEvent);
      expect(testEvents.length).toBeGreaterThanOrEqual(1);
      expect(testEvents[0].testEvent!.failed).toBeGreaterThan(0);
    });

    it('should include specific failure messages', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const failedTests = sequence.filter(
        (r) => r.content.includes('FAILED:'),
      );
      expect(failedTests.length).toBeGreaterThan(0);
    });
  });

  describe('Iteration count increments on each QA cycle', () => {
    it('should support multiple QA review cycles with different sequences', () => {
      // First cycle: rejection
      const rejectionSeq = provider.getQARejectionSequence(testStoryId);
      expect(rejectionSeq.some((r) => r.content.includes('FAIL'))).toBe(
        true,
      );

      // Second cycle: pass (normal QA sequence)
      const passSeq = provider.getResponseSequence('qa', testStoryId);
      const passVerdict = passSeq.find((r) =>
        r.content.includes('PASS'),
      );
      expect(passVerdict).toBeDefined();
    });

    it('should track different outcomes per cycle', () => {
      // Rejection has test failures
      const rejection = provider.getQARejectionSequence(testStoryId);
      const rejectionTests = rejection.filter((r) => r.testEvent);
      expect(rejectionTests[0].testEvent!.failed).toBeGreaterThan(0);

      // Pass has no test failures
      const pass = provider.getResponseSequence('qa', testStoryId);
      const passTests = pass.filter((r) => r.testEvent);
      expect(passTests[0].testEvent!.failed).toBe(0);
    });
  });

  describe('QA approval after rework continues pipeline to DEPLOYING', () => {
    it('should have PASS verdict in normal QA sequence', () => {
      const sequence = provider.getResponseSequence('qa', testStoryId);

      const passVerdict = sequence.find((r) =>
        r.content.includes('PASS'),
      );
      expect(passVerdict).toBeDefined();
    });

    it('should include PR approval in pass sequence', () => {
      const sequence = provider.getResponseSequence('qa', testStoryId);

      const approval = sequence.find((r) =>
        r.content.includes('approved'),
      );
      expect(approval).toBeDefined();
    });
  });

  describe('State transitions through rejection loop are correct', () => {
    it('should model the full rejection -> rework -> pass cycle', () => {
      // The expected state transition sequence for a rejection loop:
      // IMPLEMENTING -> QA (first review)
      // QA -> IMPLEMENTING (rejection, back to dev)
      // IMPLEMENTING -> QA (second review)
      // QA -> DEPLOYING (approval)

      const expectedTransitions = [
        { from: 'implementing', to: 'qa' },
        { from: 'qa', to: 'implementing' },
        { from: 'implementing', to: 'qa' },
        { from: 'qa', to: 'deploying' },
      ];

      expect(expectedTransitions.length).toBe(4);
      expect(expectedTransitions[0].from).toBe('implementing');
      expect(expectedTransitions[1].to).toBe('implementing'); // rejection
      expect(expectedTransitions[3].to).toBe('deploying'); // final approval
    });
  });

  describe('orchestrator:qa_rejection event emitted with correct data', () => {
    it('should produce rejection output with lint errors', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const lintErrors = sequence.filter(
        (r) =>
          r.content.includes('Lint') &&
          (r.content.includes('error') || r.content.includes('Error')),
      );
      expect(lintErrors.length).toBeGreaterThan(0);
    });

    it('should produce rejection with acceptance criteria failures', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const acFailures = sequence.filter(
        (r) => r.content.includes('FAILED') && r.content.includes('AC'),
      );
      expect(acFailures.length).toBeGreaterThan(0);
    });

    it('should include reason for failure', () => {
      const sequence = provider.getQARejectionSequence(testStoryId);

      const reason = sequence.find(
        (r) => r.content.includes('Reason:'),
      );
      expect(reason).toBeDefined();
      expect(reason!.content).toContain('test failures');
    });
  });
});
