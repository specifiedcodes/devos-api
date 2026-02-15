/**
 * State Transition Assertion Utilities
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Functions for validating state machine transition sequences,
 * timestamps, and corresponding events during E2E tests.
 */

import { PipelineState } from '../../interfaces/pipeline.interfaces';
import {
  StateTransitionRecord,
  EmittedEventRecord,
  EXPECTED_TRANSITION_SEQUENCE,
} from '../e2e-pipeline.interfaces';

/**
 * Validates that actual transitions match the expected sequence.
 * Checks order, from/to states, and triggeredBy strings.
 *
 * @throws Error with descriptive message if validation fails
 */
export function assertTransitionSequence(
  actual: StateTransitionRecord[],
  expected: typeof EXPECTED_TRANSITION_SEQUENCE = EXPECTED_TRANSITION_SEQUENCE,
): void {
  if (actual.length < expected.length) {
    const missing = expected.slice(actual.length);
    const missingDesc = missing
      .map((t) => `${t.from} -> ${t.to}`)
      .join(', ');
    throw new Error(
      `Missing ${expected.length - actual.length} transition(s). ` +
        `Expected ${expected.length} transitions, got ${actual.length}. ` +
        `Missing: [${missingDesc}]`,
    );
  }

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];

    if (act.from !== exp.from || act.to !== exp.to) {
      throw new Error(
        `Transition ${i}: Expected ${exp.from} -> ${exp.to}, ` +
          `got ${act.from} -> ${act.to}`,
      );
    }

    if (
      exp.triggeredBy &&
      act.triggeredBy &&
      act.triggeredBy !== exp.triggeredBy
    ) {
      throw new Error(
        `Transition ${i} (${act.from} -> ${act.to}): ` +
          `Expected triggeredBy '${exp.triggeredBy}', ` +
          `got '${act.triggeredBy}'`,
      );
    }
  }

  // Check for extra unexpected transitions
  if (actual.length > expected.length) {
    const extra = actual.slice(expected.length);
    const extraDesc = extra
      .map((t) => `${t.from} -> ${t.to}`)
      .join(', ');
    // Extra transitions are warnings, not errors
    console.warn(
      `Warning: ${actual.length - expected.length} extra transition(s) found: [${extraDesc}]`,
    );
  }
}

/**
 * Validates that transition timestamps are monotonically increasing.
 *
 * @throws Error if timestamps are out of order
 */
export function assertTransitionTimestamps(
  transitions: StateTransitionRecord[],
): void {
  for (let i = 1; i < transitions.length; i++) {
    const prev = transitions[i - 1].timestamp.getTime();
    const curr = transitions[i].timestamp.getTime();

    if (curr < prev) {
      throw new Error(
        `Transition ${i} timestamp (${transitions[i].timestamp.toISOString()}) ` +
          `is before transition ${i - 1} timestamp (${transitions[i - 1].timestamp.toISOString()})`,
      );
    }
  }
}

/**
 * Validates that each state transition has a corresponding event.
 *
 * @throws Error if a transition is missing its event
 */
export function assertTransitionEvents(
  transitions: StateTransitionRecord[],
  events: EmittedEventRecord[],
): void {
  // NestJS EventEmitter2 uses dots for event names; accept both formats
  const stateChangedEvents = events.filter(
    (e) =>
      e.type === 'pipeline:state_changed' ||
      e.type === 'pipeline.state_changed',
  );

  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i];
    const matchingEvent = stateChangedEvents.find(
      (e) =>
        e.payload.previousState === transition.from &&
        e.payload.newState === transition.to,
    );

    if (!matchingEvent) {
      throw new Error(
        `Transition ${i} (${transition.from} -> ${transition.to}) ` +
          `has no corresponding pipeline:state_changed event`,
      );
    }
  }
}
