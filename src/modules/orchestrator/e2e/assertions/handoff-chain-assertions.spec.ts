/**
 * Handoff Chain Assertion Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 */

import {
  HandoffRecordE2E,
  EmittedEventRecord,
  EXPECTED_HANDOFFS,
} from '../e2e-pipeline.interfaces';
import {
  assertHandoffChain,
  assertHandoffEvents,
  assertHandoffAuditTrail,
} from './handoff-chain-assertions';

describe('Handoff Chain Assertions', () => {
  const now = new Date();

  function makeHandoffs(): HandoffRecordE2E[] {
    return [
      {
        id: 'h1',
        fromAgentType: 'planner',
        toAgentType: 'dev',
        fromPhase: 'planning',
        toPhase: 'implementing',
        handoffType: 'normal',
        context: {
          storyId: 's1',
          storyTitle: 'Test Story',
          acceptanceCriteria: ['AC1'],
          techStack: 'NestJS',
        },
        timestamp: now,
      },
      {
        id: 'h2',
        fromAgentType: 'dev',
        toAgentType: 'qa',
        fromPhase: 'implementing',
        toPhase: 'qa',
        handoffType: 'normal',
        context: {
          branch: 'feature/s1',
          prUrl: 'https://github.com/test/repo/pull/1',
          prNumber: 1,
          testResults: { passed: 8, failed: 0 },
        },
        timestamp: new Date(now.getTime() + 100),
      },
      {
        id: 'h3',
        fromAgentType: 'qa',
        toAgentType: 'devops',
        fromPhase: 'qa',
        toPhase: 'deploying',
        handoffType: 'normal',
        context: {
          prUrl: 'https://github.com/test/repo/pull/1',
          prNumber: 1,
          qaVerdict: 'PASS',
          qaReportSummary: 'All checks passed',
        },
        timestamp: new Date(now.getTime() + 200),
      },
      {
        id: 'h4',
        fromAgentType: 'devops',
        toAgentType: 'complete',
        fromPhase: 'deploying',
        toPhase: 'complete',
        handoffType: 'completion',
        context: {
          deploymentUrl: 'https://app.railway.app',
          smokeTestsPassed: true,
        },
        timestamp: new Date(now.getTime() + 300),
      },
    ];
  }

  function makeHandoffEvents(handoffs: HandoffRecordE2E[]): EmittedEventRecord[] {
    return handoffs.map((h) => ({
      type: 'orchestrator:handoff',
      timestamp: h.timestamp,
      payload: {
        fromAgent: { type: h.fromAgentType, id: `agent-${h.fromAgentType}` },
        toAgent: { type: h.toAgentType, id: `agent-${h.toAgentType}` },
        handoffContext: h.context,
      },
    }));
  }

  describe('assertHandoffChain', () => {
    it('should validate correct 4-step handoff chain passes', () => {
      const handoffs = makeHandoffs();

      expect(() =>
        assertHandoffChain(handoffs),
      ).not.toThrow();
    });

    it('should fail with descriptive message for missing handoff', () => {
      const handoffs = makeHandoffs().slice(0, 2);

      expect(() =>
        assertHandoffChain(handoffs),
      ).toThrow(/Missing 2 handoff/);
    });

    it('should fail when handoff has missing required context field', () => {
      const handoffs = makeHandoffs();
      // Remove required 'branch' from dev->qa context
      delete handoffs[1].context.branch;

      expect(() =>
        assertHandoffChain(handoffs),
      ).toThrow(/Missing required context field 'branch'/);
    });

    it('should validate each handoff has correct from/to agent types', () => {
      const handoffs = makeHandoffs();
      handoffs[0].fromAgentType = 'wrong-agent';

      expect(() =>
        assertHandoffChain(handoffs),
      ).toThrow(/fromAgent 'planner'.*got 'wrong-agent'/);
    });

    it('should validate to agent type matches', () => {
      const handoffs = makeHandoffs();
      handoffs[0].toAgentType = 'wrong-agent';

      expect(() =>
        assertHandoffChain(handoffs),
      ).toThrow(/toAgent 'dev'.*got 'wrong-agent'/);
    });
  });

  describe('assertHandoffEvents', () => {
    it('should pass when each handoff has correct WebSocket events', () => {
      const handoffs = makeHandoffs();
      const events = makeHandoffEvents(handoffs);

      expect(() =>
        assertHandoffEvents(handoffs, events),
      ).not.toThrow();
    });

    it('should fail when handoff event is missing', () => {
      const handoffs = makeHandoffs();
      const events = makeHandoffEvents(handoffs).slice(0, 2);

      expect(() =>
        assertHandoffEvents(handoffs, events),
      ).toThrow(/No corresponding orchestrator:handoff event/);
    });
  });

  describe('assertHandoffAuditTrail', () => {
    it('should pass when handoff audit trail records exist', () => {
      const handoffs = makeHandoffs();
      const historyEntities = handoffs.map((h) => ({
        id: h.id,
        fromAgentType: h.fromAgentType,
        toAgentType: h.toAgentType,
      }));

      expect(() =>
        assertHandoffAuditTrail(handoffs, historyEntities),
      ).not.toThrow();
    });

    it('should fail when audit trail record is missing', () => {
      const handoffs = makeHandoffs();
      const historyEntities = [
        {
          id: 'h1',
          fromAgentType: 'planner',
          toAgentType: 'dev',
        },
      ];

      expect(() =>
        assertHandoffAuditTrail(handoffs, historyEntities),
      ).toThrow(/No HandoffHistory audit trail record/);
    });
  });
});
