/**
 * TaskContextAssemblerService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 * Story 12.4: Three-Tier Context Recovery Enhancement (Graphiti memory integration)
 *
 * Assembles rich context for Claude Code CLI sessions based on
 * agent type, story details, workspace files, pipeline metadata,
 * and Graphiti memory context.
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { AgentTaskContext } from '../interfaces/pipeline-job.interfaces';
import {
  AGENT_PROMPT_TEMPLATES,
  DEV_AGENT_PROMPT_TEMPLATE,
  formatPrompt,
} from '../prompts/agent-prompt-templates';
import { MemoryQueryService } from '../../memory/services/memory-query.service';

/**
 * Parameters for assembling task context.
 */
export interface AssembleContextParams {
  workspaceId: string;
  projectId: string;
  storyId: string | null;
  agentType: string;
  workspacePath: string;
  pipelineMetadata: Record<string, any>;
}

@Injectable()
export class TaskContextAssemblerService {
  private readonly logger = new Logger(TaskContextAssemblerService.name);

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(MemoryQueryService)
    private readonly memoryQueryService?: MemoryQueryService,
  ) {}

  /**
   * Assemble task context for a pipeline phase.
   * Reads from project settings, story data, workspace files, and Graphiti memory.
   */
  async assembleContext(
    params: AssembleContextParams,
  ): Promise<AgentTaskContext> {
    const { workspacePath, pipelineMetadata } = params;

    this.logger.log(
      `Assembling context for ${params.agentType} agent in workspace ${params.workspaceId}`,
    );

    // Extract story details from pipeline metadata
    const storyTitle = pipelineMetadata.storyTitle || '';
    const storyDescription = pipelineMetadata.storyDescription || '';
    const acceptanceCriteria = pipelineMetadata.acceptanceCriteria || [];
    const techStack = pipelineMetadata.techStack || '';
    const codeStylePreferences = pipelineMetadata.codeStylePreferences || '';
    const testingStrategy = pipelineMetadata.testingStrategy || '';
    const previousAgentOutput = pipelineMetadata.previousAgentOutput || null;

    // Read project context from workspace (async to avoid blocking event loop)
    const projectContext = await this.readProjectContext(workspacePath);

    // List existing files in workspace (async to avoid blocking event loop)
    const existingFiles = await this.listWorkspaceFiles(workspacePath);

    // Query Graphiti memory for relevant context (Story 12.4)
    const memoryContext = await this.queryMemoryContext(
      params.projectId,
      params.workspaceId,
      storyDescription,
      params.agentType,
    );

    return {
      storyTitle,
      storyDescription,
      acceptanceCriteria,
      techStack,
      codeStylePreferences,
      testingStrategy,
      existingFiles,
      projectContext,
      previousAgentOutput,
      memoryContext: memoryContext || undefined,
    };
  }

  /**
   * Format the assembled context into a CLI task prompt string.
   * Uses agent-type-specific prompt templates.
   */
  formatTaskPrompt(context: AgentTaskContext, agentType: string): string {
    const template =
      AGENT_PROMPT_TEMPLATES[agentType] || DEV_AGENT_PROMPT_TEMPLATE;

    return formatPrompt(template, context);
  }

  /**
   * Read project context from .devoscontext or DEVOS.md in workspace.
   * Uses async file I/O to avoid blocking the event loop.
   */
  private async readProjectContext(workspacePath: string): Promise<string> {
    // Check for .devoscontext first
    const devosContextPath = path.join(workspacePath, '.devoscontext');
    try {
      await fsPromises.access(devosContextPath);
      return await fsPromises.readFile(devosContextPath, 'utf-8');
    } catch {
      // File doesn't exist or can't be read, try fallback
    }

    // Fall back to DEVOS.md
    const devosMdPath = path.join(workspacePath, 'DEVOS.md');
    try {
      await fsPromises.access(devosMdPath);
      return await fsPromises.readFile(devosMdPath, 'utf-8');
    } catch {
      // File doesn't exist or can't be read
    }

    return '';
  }

  /**
   * Query Graphiti memory for relevant context to include in agent task context.
   * Returns formatted memory context string or empty string.
   * Handles MemoryQueryService being unavailable or throwing errors gracefully.
   * Story 12.4: Three-Tier Context Recovery Enhancement.
   */
  private async queryMemoryContext(
    projectId: string,
    workspaceId: string,
    taskDescription: string,
    agentType: string,
  ): Promise<string> {
    if (!this.memoryQueryService) {
      return '';
    }

    try {
      const tokenBudget = parseInt(
        this.configService.get<string>(
          'CONTEXT_MEMORY_TOKEN_BUDGET',
          '4000',
        ),
        10,
      );

      const result = await this.memoryQueryService.queryForAgentContext(
        projectId,
        workspaceId,
        taskDescription,
        agentType,
        tokenBudget,
      );

      return result.contextString || '';
    } catch (error) {
      this.logger.warn(
        `Failed to query Graphiti memory for agent context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  /**
   * List relevant files in workspace (top-level + src/ directory).
   * Excludes node_modules, .git, and other common non-essential directories.
   * Uses async file I/O to avoid blocking the event loop.
   */
  private async listWorkspaceFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
    ]);

    try {
      // List top-level files
      const topLevel = await fsPromises.readdir(workspacePath);
      for (const entry of topLevel) {
        if (!excludeDirs.has(entry)) {
          files.push(entry);
        }
      }

      // List src/ directory if it exists
      const srcPath = path.join(workspacePath, 'src');
      try {
        const srcFiles = await fsPromises.readdir(srcPath);
        for (const entry of srcFiles) {
          files.push(`src/${entry}`);
        }
      } catch {
        // src/ directory doesn't exist, skip
      }
    } catch (error) {
      this.logger.warn(
        `Failed to list workspace files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return files;
  }
}
