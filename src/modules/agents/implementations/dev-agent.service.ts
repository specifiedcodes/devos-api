import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from '../agents.service';
import { Agent, AgentStatus } from '../../../database/entities/agent.entity';
import { ClaudeApiService } from '../services/claude-api.service';
import {
  ClaudeApiResponse,
  ImplementStoryResult,
  FixBugResult,
  WriteTestsResult,
  RefactorResult,
  AnalyzeCodeResult,
  DevAgentResult,
} from '../interfaces/claude-api.interfaces';
import {
  DEV_AGENT_SYSTEM_PROMPT,
  buildImplementStoryPrompt,
  buildFixBugPrompt,
  buildWriteTestsPrompt,
  buildRefactorPrompt,
  buildAnalyzeCodePrompt,
  buildGenerateCodePrompt,
} from '../prompts/dev-agent.prompts';

export interface DevAgentTask {
  type: 'implement-story' | 'fix-bug' | 'write-tests' | 'refactor';
  storyId?: string;
  description: string;
  files?: string[];
  requirements?: string[];
}

/**
 * DevAgentService
 * Story 5.3: Dev Agent Implementation
 *
 * Autonomous development agent that writes code using the Claude API
 */
@Injectable()
export class DevAgentService {
  private readonly logger = new Logger(DevAgentService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly claudeApiService: ClaudeApiService,
  ) {}

  /**
   * Execute a development task
   */
  async executeTask(agent: Agent, task: DevAgentTask): Promise<DevAgentResult> {
    this.logger.log(`Dev agent ${agent.id} executing task: ${task.type}`);

    await this.agentsService.updateAgent(agent.id, agent.workspaceId, {
      status: AgentStatus.RUNNING,
      currentTask: task.description,
      startedAt: new Date(),
    });

    try {
      let result: DevAgentResult;

      switch (task.type) {
        case 'implement-story':
          result = await this.implementStory(agent, task);
          break;
        case 'fix-bug':
          result = await this.fixBug(agent, task);
          break;
        case 'write-tests':
          result = await this.writeTests(agent, task);
          break;
        case 'refactor':
          result = await this.refactor(agent, task);
          break;
        default:
          throw new Error(`Unknown task type: ${(task as any).type}`);
      }

      await this.agentsService.markCompleted(agent.id, agent.workspaceId);

      return result;
    } catch (error: any) {
      await this.agentsService.markFailed(agent.id, agent.workspaceId, error.message);
      throw error;
    }
  }

  /**
   * Implement a user story using Claude API
   */
  private async implementStory(agent: Agent, task: DevAgentTask): Promise<ImplementStoryResult> {
    this.logger.log(`Implementing story ${task.storyId}`);

    // Update heartbeat during long-running operation
    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildImplementStoryPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    const parsed = this.parseJsonResponse(response);

    return {
      status: 'implemented',
      storyId: task.storyId || 'N/A',
      plan: parsed.plan || '',
      filesGenerated: parsed.filesGenerated || [],
      codeBlocks: parsed.codeBlocks || [],
      testsGenerated: parsed.testsGenerated ?? false,
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Fix a bug using Claude API
   */
  private async fixBug(agent: Agent, task: DevAgentTask): Promise<FixBugResult> {
    this.logger.log(`Fixing bug: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildFixBugPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    const parsed = this.parseJsonResponse(response);

    return {
      status: 'fixed',
      description: task.description,
      rootCause: parsed.rootCause || '',
      fix: parsed.fix || '',
      filesModified: parsed.filesModified || [],
      codeChanges: parsed.codeChanges || [],
      testsAdded: parsed.testsAdded ?? false,
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Write tests using Claude API
   */
  private async writeTests(agent: Agent, task: DevAgentTask): Promise<WriteTestsResult> {
    this.logger.log(`Writing tests for: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildWriteTestsPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    const parsed = this.parseJsonResponse(response);

    return {
      status: 'tests_written',
      description: task.description,
      testFiles: parsed.testFiles || [],
      totalTests: parsed.totalTests || 0,
      coverageEstimate: parsed.coverageEstimate || 'medium',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Refactor code using Claude API
   */
  private async refactor(agent: Agent, task: DevAgentTask): Promise<RefactorResult> {
    this.logger.log(`Refactoring: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildRefactorPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    const parsed = this.parseJsonResponse(response);

    return {
      status: 'refactored',
      description: task.description,
      improvements: parsed.improvements || [],
      filesModified: parsed.filesModified || [],
      codeChanges: parsed.codeChanges || [],
      qualityMetrics: parsed.qualityMetrics || {
        complexityReduction: 'N/A',
        maintainabilityImprovement: 'N/A',
      },
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Analyze code for issues using Claude API
   */
  async analyzeCode(agent: Agent, files: string[]): Promise<AnalyzeCodeResult> {
    this.logger.log(`Analyzing ${files.length} files`);

    const userPrompt = buildAnalyzeCodePrompt(files);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    const parsed = this.parseJsonResponse(response);

    return {
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      metrics: parsed.metrics || {
        complexity: 'low',
        maintainability: 'high',
      },
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Generate code from specification using Claude API
   */
  async generateCode(agent: Agent, spec: string): Promise<string> {
    this.logger.log('Generating code from specification');

    const userPrompt = buildGenerateCodePrompt(spec);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEV_AGENT_SYSTEM_PROMPT,
      userPrompt,
    });

    return response.content;
  }

  /**
   * Parse a JSON response from the Claude API.
   * Handles cases where Claude may include markdown fences around JSON.
   */
  private parseJsonResponse(response: ClaudeApiResponse): Record<string, any> {
    let content = response.content.trim();

    // Strip markdown code fences if present
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    try {
      return JSON.parse(content);
    } catch {
      this.logger.warn(
        'Failed to parse Claude API response as JSON, returning raw content',
      );
      return { rawContent: content };
    }
  }
}
