/**
 * ContextHealthEventService
 * Story 12.5: Context Health Indicators UI
 *
 * Detects health status transitions and emits `context:health_changed` events
 * via EventEmitter2. Tracks previous health state per project to avoid
 * redundant event emission.
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContextHealthService } from './context-health.service';
import {
  ContextHealthChangedEvent,
  OverallHealthStatus,
} from '../interfaces/context-health.interfaces';

/** Event name for context health changes */
export const CONTEXT_HEALTH_CHANGED_EVENT = 'context:health_changed';

/** Maximum number of tracked projects to prevent unbounded memory growth */
const MAX_TRACKED_PROJECTS = 10_000;

@Injectable()
export class ContextHealthEventService {
  private readonly logger = new Logger(ContextHealthEventService.name);

  /**
   * Tracks previous health state per projectId.
   * Used to detect transitions and avoid duplicate events.
   * Bounded to MAX_TRACKED_PROJECTS to prevent memory leaks in multi-tenant environments.
   */
  private readonly previousHealthMap = new Map<string, OverallHealthStatus>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly contextHealthService: ContextHealthService,
  ) {}

  /**
   * Check current health and emit event if health status has changed.
   * Called after context generation to detect transitions.
   *
   * @param projectId - Project UUID
   * @param workspaceId - Workspace UUID
   * @param workspacePath - Path to workspace on disk
   */
  async checkAndEmitHealthChange(
    projectId: string,
    workspaceId: string,
    workspacePath: string,
  ): Promise<void> {
    try {
      // Always force refresh to get current state
      const health = await this.contextHealthService.assessHealth(
        projectId,
        workspaceId,
        workspacePath,
        true,
      );

      const previousHealth = this.previousHealthMap.get(projectId);
      const currentHealth = health.overallHealth;

      // Update stored state (evict oldest entry if at capacity)
      if (!this.previousHealthMap.has(projectId) && this.previousHealthMap.size >= MAX_TRACKED_PROJECTS) {
        const oldestKey = this.previousHealthMap.keys().next().value;
        if (oldestKey !== undefined) {
          this.previousHealthMap.delete(oldestKey);
        }
      }
      this.previousHealthMap.set(projectId, currentHealth);

      // Emit event only if health has changed
      if (previousHealth !== undefined && previousHealth !== currentHealth) {
        const event: ContextHealthChangedEvent = {
          projectId,
          workspaceId,
          previousHealth,
          currentHealth,
          issues: health.issues,
          timestamp: new Date().toISOString(),
        };

        this.eventEmitter.emit(CONTEXT_HEALTH_CHANGED_EVENT, event);

        this.logger.log(
          `Context health changed for project ${projectId}: ${previousHealth} -> ${currentHealth}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to check health change for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
