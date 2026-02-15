/**
 * ContextGenerationTriggerService
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * Event-driven trigger service that listens for pipeline state change events
 * and triggers context file generation based on the type of change:
 * - Story status change -> Update Tier 1 (.devoscontext)
 * - Story completion -> Update Tier 1 + append Tier 3 (project-state.yaml)
 * - Epic completion -> Update all three tiers
 *
 * Implements debounce to prevent duplicate writes from rapid events.
 *
 * Story 12.5: After context generation, triggers health check via
 * ContextHealthEventService to detect health transitions.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { ContextGenerationService } from './context-generation.service';
import { ContextHealthEventService } from './context-health-event.service';
import {
  PipelineStateEvent,
  PipelineState,
} from '../../orchestrator/interfaces/pipeline.interfaces';
import { ProjectStateEntry, ProjectMetadata } from '../interfaces/context-generation.interfaces';

/** Debounce window in milliseconds */
const DEBOUNCE_WINDOW_MS = 100;

/** Maximum entries in debounce map before cleanup */
const DEBOUNCE_MAP_MAX_SIZE = 1000;

/** Stale entry threshold for cleanup (1 hour) */
const DEBOUNCE_STALE_MS = 60 * 60 * 1000;

@Injectable()
export class ContextGenerationTriggerService {
  private readonly logger = new Logger(ContextGenerationTriggerService.name);

  /**
   * Map of projectId -> last trigger timestamp for debounce.
   * Periodically cleaned up to prevent unbounded growth.
   */
  private readonly lastTriggerTimestamp = new Map<string, number>();

  constructor(
    private readonly contextGenerationService: ContextGenerationService,
    private readonly configService: ConfigService,
    @Optional() private readonly contextHealthEventService?: ContextHealthEventService,
  ) {}

  /**
   * Clean up stale entries from the debounce map to prevent memory leaks.
   * Called when the map exceeds DEBOUNCE_MAP_MAX_SIZE.
   */
  private cleanupDebounceMap(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.lastTriggerTimestamp) {
      if (now - timestamp > DEBOUNCE_STALE_MS) {
        this.lastTriggerTimestamp.delete(key);
      }
    }
  }

  /**
   * Handle pipeline state change events.
   * Determines the trigger type and calls appropriate generation methods.
   */
  @OnEvent('pipeline:state_changed')
  async handleStateChange(event: PipelineStateEvent): Promise<void> {
    try {
      // Check if context generation is enabled
      const enabled = this.configService.get<string>(
        'CONTEXT_GENERATION_ENABLED',
        'true',
      );
      if (enabled === 'false') {
        return;
      }

      // Debounce: skip if last trigger was within the debounce window
      const now = Date.now();
      const lastTrigger = this.lastTriggerTimestamp.get(event.projectId) ?? 0;
      if (now - lastTrigger < DEBOUNCE_WINDOW_MS) {
        this.logger.debug(
          `Debounced context generation for project ${event.projectId}`,
        );
        return;
      }
      this.lastTriggerTimestamp.set(event.projectId, now);

      // Prevent memory leak: clean up stale debounce entries periodically
      if (this.lastTriggerTimestamp.size > DEBOUNCE_MAP_MAX_SIZE) {
        this.cleanupDebounceMap();
      }

      // Determine trigger type and workspace path
      const workspacePath = this.resolveWorkspacePath(event.workspaceId, event.projectId);

      if (this.isEpicCompletion(event)) {
        // Epic completion -> update all three tiers
        this.logger.log(
          `Epic completion detected for project ${event.projectId}, refreshing all tiers`,
        );
        const metadata = this.buildDefaultMetadata(event);
        await this.contextGenerationService.refreshAllTiers(
          event.projectId,
          event.workspaceId,
          workspacePath,
          metadata,
        );
      } else if (this.isStoryCompletion(event)) {
        // Story completion -> update Tier 1 + append Tier 3
        this.logger.log(
          `Story completion detected for project ${event.projectId}, updating Tier 1 + Tier 3`,
        );

        // Tier 1
        const context = await this.contextGenerationService.generateDevOSContext(
          event.projectId,
          event.workspaceId,
        );
        await this.contextGenerationService.writeDevOSContext(workspacePath, context);

        // Tier 3
        const storyEntry = this.buildStoryEntry(event);
        await this.contextGenerationService.appendProjectState(
          workspacePath,
          event.projectId,
          event.workspaceId,
          storyEntry,
        );
      } else {
        // General story status change -> update Tier 1 only
        this.logger.log(
          `Story status change detected for project ${event.projectId}, updating Tier 1`,
        );

        const context = await this.contextGenerationService.generateDevOSContext(
          event.projectId,
          event.workspaceId,
        );
        await this.contextGenerationService.writeDevOSContext(workspacePath, context);
      }

      // Story 12.5: Trigger health check after context generation
      await this.triggerHealthCheck(event.projectId, event.workspaceId, workspacePath);
    } catch (error) {
      // Event handlers must not crash - log error and continue
      this.logger.error(
        `Error processing pipeline state change for context generation: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Check if the event indicates a story completion (status -> done).
   */
  private isStoryCompletion(event: PipelineStateEvent): boolean {
    return event.newState === PipelineState.COMPLETE && !!event.storyId;
  }

  /**
   * Check if the event metadata indicates an epic completion.
   */
  private isEpicCompletion(event: PipelineStateEvent): boolean {
    return !!(event.metadata?.epicCompletion);
  }

  /**
   * Build a ProjectStateEntry from a pipeline state change event.
   */
  private buildStoryEntry(event: PipelineStateEvent): ProjectStateEntry {
    return {
      storyId: event.storyId || 'unknown',
      title: (event.metadata?.storyTitle as string) || 'Unknown Story',
      completedAt: new Date().toISOString(),
      agentType: event.metadata?.agentType as string || 'dev',
      decisions: (event.metadata?.decisions as string[]) || [],
      issues: (event.metadata?.issues as string[]) || [],
      filesChanged: (event.metadata?.filesChanged as number) || 0,
      testsPassed: (event.metadata?.testsPassed as number) || 0,
      memoryEpisodeIds: (event.metadata?.memoryEpisodeIds as string[]) || [],
    };
  }

  /**
   * Build default ProjectMetadata from event data.
   */
  private buildDefaultMetadata(event: PipelineStateEvent): ProjectMetadata {
    return {
      name: (event.metadata?.projectName as string) || 'DevOS Project',
      description: (event.metadata?.projectDescription as string) || '',
      techStack: (event.metadata?.techStack as string) || '',
      conventions: (event.metadata?.conventions as string) || '',
      architectureSummary: (event.metadata?.architectureSummary as string) || '',
      currentEpic: (event.metadata?.currentEpic as string) || undefined,
      sprintNumber: (event.metadata?.sprintNumber as number) || undefined,
    };
  }

  /**
   * Resolve workspace path from workspaceId and projectId.
   * Uses CLI_WORKSPACE_BASE_PATH config (same as WorkspaceManagerService).
   * Sanitizes inputs to prevent path traversal attacks.
   */
  private resolveWorkspacePath(
    workspaceId: string,
    projectId: string,
  ): string {
    const basePath = this.configService.get<string>(
      'CLI_WORKSPACE_BASE_PATH',
      '/workspaces',
    );
    // Sanitize to prevent path traversal - strip path separators and parent refs
    const safeWorkspaceId = workspaceId.replace(/[/\\..]/g, '');
    const safeProjectId = projectId.replace(/[/\\..]/g, '');

    if (!safeWorkspaceId || !safeProjectId) {
      throw new Error(
        `Invalid workspaceId or projectId: workspaceId="${workspaceId}", projectId="${projectId}"`,
      );
    }

    return `${basePath}/${safeWorkspaceId}/${safeProjectId}`;
  }

  /**
   * Story 12.5: Trigger health check after context generation.
   * Wrapped in try/catch to prevent health check failures from blocking
   * context generation.
   */
  private async triggerHealthCheck(
    projectId: string,
    workspaceId: string,
    workspacePath: string,
  ): Promise<void> {
    if (!this.contextHealthEventService) {
      return;
    }
    try {
      await this.contextHealthEventService.checkAndEmitHealthChange(
        projectId,
        workspaceId,
        workspacePath,
      );
    } catch (error) {
      this.logger.warn(
        `Health check failed after context generation for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
