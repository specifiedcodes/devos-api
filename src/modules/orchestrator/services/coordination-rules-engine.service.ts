/**
 * CoordinationRulesEngine Service
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Validates coordination rules before a handoff proceeds.
 * Enforces safe agent coordination constraints:
 * 1. One Dev Agent per story
 * 2. QA Agent independence (different from Dev Agent)
 * 3. DevOps requires QA PASS
 * 4. Max parallel agents
 * 5. No duplicate phases per story
 * 6. Iteration limit for QA rejection cycles
 */
import { Injectable, Logger } from '@nestjs/common';
import { PipelineStateStore } from './pipeline-state-store.service';
import {
  ActiveAgentInfo,
  CoordinationRuleResult,
  CoordinationViolation,
  DEFAULT_MAX_PARALLEL_AGENTS,
  DEFAULT_MAX_QA_ITERATIONS,
} from '../interfaces/handoff.interfaces';

export interface ValidateHandoffParams {
  workspaceId: string;
  storyId: string;
  fromAgentType: string;
  toAgentType: string;
  currentActiveAgents: ActiveAgentInfo[];
  maxParallelAgents?: number;
  iterationCount?: number;
  qaVerdict?: string;
  completingAgentId?: string;
  devAgentIdForStory?: string;
  qaAgentId?: string;
}

@Injectable()
export class CoordinationRulesEngineService {
  private readonly logger = new Logger(CoordinationRulesEngineService.name);

  constructor(private readonly stateStore: PipelineStateStore) {}

  /**
   * Validate all coordination rules before a handoff proceeds.
   * Returns CoordinationRuleResult with violations array.
   * Handoff is allowed only if there are zero violations with severity 'error'.
   */
  async validateHandoff(
    params: ValidateHandoffParams,
  ): Promise<CoordinationRuleResult> {
    const violations: CoordinationViolation[] = [];

    // Rule 1: One Dev Agent per story
    this.checkOneDevPerStory(params, violations);

    // Rule 2: QA Agent independence
    this.checkQAIndependence(params, violations);

    // Rule 3: DevOps requires QA PASS
    this.checkDevOpsRequiresQAPass(params, violations);

    // Rule 4: Max parallel agents
    this.checkMaxParallelAgents(params, violations);

    // Rule 5: No duplicate phases per story
    this.checkNoDuplicatePhases(params, violations);

    // Rule 6: Iteration limit
    this.checkIterationLimit(params, violations);

    const errorViolations = violations.filter((v) => v.severity === 'error');

    return {
      allowed: errorViolations.length === 0,
      violations,
    };
  }

  /**
   * Rule 1: No two Dev Agents can work on the same story simultaneously.
   */
  private checkOneDevPerStory(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    if (params.toAgentType !== 'dev') return;

    const duplicateDev = params.currentActiveAgents.find(
      (a) =>
        a.agentType === 'dev' &&
        a.storyId === params.storyId,
    );

    if (duplicateDev) {
      violations.push({
        rule: 'one-dev-per-story',
        description: `A Dev Agent (${duplicateDev.agentId}) is already working on story ${params.storyId}`,
        severity: 'error',
      });
    }
  }

  /**
   * Rule 2: QA Agent must be different from the Dev Agent for the same story.
   */
  private checkQAIndependence(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    if (params.toAgentType !== 'qa') return;

    const devAgentId = params.devAgentIdForStory;
    const qaAgentId = params.qaAgentId;

    if (devAgentId && qaAgentId && devAgentId === qaAgentId) {
      violations.push({
        rule: 'qa-independence',
        description: `QA Agent (${qaAgentId}) cannot review code from the same agent that wrote it (${devAgentId})`,
        severity: 'error',
      });
    }
  }

  /**
   * Rule 3: DevOps Agent cannot be spawned unless QA verdict is 'PASS'.
   */
  private checkDevOpsRequiresQAPass(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    if (params.toAgentType !== 'devops') return;

    if (params.qaVerdict && params.qaVerdict !== 'PASS') {
      violations.push({
        rule: 'devops-requires-qa-pass',
        description: `DevOps Agent cannot be spawned: QA verdict is '${params.qaVerdict}', not 'PASS'`,
        severity: 'error',
      });
    }
  }

  /**
   * Rule 4: Configurable maximum parallel agents per workspace.
   */
  private checkMaxParallelAgents(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    const maxAgents =
      params.maxParallelAgents || DEFAULT_MAX_PARALLEL_AGENTS;

    if (params.currentActiveAgents.length >= maxAgents) {
      violations.push({
        rule: 'max-parallel-agents',
        description: `Maximum parallel agents (${maxAgents}) reached. Current: ${params.currentActiveAgents.length}`,
        severity: 'error',
      });
    }
  }

  /**
   * Rule 5: A story cannot be in two pipeline phases simultaneously.
   */
  private checkNoDuplicatePhases(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    const existingPhase = params.currentActiveAgents.find(
      (a) => a.storyId === params.storyId,
    );

    if (existingPhase) {
      violations.push({
        rule: 'no-duplicate-phases',
        description: `Story ${params.storyId} is already in phase '${existingPhase.phase}' with agent ${existingPhase.agentId}`,
        severity: 'error',
      });
    }
  }

  /**
   * Rule 6: Dev -> QA -> Dev rejection cycle limited to N iterations.
   */
  private checkIterationLimit(
    params: ValidateHandoffParams,
    violations: CoordinationViolation[],
  ): void {
    const iterationCount = params.iterationCount || 0;

    if (iterationCount > DEFAULT_MAX_QA_ITERATIONS) {
      violations.push({
        rule: 'iteration-limit',
        description: `QA rejection cycle exceeded limit (${iterationCount}/${DEFAULT_MAX_QA_ITERATIONS}). Escalation required.`,
        severity: 'error',
      });
    } else if (iterationCount === DEFAULT_MAX_QA_ITERATIONS - 1) {
      violations.push({
        rule: 'iteration-limit-warning',
        description: `QA rejection cycle approaching limit (${iterationCount}/${DEFAULT_MAX_QA_ITERATIONS}). Next rejection will trigger escalation.`,
        severity: 'warning',
      });
    }
  }
}
