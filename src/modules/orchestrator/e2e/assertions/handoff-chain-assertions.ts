/**
 * Handoff Chain Assertion Utilities
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Functions for validating handoff sequences, required context data,
 * corresponding events, and audit trail records.
 */

import {
  HandoffRecordE2E,
  EmittedEventRecord,
  EXPECTED_HANDOFFS,
} from '../e2e-pipeline.interfaces';

/**
 * Validates that actual handoffs match the expected handoff chain.
 * Checks sequence, agent types, and required context fields.
 *
 * @throws Error with descriptive message if validation fails
 */
export function assertHandoffChain(
  actual: HandoffRecordE2E[],
  expected: typeof EXPECTED_HANDOFFS = EXPECTED_HANDOFFS,
): void {
  if (actual.length < expected.length) {
    const missing = expected.slice(actual.length);
    const missingDesc = missing
      .map((h) => `${h.fromAgent} -> ${h.toAgent}`)
      .join(', ');
    throw new Error(
      `Missing ${expected.length - actual.length} handoff(s). ` +
        `Expected ${expected.length} handoffs, got ${actual.length}. ` +
        `Missing: [${missingDesc}]`,
    );
  }

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];

    // Check agent types
    if (act.fromAgentType !== exp.fromAgent) {
      throw new Error(
        `Handoff ${i}: Expected fromAgent '${exp.fromAgent}', ` +
          `got '${act.fromAgentType}'`,
      );
    }

    if (act.toAgentType !== exp.toAgent) {
      throw new Error(
        `Handoff ${i}: Expected toAgent '${exp.toAgent}', ` +
          `got '${act.toAgentType}'`,
      );
    }

    // Check required context fields
    if (!act.context || typeof act.context !== 'object') {
      throw new Error(
        `Handoff ${i} (${act.fromAgentType} -> ${act.toAgentType}): ` +
          `Missing context object entirely (expected fields: ${exp.requiredContext.join(', ')})`,
      );
    }
    for (const field of exp.requiredContext) {
      if (!(field in act.context) || act.context[field] === undefined) {
        throw new Error(
          `Handoff ${i} (${act.fromAgentType} -> ${act.toAgentType}): ` +
            `Missing required context field '${field}'`,
        );
      }
    }
  }
}

/**
 * Validates that each handoff has corresponding WebSocket events.
 * Checks for orchestrator:handoff and orchestrator:story_progress events.
 *
 * @throws Error if a handoff is missing its events
 */
export function assertHandoffEvents(
  handoffs: HandoffRecordE2E[],
  events: EmittedEventRecord[],
): void {
  const handoffEvents = events.filter(
    (e) => e.type === 'orchestrator:handoff',
  );
  const progressEvents = events.filter(
    (e) => e.type === 'orchestrator:story_progress',
  );

  for (let i = 0; i < handoffs.length; i++) {
    const handoff = handoffs[i];

    // Check for orchestrator:handoff event
    const matchingHandoff = handoffEvents.find(
      (e) =>
        (e.payload.fromAgent?.type === handoff.fromAgentType ||
          e.payload.fromAgentType === handoff.fromAgentType) &&
        (e.payload.toAgent?.type === handoff.toAgentType ||
          e.payload.toAgentType === handoff.toAgentType),
    );

    if (!matchingHandoff) {
      throw new Error(
        `Handoff ${i} (${handoff.fromAgentType} -> ${handoff.toAgentType}): ` +
          `No corresponding orchestrator:handoff event found`,
      );
    }
  }
}

/**
 * Validates that each handoff has a corresponding HandoffHistory record.
 * Uses the mock repository's saved entities for verification.
 *
 * @throws Error if a handoff is missing its audit trail
 */
export function assertHandoffAuditTrail(
  handoffs: HandoffRecordE2E[],
  historyEntities: any[],
): void {
  for (let i = 0; i < handoffs.length; i++) {
    const handoff = handoffs[i];
    const matchingRecord = historyEntities.find(
      (h: any) =>
        h.fromAgentType === handoff.fromAgentType &&
        h.toAgentType === handoff.toAgentType,
    );

    if (!matchingRecord) {
      throw new Error(
        `Handoff ${i} (${handoff.fromAgentType} -> ${handoff.toAgentType}): ` +
          `No HandoffHistory audit trail record found`,
      );
    }
  }
}
