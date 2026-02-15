/**
 * DevOpsDeploymentMonitorService
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Polls for deployment status until complete or timeout.
 * Uses DeploymentMonitoringService (Story 6.8) for status checks.
 * Emits WebSocket progress events during polling.
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeploymentMonitoringService } from '../../integrations/deployment-monitoring/deployment-monitoring.service';
import {
  DevOpsDeploymentStatus,
  DevOpsAgentProgressEvent,
} from '../interfaces/devops-agent-execution.interfaces';

/** Default poll interval: 10 seconds */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Default timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Terminal deployment statuses */
const TERMINAL_STATUSES = new Set(['success', 'failed', 'crashed', 'canceled', 'removed']);

@Injectable()
export class DevOpsDeploymentMonitorService {
  private readonly logger = new Logger(DevOpsDeploymentMonitorService.name);

  constructor(
    private readonly deploymentMonitoring: DeploymentMonitoringService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Poll for deployment status until complete or timeout.
   *
   * @returns DevOpsDeploymentStatus with final deployment state
   */
  async waitForDeployment(params: {
    platform: 'railway' | 'vercel';
    deploymentId: string;
    workspaceId: string;
    projectId: string;
    storyId?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<DevOpsDeploymentStatus> {
    const timeoutMs = params.timeoutMs || DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = params.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const startTime = Date.now();

    this.logger.log(
      `Monitoring ${params.platform} deployment ${params.deploymentId} (timeout: ${timeoutMs}ms, interval: ${pollIntervalMs}ms)`,
    );

    while (Date.now() - startTime < timeoutMs) {
      try {
        const detail = await this.deploymentMonitoring.getDeploymentDetail(
          params.workspaceId,
          params.projectId,
          params.deploymentId,
          params.platform,
        );

        if (!detail) {
          this.logger.warn(
            `Deployment ${params.deploymentId} not found, continuing to poll`,
          );
        } else {
          const normalizedStatus = (detail.normalizedStatus || detail.status || 'unknown').toLowerCase();

          // Emit progress event
          this.emitMonitoringProgress(
            params.workspaceId,
            params.deploymentId,
            `Deployment status: ${normalizedStatus}`,
            params.storyId || '',
          );

          if (normalizedStatus === 'success') {
            return {
              status: 'success',
              deploymentUrl: detail.deploymentUrl || null,
              deployedAt: detail.completedAt ? new Date(detail.completedAt) : new Date(),
              buildLogs: null,
              error: null,
            };
          }

          if (TERMINAL_STATUSES.has(normalizedStatus) && normalizedStatus !== 'success') {
            return {
              status: 'failed',
              deploymentUrl: detail.deploymentUrl || null,
              deployedAt: null,
              buildLogs: detail.logs || null,
              error: `Deployment ${normalizedStatus}: ${detail.status}`,
            };
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Error polling deployment ${params.deploymentId}: ${error?.message}`,
        );
      }

      // Wait before next poll
      await this.sleep(pollIntervalMs);
    }

    // Timeout
    this.logger.error(
      `Deployment ${params.deploymentId} timed out after ${timeoutMs}ms`,
    );

    return {
      status: 'timeout',
      deploymentUrl: null,
      deployedAt: null,
      buildLogs: null,
      error: `Deployment timed out after ${timeoutMs}ms`,
    };
  }

  /**
   * Emit monitoring progress event for WebSocket.
   */
  private emitMonitoringProgress(
    workspaceId: string,
    deploymentId: string,
    details: string,
    storyId: string,
  ): void {
    this.eventEmitter.emit('devops-agent:progress', {
      type: 'devops-agent:progress',
      sessionId: deploymentId,
      storyId,
      workspaceId,
      step: 'monitoring-deployment',
      status: 'started',
      details,
      percentage: 60,
      timestamp: new Date(),
    } as DevOpsAgentProgressEvent);
  }

  /**
   * Sleep utility for polling interval.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
