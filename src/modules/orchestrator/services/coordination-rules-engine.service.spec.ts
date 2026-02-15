/**
 * CoordinationRulesEngine Service Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for coordination rule validation during agent handoffs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CoordinationRulesEngineService } from './coordination-rules-engine.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import {
  ActiveAgentInfo,
  DEFAULT_MAX_PARALLEL_AGENTS,
  DEFAULT_MAX_QA_ITERATIONS,
} from '../interfaces/handoff.interfaces';

describe('CoordinationRulesEngineService', () => {
  let service: CoordinationRulesEngineService;
  let stateStore: jest.Mocked<PipelineStateStore>;

  beforeEach(async () => {
    const mockStateStore = {
      listActivePipelines: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoordinationRulesEngineService,
        { provide: PipelineStateStore, useValue: mockStateStore },
      ],
    }).compile();

    service = module.get<CoordinationRulesEngineService>(
      CoordinationRulesEngineService,
    );
    stateStore = module.get(PipelineStateStore);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateHandoff', () => {
    const baseParams = {
      workspaceId: 'ws-1',
      storyId: 'story-1',
      fromAgentType: 'dev',
      toAgentType: 'qa',
      currentActiveAgents: [] as ActiveAgentInfo[],
      maxParallelAgents: DEFAULT_MAX_PARALLEL_AGENTS,
      iterationCount: 0,
      qaVerdict: undefined as string | undefined,
      completingAgentId: 'agent-1',
    };

    it('should allow valid handoff with no violations', async () => {
      const result = await service.validateHandoff(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject duplicate Dev Agent on same story', async () => {
      const params = {
        ...baseParams,
        fromAgentType: 'planner',
        toAgentType: 'dev',
        currentActiveAgents: [
          {
            agentId: 'agent-existing',
            agentType: 'dev',
            storyId: 'story-1',
            phase: 'implementing',
            startedAt: new Date(),
          },
        ],
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(false);
      const devViolation = result.violations.find(
        (v) => v.rule === 'one-dev-per-story',
      );
      expect(devViolation).toBeDefined();
      expect(devViolation!.severity).toBe('error');
    });

    it('should reject QA reviewing own code (same agent ID)', async () => {
      const params = {
        ...baseParams,
        fromAgentType: 'dev',
        toAgentType: 'qa',
        completingAgentId: 'agent-1',
        currentActiveAgents: [
          {
            agentId: 'agent-1',
            agentType: 'dev',
            storyId: 'story-1',
            phase: 'implementing',
            startedAt: new Date(),
          },
        ],
      };

      // The rule checks if the QA agent would be the same as the dev agent
      // We simulate this by passing devAgentId in metadata
      const result = await service.validateHandoff({
        ...params,
        devAgentIdForStory: 'agent-1',
        qaAgentId: 'agent-1',
      } as any);

      expect(result.allowed).toBe(false);
      const qaViolation = result.violations.find(
        (v) => v.rule === 'qa-independence',
      );
      expect(qaViolation).toBeDefined();
      expect(qaViolation!.severity).toBe('error');
    });

    it('should reject DevOps without QA PASS verdict', async () => {
      const params = {
        ...baseParams,
        fromAgentType: 'qa',
        toAgentType: 'devops',
        qaVerdict: 'FAIL',
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(false);
      const violation = result.violations.find(
        (v) => v.rule === 'devops-requires-qa-pass',
      );
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('error');
    });

    it('should reject when max parallel agents exceeded', async () => {
      const agents: ActiveAgentInfo[] = [];
      for (let i = 0; i < DEFAULT_MAX_PARALLEL_AGENTS; i++) {
        agents.push({
          agentId: `agent-${i}`,
          agentType: 'dev',
          storyId: `story-${i}`,
          phase: 'implementing',
          startedAt: new Date(),
        });
      }

      const params = {
        ...baseParams,
        storyId: 'story-new',
        currentActiveAgents: agents,
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(false);
      const violation = result.violations.find(
        (v) => v.rule === 'max-parallel-agents',
      );
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('error');
    });

    it('should reject duplicate phase for same story', async () => {
      const params = {
        ...baseParams,
        fromAgentType: 'planner',
        toAgentType: 'dev',
        currentActiveAgents: [
          {
            agentId: 'agent-2',
            agentType: 'qa',
            storyId: 'story-1',
            phase: 'qa',
            startedAt: new Date(),
          },
        ],
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(false);
      const violation = result.violations.find(
        (v) => v.rule === 'no-duplicate-phases',
      );
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('error');
    });

    it('should reject when iteration limit exceeded', async () => {
      const params = {
        ...baseParams,
        iterationCount: DEFAULT_MAX_QA_ITERATIONS + 1,
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(false);
      const violation = result.violations.find(
        (v) => v.rule === 'iteration-limit',
      );
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('error');
    });

    it('should return warning for near-limit iterations', async () => {
      const params = {
        ...baseParams,
        iterationCount: DEFAULT_MAX_QA_ITERATIONS - 1,
      };

      const result = await service.validateHandoff(params);

      // Should be allowed but with a warning
      expect(result.allowed).toBe(true);
      const warning = result.violations.find(
        (v) => v.rule === 'iteration-limit-warning',
      );
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe('warning');
    });

    it('should allow DevOps handoff with QA PASS verdict', async () => {
      const params = {
        ...baseParams,
        fromAgentType: 'qa',
        toAgentType: 'devops',
        qaVerdict: 'PASS',
      };

      const result = await service.validateHandoff(params);

      expect(result.allowed).toBe(true);
      expect(
        result.violations.filter((v) => v.severity === 'error'),
      ).toHaveLength(0);
    });
  });
});
