/**
 * DeploymentEventPublisher
 *
 * Publishes deployment lifecycle events to Redis pub/sub channel for real-time
 * streaming to WebSocket clients. Events are consumed by the devos-websocket
 * DeploymentEventsHandler which routes them to workspace-scoped Socket.io rooms.
 *
 * Story 25-1: Deployment WebSocket Event Types & Redis Pub/Sub
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

/**
 * Redis channel used for deployment event pub/sub.
 * The WebSocket server subscribes to this channel.
 */
export const DEPLOYMENT_EVENTS_CHANNEL = 'deployment:events';

/**
 * Sensitive patterns to sanitize from log output before publishing.
 * Prevents token, credential, and connection string leakage.
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Railway tokens
  { pattern: /RAILWAY_TOKEN=[^\s]+/g, replacement: 'RAILWAY_TOKEN=***' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer ***' },
  // PostgreSQL connection strings
  {
    pattern: /postgres(ql)?:\/\/[^@\s]+@[^\s]+/g,
    replacement: 'postgresql://***:***@***',
  },
  // Redis connection strings
  {
    pattern: /redis:\/\/[^@\s]+@[^\s]+/g,
    replacement: 'redis://***:***@***',
  },
  // MySQL connection strings
  {
    pattern: /mysql:\/\/[^@\s]+@[^\s]+/g,
    replacement: 'mysql://***:***@***',
  },
  // MongoDB connection strings
  {
    pattern: /mongodb(\+srv)?:\/\/[^@\s]+@[^\s]+/g,
    replacement: 'mongodb://***:***@***',
  },
  // Variable set commands (mask values)
  {
    pattern: /variable\s+set\s+(\w+)=.*/g,
    replacement: 'variable set $1=***',
  },
  // Generic API key patterns
  {
    pattern: /(api[_-]?key|secret|password|token)\s*[=:]\s*[^\s]+/gi,
    replacement: '$1=***',
  },
];

/**
 * Deployment event types matching the architecture Decision 11 schema.
 */
export type DeploymentEventType =
  | 'deployment:started'
  | 'deployment:status'
  | 'deployment:completed'
  | 'deployment:log'
  | 'deployment:env_changed'
  | 'deployment:service_provisioned'
  | 'deployment:domain_updated';

/**
 * Base structure for all deployment events published to Redis.
 * The WebSocket server uses workspaceId and projectId for room routing.
 */
export interface DeploymentRedisEvent {
  type: DeploymentEventType;
  payload: {
    workspaceId: string;
    projectId: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * DeploymentEventPublisher is an injectable NestJS service that publishes
 * deployment lifecycle events to the `deployment:events` Redis channel.
 *
 * The WebSocket server (devos-websocket) subscribes to this channel and
 * routes events to the appropriate Socket.io rooms based on workspaceId
 * and projectId.
 *
 * Key design decisions:
 * - All events include workspaceId for workspace isolation
 * - Log events are sanitized before publishing (no tokens, connection strings)
 * - Sequence numbers are monotonically increasing per publisher instance
 * - Publishing errors are caught and logged (never thrown) to avoid disrupting
 *   the primary deployment flow
 */
@Injectable()
export class DeploymentEventPublisher {
  private readonly logger = new Logger(DeploymentEventPublisher.name);

  /**
   * Monotonically increasing sequence counter for log event ordering.
   * Resets per publisher instance (acceptable for single-process deployments).
   */
  private sequenceCounter = 0;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Publish a deployment event to the Redis pub/sub channel.
   *
   * All events are JSON-serialized and include workspaceId for routing.
   * Publishing errors are caught and logged to avoid disrupting
   * the deployment flow.
   *
   * @param workspaceId - Workspace that owns the deployment
   * @param event - The deployment event to publish
   */
  async publish(workspaceId: string, event: DeploymentRedisEvent): Promise<void> {
    try {
      // Ensure workspaceId is in the payload for routing
      const eventWithWorkspace: DeploymentRedisEvent = {
        ...event,
        payload: {
          ...event.payload,
          workspaceId,
        },
      };

      const serialized = JSON.stringify(eventWithWorkspace);
      await this.redisService.publish(DEPLOYMENT_EVENTS_CHANNEL, serialized);

      this.logger.debug(
        `Published ${event.type} for project ${event.payload.projectId} in workspace ${workspaceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish deployment event ${event.type}: ${(error as Error).message}`,
      );
    }
  }

  // ============================================================
  // Convenience methods for each event type
  // ============================================================

  /**
   * Emit deployment:started event when a bulk deployment begins.
   */
  async publishDeploymentStarted(
    workspaceId: string,
    projectId: string,
    deploymentId: string,
    services: Array<{ serviceId: string; serviceName: string; serviceType: string }>,
    triggeredBy: string,
    environment: string,
  ): Promise<void> {
    await this.publish(workspaceId, {
      type: 'deployment:started',
      payload: {
        workspaceId,
        projectId,
        deploymentId,
        services,
        triggeredBy,
        environment,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:status event for per-service status changes.
   */
  async publishDeploymentStatus(
    workspaceId: string,
    projectId: string,
    serviceId: string,
    serviceName: string,
    status: string,
    options?: {
      deploymentUrl?: string;
      error?: string;
      progress?: number;
    },
  ): Promise<void> {
    // Clamp progress to 0-100
    const progress =
      options?.progress !== undefined
        ? Math.max(0, Math.min(100, options.progress))
        : undefined;

    await this.publish(workspaceId, {
      type: 'deployment:status',
      payload: {
        workspaceId,
        projectId,
        serviceId,
        serviceName,
        status,
        deploymentUrl: options?.deploymentUrl,
        error: options?.error,
        progress,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:completed event when all services finish deploying.
   */
  async publishDeploymentCompleted(
    workspaceId: string,
    projectId: string,
    deploymentId: string,
    status: 'success' | 'partial_failure' | 'failed',
    services: Array<{
      serviceId: string;
      serviceName: string;
      status: string;
      deploymentUrl?: string;
      buildDurationSeconds?: number;
      deployDurationSeconds?: number;
    }>,
    totalDurationSeconds: number,
  ): Promise<void> {
    await this.publish(workspaceId, {
      type: 'deployment:completed',
      payload: {
        workspaceId,
        projectId,
        deploymentId,
        status,
        services,
        totalDurationSeconds,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:log event for each CLI output line.
   * Lines are sanitized to remove tokens, connection strings, etc.
   * Sequence numbers are monotonically increasing.
   */
  async publishDeploymentLog(
    workspaceId: string,
    projectId: string,
    serviceId: string,
    serviceName: string,
    line: string,
    stream: 'stdout' | 'stderr',
    logType: 'build' | 'deploy' | 'runtime',
  ): Promise<void> {
    const sanitizedLine = DeploymentEventPublisher.sanitizeLogLine(line);

    await this.publish(workspaceId, {
      type: 'deployment:log',
      payload: {
        workspaceId,
        projectId,
        serviceId,
        serviceName,
        line: sanitizedLine,
        stream,
        logType,
        sequence: this.nextSequence(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:env_changed event.
   * Contains variable NAMES only -- never values.
   */
  async publishEnvChanged(
    workspaceId: string,
    projectId: string,
    serviceId: string,
    serviceName: string,
    action: 'set' | 'delete' | 'bulk_update',
    variableNames: string[],
    autoRedeploy: boolean,
  ): Promise<void> {
    await this.publish(workspaceId, {
      type: 'deployment:env_changed',
      payload: {
        workspaceId,
        projectId,
        serviceId,
        serviceName,
        action,
        variableNames,
        autoRedeploy,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:service_provisioned event.
   */
  async publishServiceProvisioned(
    workspaceId: string,
    projectId: string,
    serviceId: string,
    serviceName: string,
    serviceType: string,
    status: 'provisioning' | 'active' | 'failed',
  ): Promise<void> {
    await this.publish(workspaceId, {
      type: 'deployment:service_provisioned',
      payload: {
        workspaceId,
        projectId,
        serviceId,
        serviceName,
        serviceType,
        status,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Emit deployment:domain_updated event.
   */
  async publishDomainUpdated(
    workspaceId: string,
    projectId: string,
    serviceId: string,
    serviceName: string,
    domain: string,
    action: 'added' | 'removed' | 'verified',
    status: 'active' | 'pending_dns' | 'pending_ssl' | 'error',
  ): Promise<void> {
    await this.publish(workspaceId, {
      type: 'deployment:domain_updated',
      payload: {
        workspaceId,
        projectId,
        serviceId,
        serviceName,
        domain,
        action,
        status,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // ============================================================
  // Helper methods
  // ============================================================

  /**
   * Returns the next monotonically increasing sequence number.
   */
  private nextSequence(): number {
    return ++this.sequenceCounter;
  }

  /**
   * Get the current sequence number (for testing).
   */
  getSequenceCounter(): number {
    return this.sequenceCounter;
  }

  /**
   * Sanitize a log line by removing sensitive patterns.
   * Removes tokens, connection strings, API keys, and credential values.
   *
   * @param line - Raw log line from CLI output
   * @returns Sanitized log line safe for streaming to clients
   */
  static sanitizeLogLine(line: string): string {
    let sanitized = line;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  }
}
