/**
 * Event Verification Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 */

import { EmittedEventRecord, EXPECTED_EVENT_TYPES } from '../e2e-pipeline.interfaces';
import {
  assertEventSequence,
  assertEventPayloads,
  assertNoDuplicateEvents,
} from './event-verification';

describe('Event Verification', () => {
  const now = new Date();
  const workspaceId = 'ws-test';
  const projectId = 'proj-test';

  function makeEvents(types: string[]): EmittedEventRecord[] {
    return types.map((type, i) => ({
      type,
      timestamp: new Date(now.getTime() + i * 100),
      payload: {
        workspaceId,
        projectId,
        previousState: 'idle',
        newState: 'planning',
      },
    }));
  }

  describe('assertEventSequence', () => {
    it('should pass when all expected event types are present', () => {
      const events = makeEvents(EXPECTED_EVENT_TYPES);

      expect(() =>
        assertEventSequence(events),
      ).not.toThrow();
    });

    it('should validate events are in correct chronological order', () => {
      const events = makeEvents(EXPECTED_EVENT_TYPES);

      expect(() =>
        assertEventSequence(events, EXPECTED_EVENT_TYPES),
      ).not.toThrow();
    });

    it('should pass when extra events are interspersed', () => {
      const types = [
        'pipeline:state_changed',
        'custom:event',
        'orchestrator:pipeline_status',
        'custom:event2',
        'orchestrator:story_progress',
      ];
      const events = makeEvents(types);

      expect(() =>
        assertEventSequence(events, [
          'pipeline:state_changed',
          'orchestrator:pipeline_status',
          'orchestrator:story_progress',
        ]),
      ).not.toThrow();
    });

    it('should fail when expected event type is missing', () => {
      const events = makeEvents([
        'pipeline:state_changed',
        'orchestrator:pipeline_status',
        // Missing 'orchestrator:story_progress'
      ]);

      expect(() =>
        assertEventSequence(events, [
          'pipeline:state_changed',
          'orchestrator:pipeline_status',
          'orchestrator:story_progress',
        ]),
      ).toThrow(/Missing expected event type/);
    });

    it('should return descriptive failure message', () => {
      const events = makeEvents(['pipeline:state_changed']);

      expect(() =>
        assertEventSequence(events, [
          'pipeline:state_changed',
          'orchestrator:handoff',
        ]),
      ).toThrow(/orchestrator:handoff/);
    });
  });

  describe('assertEventPayloads', () => {
    it('should pass when workspaceId and projectId are consistent', () => {
      const events = makeEvents(['pipeline:state_changed']);

      expect(() =>
        assertEventPayloads(events, workspaceId, projectId),
      ).not.toThrow();
    });

    it('should fail when workspaceId is inconsistent', () => {
      const events = makeEvents(['pipeline:state_changed']);
      events[0].payload.workspaceId = 'wrong-workspace';

      expect(() =>
        assertEventPayloads(events, workspaceId, projectId),
      ).toThrow(/workspaceId/);
    });

    it('should fail when projectId is inconsistent', () => {
      const events = makeEvents(['pipeline:state_changed']);
      events[0].payload.projectId = 'wrong-project';

      expect(() =>
        assertEventPayloads(events, workspaceId, projectId),
      ).toThrow(/projectId/);
    });
  });

  describe('assertNoDuplicateEvents', () => {
    it('should pass when no duplicate state_changed events exist', () => {
      const events: EmittedEventRecord[] = [
        {
          type: 'pipeline:state_changed',
          timestamp: now,
          payload: { previousState: 'idle', newState: 'planning' },
        },
        {
          type: 'pipeline:state_changed',
          timestamp: new Date(now.getTime() + 100),
          payload: { previousState: 'planning', newState: 'implementing' },
        },
      ];

      expect(() =>
        assertNoDuplicateEvents(events),
      ).not.toThrow();
    });

    it('should fail when duplicate state_changed events exist', () => {
      const events: EmittedEventRecord[] = [
        {
          type: 'pipeline:state_changed',
          timestamp: now,
          payload: { previousState: 'idle', newState: 'planning' },
        },
        {
          type: 'pipeline:state_changed',
          timestamp: new Date(now.getTime() + 100),
          payload: { previousState: 'idle', newState: 'planning' },
        },
      ];

      expect(() =>
        assertNoDuplicateEvents(events),
      ).toThrow(/Duplicate/);
    });

    it('should not flag different event types as duplicates', () => {
      const events: EmittedEventRecord[] = [
        {
          type: 'orchestrator:handoff',
          timestamp: now,
          payload: { fromAgent: 'planner', toAgent: 'dev' },
        },
        {
          type: 'orchestrator:handoff',
          timestamp: new Date(now.getTime() + 100),
          payload: { fromAgent: 'dev', toAgent: 'qa' },
        },
      ];

      expect(() =>
        assertNoDuplicateEvents(events),
      ).not.toThrow();
    });
  });
});
