/**
 * Event Verification Utilities
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Functions for verifying WebSocket event sequences, payloads,
 * consistency, and completeness during E2E pipeline tests.
 */

import {
  EmittedEventRecord,
  EXPECTED_EVENT_TYPES,
} from '../e2e-pipeline.interfaces';

/**
 * Validates that all expected event types are present in the correct order.
 * Uses a sliding window approach -- each expected type must appear
 * after the previous expected type was found.
 *
 * @throws Error with descriptive message if validation fails
 */
export function assertEventSequence(
  actual: EmittedEventRecord[],
  expectedTypes: string[] = EXPECTED_EVENT_TYPES,
): void {
  let searchFrom = 0;
  const missingTypes: string[] = [];

  for (let i = 0; i < expectedTypes.length; i++) {
    const expectedType = expectedTypes[i];
    let found = false;

    for (let j = searchFrom; j < actual.length; j++) {
      if (actual[j].type === expectedType) {
        searchFrom = j + 1;
        found = true;
        break;
      }
    }

    if (!found) {
      missingTypes.push(`[${i}] ${expectedType}`);
    }
  }

  if (missingTypes.length > 0) {
    const actualTypes = actual.map((e) => e.type).join(', ');
    throw new Error(
      `Missing expected event type(s) in sequence: ${missingTypes.join(', ')}. ` +
        `Actual events (${actual.length}): [${actualTypes}]`,
    );
  }
}

/**
 * Validates that event payloads contain consistent workspaceId and projectId.
 *
 * @throws Error if IDs are inconsistent across events
 */
export function assertEventPayloads(
  events: EmittedEventRecord[],
  workspaceId: string,
  projectId: string,
): void {
  const eventsWithWorkspace = events.filter(
    (e) => e.payload && e.payload.workspaceId,
  );

  for (let i = 0; i < eventsWithWorkspace.length; i++) {
    const event = eventsWithWorkspace[i];
    if (event.payload.workspaceId !== workspaceId) {
      throw new Error(
        `Event ${i} (${event.type}): Expected workspaceId '${workspaceId}', ` +
          `got '${event.payload.workspaceId}'`,
      );
    }
    if (event.payload.projectId && event.payload.projectId !== projectId) {
      throw new Error(
        `Event ${i} (${event.type}): Expected projectId '${projectId}', ` +
          `got '${event.payload.projectId}'`,
      );
    }
  }
}

/**
 * Validates that no duplicate events exist for the same state transition.
 * Specifically checks pipeline:state_changed events for duplicates.
 *
 * @throws Error if duplicate events found
 */
export function assertNoDuplicateEvents(
  events: EmittedEventRecord[],
): void {
  // Accept both colon and dot event name formats
  const stateChangeEvents = events.filter(
    (e) =>
      e.type === 'pipeline:state_changed' ||
      e.type === 'pipeline.state_changed',
  );

  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const event of stateChangeEvents) {
    const key = `${event.payload.previousState}->${event.payload.newState}`;
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate pipeline:state_changed events found for transitions: ` +
        `[${duplicates.join(', ')}]`,
    );
  }
}
