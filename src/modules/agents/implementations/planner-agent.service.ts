import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from '../agents.service';
import { Agent, AgentStatus } from '../../../database/entities/agent.entity';
import { ClaudeApiService } from '../services/claude-api.service';
import { parseJsonResponse } from '../services/parse-json-response.util';
import {
  PlannerAgentTask,
  PlannerAgentResult,
  CreatePlanResult,
  BreakdownEpicResult,
  GeneratePrdResult,
  GenerateArchitectureResult,
} from '../interfaces/planner-agent.interfaces';
import {
  PLANNER_AGENT_SYSTEM_PROMPT,
  buildCreatePlanPrompt,
  buildBreakdownEpicPrompt,
  buildGeneratePrdPrompt,
  buildGenerateArchitecturePrompt,
} from '../prompts/planner-agent.prompts';

/**
 * PlannerAgentService
 * Story 5.4: Planner Agent Implementation
 *
 * Autonomous planning agent that creates implementation plans,
 * breaks down epics, generates PRDs, and designs architectures
 * using the Claude API.
 */
@Injectable()
export class PlannerAgentService {
  private readonly logger = new Logger(PlannerAgentService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly claudeApiService: ClaudeApiService,
  ) {}

  /**
   * Execute a planning task
   */
  async executeTask(agent: Agent, task: PlannerAgentTask): Promise<PlannerAgentResult> {
    this.logger.log(`Planner agent ${agent.id} executing task: ${task.type}`);

    await this.agentsService.updateAgent(agent.id, agent.workspaceId, {
      status: AgentStatus.RUNNING,
      currentTask: task.description,
      startedAt: new Date(),
    });

    try {
      let result: PlannerAgentResult;

      switch (task.type) {
        case 'create-plan':
          result = await this.createPlan(agent, task);
          break;
        case 'breakdown-epic':
          result = await this.breakdownEpic(agent, task);
          break;
        case 'generate-prd':
          result = await this.generatePrd(agent, task);
          break;
        case 'generate-architecture':
          result = await this.generateArchitecture(agent, task);
          break;
        default:
          throw new Error(`Unknown task type: ${(task as any).type}`);
      }

      await this.agentsService.markCompleted(agent.id, agent.workspaceId);

      return result;
    } catch (error: any) {
      try {
        await this.agentsService.markFailed(agent.id, agent.workspaceId, error.message);
      } catch (markFailedError: any) {
        this.logger.error(
          `Failed to mark agent ${agent.id} as failed: ${markFailedError.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Create an implementation plan using Claude API
   */
  private async createPlan(agent: Agent, task: PlannerAgentTask): Promise<CreatePlanResult> {
    this.logger.log(`Creating implementation plan: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildCreatePlanPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: PLANNER_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.plan) {
      this.logger.warn('Claude response missing expected "plan" key for create-plan task');
    }

    return {
      status: 'plan_created',
      description: task.description,
      plan: parsed.plan || { summary: '', phases: [], milestones: [] },
      risks: parsed.risks || [],
      estimatedEffort: parsed.estimatedEffort || '',
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Break down an epic into stories using Claude API
   */
  private async breakdownEpic(agent: Agent, task: PlannerAgentTask): Promise<BreakdownEpicResult> {
    this.logger.log(`Breaking down epic: ${task.epicId || task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildBreakdownEpicPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: PLANNER_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.stories) {
      this.logger.warn('Claude response missing expected "stories" key for breakdown-epic task');
    }

    return {
      status: 'epic_broken_down',
      epicId: task.epicId || 'N/A',
      epicDescription: task.epicDescription || task.description,
      stories: parsed.stories || [],
      totalStories: parsed.totalStories || (parsed.stories?.length ?? 0),
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Generate a PRD using Claude API
   */
  private async generatePrd(agent: Agent, task: PlannerAgentTask): Promise<GeneratePrdResult> {
    this.logger.log(`Generating PRD: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildGeneratePrdPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: PLANNER_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.prd) {
      this.logger.warn('Claude response missing expected "prd" key for generate-prd task');
    }

    return {
      status: 'prd_generated',
      description: task.description,
      prd: parsed.prd || {
        overview: '',
        problemStatement: '',
        goals: [],
        userPersonas: [],
        functionalRequirements: [],
        nonFunctionalRequirements: [],
        successMetrics: [],
      },
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Generate architecture document using Claude API
   */
  private async generateArchitecture(
    agent: Agent,
    task: PlannerAgentTask,
  ): Promise<GenerateArchitectureResult> {
    this.logger.log(`Generating architecture: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildGenerateArchitecturePrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: PLANNER_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.architecture) {
      this.logger.warn('Claude response missing expected "architecture" key for generate-architecture task');
    }

    return {
      status: 'architecture_generated',
      description: task.description,
      architecture: parsed.architecture || {
        overview: '',
        techStack: [],
        components: [],
        dataModel: '',
        deploymentStrategy: '',
      },
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

}
