/**
 * State Transition Assertion Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 */

import { PipelineState } from '../../interfaces/pipeline.interfaces';
import {
  StateTransitionRecord,
  EmittedEventRecord,
  EXPECTED_TRANSITION_SEQUENCE,
} from '../e2e-pipeline.interfaces';
import {
  assertTransitionSequence,
  assertTransitionTimestamps,
  assertTransitionEvents,
} from './state-transition-assertions';

describe('State Transition Assertions', () => {
  const now = Date.now();

  function makeTransitions(
    overrides: Partial<StateTransitionRecord>[] = [],
  ): StateTransitionRecord[] {
    const base: StateTransitionRecord[] = [
      { from: PipelineState.IDLE, to: PipelineState.PLANNING, triggeredBy: 'pipeline:start', timestamp: new Date(now) },
      { from: PipelineState.PLANNING, to: PipelineState.IMPLEMENTING, triggeredBy: 'handoff:planner->dev', timestamp: new Date(now + 100) },
      { from: PipelineState.IMPLEMENTING, to: PipelineState.QA, triggeredBy: 'handoff:dev->qa', timestamp: new Date(now + 200) },
      { from: PipelineState.QA, to: PipelineState.DEPLOYING, triggeredBy: 'handoff:qa->devops', timestamp: new Date(now + 300) },
      { from: PipelineState.DEPLOYING, to: PipelineState.COMPLETE, triggeredBy: 'handoff:devops->complete', timestamp: new Date(now + 400) },
    ];

    overrides.forEach((o, i) => {
      if (i < base.length) {
        base[i] = { ...base[i], ...o };
      }
    });

    return base;
  }

  function makeEvents(transitions: StateTransitionRecord[]): EmittedEventRecord[] {
    return transitions.map((t) => ({
      type: 'pipeline:state_changed',
      timestamp: t.timestamp,
      payload: {
        previousState: t.from,
        newState: t.to,
        triggeredBy: t.triggeredBy,
      },
    }));
  }

  describe('assertTransitionSequence', () => {
    it('should validate correct 5-step transition sequence passes', () => {
      const transitions = makeTransitions();

      expect(() =>
        assertTransitionSequence(transitions),
      ).not.toThrow();
    });

    it('should fail with descriptive message for missing transition', () => {
      // Only 3 of 5 transitions
      const transitions = makeTransitions().slice(0, 3);

      expect(() =>
        assertTransitionSequence(transitions),
      ).toThrow(/Missing 2 transition/);
    });

    it('should fail with descriptive message for out-of-order transitions', () => {
      const transitions = makeTransitions();
      // Swap transitions 1 and 2
      const temp = transitions[1];
      transitions[1] = transitions[2];
      transitions[2] = temp;

      expect(() =>
        assertTransitionSequence(transitions),
      ).toThrow(/Transition 1/);
    });

    it('should flag extra unexpected transitions as warnings', () => {
      const transitions = makeTransitions();
      transitions.push({
        from: PipelineState.COMPLETE,
        to: PipelineState.IDLE,
        triggeredBy: 'manual',
        timestamp: new Date(now + 500),
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      assertTransitionSequence(transitions);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 extra transition'),
      );

      warnSpy.mockRestore();
    });

    it('should validate each transition has correct triggeredBy string', () => {
      const transitions = makeTransitions([
        {}, // first is fine
        { triggeredBy: 'wrong-trigger' },
      ]);

      expect(() =>
        assertTransitionSequence(transitions),
      ).toThrow(/triggeredBy/);
    });
  });

  describe('assertTransitionTimestamps', () => {
    it('should pass for monotonically increasing timestamps', () => {
      const transitions = makeTransitions();

      expect(() =>
        assertTransitionTimestamps(transitions),
      ).not.toThrow();
    });

    it('should fail for out-of-order timestamps', () => {
      const transitions = makeTransitions();
      // Make second timestamp before first
      transitions[1] = {
        ...transitions[1],
        timestamp: new Date(now - 100),
      };

      expect(() =>
        assertTransitionTimestamps(transitions),
      ).toThrow(/before transition 0/);
    });

    it('should pass for equal timestamps (non-strict monotonic)', () => {
      const transitions = makeTransitions();
      transitions[1] = {
        ...transitions[1],
        timestamp: new Date(now),
      };

      expect(() =>
        assertTransitionTimestamps(transitions),
      ).not.toThrow();
    });
  });

  describe('assertTransitionEvents', () => {
    it('should pass when all transitions have corresponding events', () => {
      const transitions = makeTransitions();
      const events = makeEvents(transitions);

      expect(() =>
        assertTransitionEvents(transitions, events),
      ).not.toThrow();
    });

    it('should fail when a transition has no corresponding event', () => {
      const transitions = makeTransitions();
      const events = makeEvents(transitions).slice(0, 3); // Missing last 2

      expect(() =>
        assertTransitionEvents(transitions, events),
      ).toThrow(/no corresponding pipeline:state_changed event/);
    });
  });
});
