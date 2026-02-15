/**
 * ContextGenerationService
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * Core service for generating project-level context files:
 * - Tier 1: .devoscontext (JSON, minimal state machine, <2KB)
 * - Tier 2: DEVOS.md (Markdown, full instructions, <50KB)
 * - Tier 3: project-state.yaml (YAML, append-only history)
 *
 * Integrates with Graphiti memory (MemoryQueryService) for
 * Key Decisions and Recent Problems sections in DEVOS.md.
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MemoryQueryService } from '../../memory/services/memory-query.service';
import { PipelineStateStore } from '../../orchestrator/services/pipeline-state-store.service';
import {
  DevOSContext,
  ActiveAgent,
  ProjectStateEntry,
  ProjectState,
  ContextRefreshResult,
  ProjectMetadata,
} from '../interfaces/context-generation.interfaces';
import { PipelineContext, PipelineState } from '../../orchestrator/interfaces/pipeline.interfaces';

@Injectable()
export class ContextGenerationService {
  private readonly logger = new Logger(ContextGenerationService.name);

  /**
   * Per-project mutex to prevent concurrent appendProjectState writes.
   * Serializes YAML file read-modify-write to avoid lost updates.
   */
  private readonly appendLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(PipelineStateStore)
    private readonly pipelineStateStore?: PipelineStateStore,
    @Optional() @Inject(MemoryQueryService)
    private readonly memoryQueryService?: MemoryQueryService,
  ) {}

  // ── Tier 1: .devoscontext Generation ────────────────────────────────────

  /**
   * Generate a DevOSContext object (Tier 1) from pipeline state.
   * JSON format, target <2KB.
   */
  async generateDevOSContext(
    projectId: string,
    workspaceId: string,
    pipelineState?: PipelineContext | null,
  ): Promise<DevOSContext> {
    const state = pipelineState ?? (await this.loadPipelineState(projectId));

    return {
      version: '1.0',
      project_id: projectId,
      workspace_id: workspaceId,
      phase: this.determinePhase(state),
      current_sprint: state?.metadata?.sprint ?? 1,
      active_agents: this.extractActiveAgents(state),
      next_actions: this.determineNextActions(state),
      blockers: this.extractBlockers(state),
      last_updated: new Date().toISOString(),
    };
  }

  // ── Tier 2: DEVOS.md Generation ─────────────────────────────────────────

  /**
   * Generate DEVOS.md markdown content (Tier 2).
   * Includes 7 sections, with Key Decisions and Recent Problems from Graphiti.
   * Target <50KB.
   */
  async generateDevOSMd(
    projectId: string,
    workspaceId: string,
    projectMetadata: ProjectMetadata,
  ): Promise<string> {
    const sections: string[] = [];

    // Section 1: Project Overview
    sections.push(
      `# DEVOS Project Context\n\n` +
        `## Project Overview\n` +
        `${projectMetadata.name} - ${projectMetadata.description}`,
    );

    // Section 2: Tech Stack
    sections.push(
      `## Tech Stack\n${projectMetadata.techStack || 'Not specified'}`,
    );

    // Section 3: Architecture Summary
    sections.push(
      `## Architecture Summary\n${projectMetadata.architectureSummary || 'Not specified'}`,
    );

    // Section 4: Current Workflow State
    const workflowState = [
      `## Current Workflow State`,
      `- **Current Epic**: ${projectMetadata.currentEpic || 'None'}`,
      `- **Sprint**: ${projectMetadata.sprintNumber ?? 'N/A'}`,
      `- **Active Stories**: ${(projectMetadata.activeStories || []).join(', ') || 'None'}`,
      `- **Completed Stories**: ${projectMetadata.completedCount ?? 0}/${projectMetadata.totalCount ?? 0}`,
    ];
    sections.push(workflowState.join('\n'));

    // Section 5: Coding Conventions
    sections.push(
      `## Coding Conventions\n${projectMetadata.conventions || 'Not specified'}`,
    );

    // Section 6: Key Decisions (from Graphiti memory)
    const decisionsSection = await this.buildDecisionsSection(
      projectId,
      workspaceId,
    );
    sections.push(decisionsSection);

    // Section 7: Recent Problems Solved (from Graphiti memory)
    const problemsSection = await this.buildProblemsSection(
      projectId,
      workspaceId,
    );
    sections.push(problemsSection);

    // Footer
    const timestamp = new Date().toISOString();
    sections.push(
      `---\n*Generated: ${timestamp}*`,
    );

    return sections.join('\n\n');
  }

  // ── Tier 3: project-state.yaml Append ───────────────────────────────────

  /**
   * Append a story completion entry to project-state.yaml.
   * Creates the file if it does not exist.
   * Preserves existing entries.
   * Uses a per-project lock to prevent concurrent read-modify-write races.
   */
  async appendProjectState(
    workspacePath: string,
    projectId: string,
    workspaceId: string,
    entry: ProjectStateEntry,
  ): Promise<void> {
    // Serialize concurrent appends for the same project to prevent lost writes
    const lockKey = `${workspacePath}:${projectId}`;
    const prevLock = this.appendLocks.get(lockKey) ?? Promise.resolve();
    const currentOp = prevLock.then(() =>
      this.appendProjectStateUnsafe(workspacePath, projectId, workspaceId, entry),
    );
    this.appendLocks.set(lockKey, currentOp.catch(() => {}));

    return currentOp;
  }

  /**
   * Internal append without locking - called by appendProjectState.
   */
  private async appendProjectStateUnsafe(
    workspacePath: string,
    projectId: string,
    workspaceId: string,
    entry: ProjectStateEntry,
  ): Promise<void> {
    const filePath = path.join(workspacePath, 'project-state.yaml');
    let projectState: ProjectState;

    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as ProjectState;

      if (parsed && parsed.stories && Array.isArray(parsed.stories)) {
        projectState = parsed;
      } else {
        projectState = this.createEmptyProjectState(projectId, workspaceId);
      }
    } catch (error) {
      // File does not exist or YAML parse error - create new
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        this.logger.log(
          `Creating new project-state.yaml at ${filePath}`,
        );
      } else {
        this.logger.warn(
          `Error reading project-state.yaml, creating new: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      projectState = this.createEmptyProjectState(projectId, workspaceId);
    }

    // Append the new entry
    projectState.stories.push(entry);
    projectState.generated_at = new Date().toISOString();

    // Write back
    const yamlContent = yaml.dump(projectState, { lineWidth: -1 });
    await this.writeProjectState(workspacePath, yamlContent);
  }

  // ── File Write Methods ──────────────────────────────────────────────────

  /**
   * Write .devoscontext JSON file to workspace.
   */
  async writeDevOSContext(
    workspacePath: string,
    context: DevOSContext,
  ): Promise<void> {
    const filePath = path.join(workspacePath, '.devoscontext');
    await this.ensureDirectory(workspacePath);
    await fsPromises.writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  }

  /**
   * Write DEVOS.md file to workspace.
   */
  async writeDevOSMd(
    workspacePath: string,
    markdown: string,
  ): Promise<void> {
    const filePath = path.join(workspacePath, 'DEVOS.md');
    await this.ensureDirectory(workspacePath);
    await fsPromises.writeFile(filePath, markdown, 'utf-8');
  }

  /**
   * Write project-state.yaml file to workspace.
   */
  async writeProjectState(
    workspacePath: string,
    yamlContent: string,
  ): Promise<void> {
    const filePath = path.join(workspacePath, 'project-state.yaml');
    await this.ensureDirectory(workspacePath);
    await fsPromises.writeFile(filePath, yamlContent, 'utf-8');
  }

  // ── Refresh All Tiers ───────────────────────────────────────────────────

  /**
   * Refresh all three tiers for a project.
   * Tier 3 is append-only (only on story completion), so manual refresh
   * does NOT modify existing entries - tier3Updated is always false.
   */
  async refreshAllTiers(
    projectId: string,
    workspaceId: string,
    workspacePath: string,
    projectMetadata: ProjectMetadata,
  ): Promise<ContextRefreshResult> {
    const startTime = Date.now();
    let tier1Updated = false;
    let tier2Updated = false;

    try {
      // Tier 1: .devoscontext
      const context = await this.generateDevOSContext(projectId, workspaceId);
      await this.writeDevOSContext(workspacePath, context);
      tier1Updated = true;
    } catch (error) {
      this.logger.error(
        `Failed to update Tier 1 (.devoscontext): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Tier 2: DEVOS.md
      const markdown = await this.generateDevOSMd(
        projectId,
        workspaceId,
        projectMetadata,
      );
      await this.writeDevOSMd(workspacePath, markdown);
      tier2Updated = true;
    } catch (error) {
      this.logger.error(
        `Failed to update Tier 2 (DEVOS.md): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      tier1Updated,
      tier2Updated,
      tier3Updated: false, // Tier 3 is event-driven append only
      refreshDurationMs: Date.now() - startTime,
    };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Load pipeline state from PipelineStateStore (if available).
   */
  private async loadPipelineState(
    projectId: string,
  ): Promise<PipelineContext | null> {
    if (!this.pipelineStateStore) {
      return null;
    }

    try {
      return await this.pipelineStateStore.getState(projectId);
    } catch (error) {
      this.logger.warn(
        `Failed to load pipeline state for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Map PipelineState to DevOSContext phase string.
   */
  private determinePhase(state: PipelineContext | null): string {
    if (!state) return 'planning';

    switch (state.currentState) {
      case PipelineState.PLANNING:
        return 'planning';
      case PipelineState.IMPLEMENTING:
        return 'implementation';
      case PipelineState.QA:
        return 'qa';
      case PipelineState.DEPLOYING:
        return 'deployment';
      case PipelineState.COMPLETE:
        return 'done';
      default:
        return 'planning';
    }
  }

  /**
   * Extract active agents from pipeline context.
   */
  private extractActiveAgents(state: PipelineContext | null): ActiveAgent[] {
    if (!state || !state.activeAgentType) {
      return [];
    }

    const agentStatus = this.mapPipelineStateToAgentStatus(state.currentState);

    return [
      {
        type: state.activeAgentType,
        story: state.currentStoryId || 'unknown',
        status: agentStatus,
      },
    ];
  }

  /**
   * Map pipeline state to agent status string.
   */
  private mapPipelineStateToAgentStatus(pipelineState: PipelineState): string {
    switch (pipelineState) {
      case PipelineState.QA:
        return 'reviewing';
      case PipelineState.IMPLEMENTING:
      case PipelineState.PLANNING:
      case PipelineState.DEPLOYING:
        return 'working';
      default:
        return 'idle';
    }
  }

  /**
   * Determine next actions based on pipeline state.
   */
  private determineNextActions(state: PipelineContext | null): string[] {
    if (!state) {
      return ['Initialize pipeline', 'Start planning phase'];
    }

    switch (state.currentState) {
      case PipelineState.PLANNING:
        return ['Complete planning', 'Move to implementation'];
      case PipelineState.IMPLEMENTING:
        return ['Complete implementation', 'Run tests', 'Move to QA'];
      case PipelineState.QA:
        return ['Complete QA review', 'Fix issues if any', 'Move to deployment'];
      case PipelineState.DEPLOYING:
        return ['Complete deployment', 'Run smoke tests'];
      case PipelineState.COMPLETE:
        return ['Start next story'];
      case PipelineState.FAILED:
        return ['Investigate failure', 'Retry or fix issues'];
      case PipelineState.PAUSED:
        return ['Resume pipeline'];
      default:
        return ['Start pipeline'];
    }
  }

  /**
   * Extract blockers from pipeline metadata.
   */
  private extractBlockers(state: PipelineContext | null): string[] {
    if (!state || !state.metadata) {
      return [];
    }

    const blockers: string[] = [];

    if (state.metadata.blockers && Array.isArray(state.metadata.blockers)) {
      blockers.push(...state.metadata.blockers);
    }

    if (state.currentState === PipelineState.FAILED && state.metadata.errorMessage) {
      blockers.push(`Pipeline failed: ${state.metadata.errorMessage}`);
    }

    if (state.currentState === PipelineState.PAUSED) {
      blockers.push('Pipeline is paused');
    }

    return blockers;
  }

  /**
   * Build Key Decisions section from Graphiti memory.
   */
  private async buildDecisionsSection(
    projectId: string,
    workspaceId: string,
  ): Promise<string> {
    const header = '## Key Decisions';

    if (!this.memoryQueryService) {
      return `${header}\nNo memory service available.`;
    }

    try {
      const maxDecisions = parseInt(
        this.configService.get<string>(
          'CONTEXT_DEVOS_MD_MAX_DECISIONS',
          '20',
        ),
        10,
      );

      const result = await this.memoryQueryService.query({
        projectId,
        workspaceId,
        query: 'decisions',
        filters: {
          types: ['decision'],
          maxResults: maxDecisions,
        },
      });

      if (result.memories.length === 0) {
        return `${header}\nNo decisions recorded yet.`;
      }

      const lines = result.memories.map((m) => {
        const dateStr =
          m.timestamp instanceof Date
            ? m.timestamp.toISOString().split('T')[0]
            : String(m.timestamp).split('T')[0];
        return `- [${dateStr}] ${m.content}`;
      });

      return `${header}\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.warn(
        `Failed to query decisions from Graphiti: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `${header}\nFailed to load decisions.`;
    }
  }

  /**
   * Build Recent Problems Solved section from Graphiti memory.
   */
  private async buildProblemsSection(
    projectId: string,
    workspaceId: string,
  ): Promise<string> {
    const header = '## Recent Problems Solved';

    if (!this.memoryQueryService) {
      return `${header}\nNo memory service available.`;
    }

    try {
      const maxProblems = parseInt(
        this.configService.get<string>(
          'CONTEXT_DEVOS_MD_MAX_PROBLEMS',
          '10',
        ),
        10,
      );

      const result = await this.memoryQueryService.query({
        projectId,
        workspaceId,
        query: 'problems',
        filters: {
          types: ['problem'],
          maxResults: maxProblems,
        },
      });

      if (result.memories.length === 0) {
        return `${header}\nNo problems recorded yet.`;
      }

      const lines = result.memories.map((m) => {
        const dateStr =
          m.timestamp instanceof Date
            ? m.timestamp.toISOString().split('T')[0]
            : String(m.timestamp).split('T')[0];
        return `- [${dateStr}] ${m.content}`;
      });

      return `${header}\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.warn(
        `Failed to query problems from Graphiti: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `${header}\nFailed to load problems.`;
    }
  }

  /**
   * Create empty ProjectState structure.
   */
  private createEmptyProjectState(
    projectId: string,
    workspaceId: string,
  ): ProjectState {
    return {
      version: '1.0',
      project_id: projectId,
      workspace_id: workspaceId,
      generated_at: new Date().toISOString(),
      stories: [],
    };
  }

  /**
   * Ensure directory exists before writing files.
   * Only ignores EEXIST errors; re-throws other errors (e.g., permission denied).
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fsPromises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // recursive:true should not throw EEXIST, but handle it just in case
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        return; // Directory already exists, safe to ignore
      }
      throw error; // Re-throw permission errors and other failures
    }
  }
}
