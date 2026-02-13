/**
 * Planner Agent Interfaces
 * Story 5.4: Planner Agent Implementation
 *
 * TypeScript interfaces for planner agent task inputs and result types.
 */

import { TokenUsage } from './claude-api.interfaces';

/**
 * Input task for the Planner Agent.
 * Each task type maps to a specific planning operation.
 */
export interface PlannerAgentTask {
  type: 'create-plan' | 'breakdown-epic' | 'generate-prd' | 'generate-architecture';
  projectDescription?: string;
  epicId?: string;
  epicDescription?: string;
  description: string;
  goals?: string[];
  constraints?: string[];
  techStack?: string[];
}

/**
 * Result for create-plan task type
 */
export interface CreatePlanResult {
  status: 'plan_created';
  description: string;
  plan: {
    summary: string;
    phases: Array<{
      name: string;
      description: string;
      estimatedEffort: string;
      dependencies: string[];
    }>;
    milestones: Array<{
      name: string;
      criteria: string;
    }>;
  };
  risks: Array<{
    description: string;
    severity: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;
  estimatedEffort: string;
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for breakdown-epic task type
 */
export interface BreakdownEpicResult {
  status: 'epic_broken_down';
  epicId: string;
  epicDescription: string;
  stories: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    estimatedEffort: string;
    priority: 'high' | 'medium' | 'low';
    dependencies: string[];
  }>;
  totalStories: number;
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for generate-prd task type
 */
export interface GeneratePrdResult {
  status: 'prd_generated';
  description: string;
  prd: {
    overview: string;
    problemStatement: string;
    goals: string[];
    userPersonas: Array<{
      name: string;
      description: string;
      needs: string[];
    }>;
    functionalRequirements: Array<{
      id: string;
      title: string;
      description: string;
      priority: 'must-have' | 'should-have' | 'nice-to-have';
    }>;
    nonFunctionalRequirements: string[];
    successMetrics: string[];
  };
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for generate-architecture task type
 */
export interface GenerateArchitectureResult {
  status: 'architecture_generated';
  description: string;
  architecture: {
    overview: string;
    techStack: Array<{
      category: string;
      technology: string;
      rationale: string;
    }>;
    components: Array<{
      name: string;
      responsibility: string;
      interfaces: string[];
    }>;
    dataModel: string;
    deploymentStrategy: string;
  };
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Union type of all planner agent result types
 */
export type PlannerAgentResult =
  | CreatePlanResult
  | BreakdownEpicResult
  | GeneratePrdResult
  | GenerateArchitectureResult;
