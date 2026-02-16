import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheckService } from './health.service';
import { HealthHistoryService } from './health-history.service';
import { IncidentQueryService } from './incident-query.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  HealthLivenessDto,
  HealthReadinessDto,
  HealthCheckResult,
  HealthProbeResult,
  HealthHistoryResponse,
} from './dto/health-check.dto';

/**
 * HealthController
 * Story 14.5: Health Check Dashboard (AC3)
 *
 * Provides Kubernetes-compatible liveness and readiness probes,
 * plus detailed health endpoints for admin monitoring.
 *
 * All health endpoints are excluded from throttling, request logging,
 * and tracing to avoid noise and circular dependencies.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly healthHistoryService: HealthHistoryService,
    private readonly incidentQueryService: IncidentQueryService,
  ) {}

  /**
   * Liveness Probe: GET /health
   * Returns HTTP 200 if the NestJS process is running.
   * Minimal check: process uptime, memory usage.
   * Used by Kubernetes/Docker for liveness (restart if fails).
   * No authentication required.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getLiveness(): HealthLivenessDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness Probe: GET /health/ready
   * Returns HTTP 200 only when ALL critical dependencies are available.
   * Checks: PostgreSQL, Redis, BullMQ.
   * Returns HTTP 503 if any critical dependency is unhealthy.
   * No authentication required.
   */
  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: Response): Promise<HealthReadinessDto> {
    const checks = await this.healthCheckService.checkReadiness();

    const hasUnhealthy = Object.values(checks).some(
      (check) => check.status === 'unhealthy',
    );

    if (hasUnhealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: Object.fromEntries(
          Object.entries(checks).map(([key, val]) => [
            key,
            {
              status: val.status,
              responseTimeMs: val.responseTimeMs,
              ...(val.error ? { error: val.error } : {}),
            },
          ]),
        ),
      };
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: Object.fromEntries(
        Object.entries(checks).map(([key, val]) => [
          key,
          {
            status: val.status,
            responseTimeMs: val.responseTimeMs,
          },
        ]),
      ),
    };
  }

  /**
   * Detailed Health: GET /health/detailed
   * Returns comprehensive status of ALL dependencies.
   * Requires admin authentication (JWT).
   * HTTP 200 always (status conveyed in body).
   */
  @Get('detailed')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getDetailed(): Promise<HealthCheckResult> {
    return this.healthCheckService.checkHealth();
  }

  /**
   * Health History: GET /health/history?duration=24h
   * Returns health history for the specified duration.
   * Requires admin authentication.
   */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Query('duration') duration: '1h' | '6h' | '24h' = '24h',
  ): Promise<HealthHistoryResponse> {
    const validDurations = ['1h', '6h', '24h'];
    if (!validDurations.includes(duration)) {
      duration = '24h';
    }

    const [entries, uptimePercentage, incidents] = await Promise.all([
      this.healthHistoryService.getHistory(duration),
      this.healthHistoryService.getUptimePercentage(duration),
      this.healthHistoryService.getIncidents(duration),
    ]);

    return {
      duration,
      entries,
      uptimePercentage,
      incidents,
    };
  }

  /**
   * Public Active Incidents: GET /health/incidents
   * Story 14.9: Incident Management (AC6)
   *
   * Returns all active (non-resolved) incidents with their timeline updates.
   * No authentication required (public status page).
   * Ordered by severity (critical first), then createdAt DESC.
   */
  @Get('incidents')
  @HttpCode(HttpStatus.OK)
  async getPublicIncidents() {
    const activeIncidents = await this.incidentQueryService.getActiveIncidents();
    const overallStatus = this.incidentQueryService.derivePlatformStatus(activeIncidents);

    return {
      status: overallStatus,
      activeIncidents,
    };
  }

  /**
   * Public Platform Status: GET /health/status
   * Story 14.9: Incident Management (AC6)
   *
   * Returns aggregated platform status for the public status page.
   * No authentication required.
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getPublicStatus() {
    // Get active incidents and recently resolved via dedicated service
    const [activeIncidents, recentlyResolved] = await Promise.all([
      this.incidentQueryService.getActiveIncidents(),
      this.incidentQueryService.getRecentlyResolvedIncidents(),
    ]);

    // Derive overall platform status from active incidents
    const overallStatus = this.incidentQueryService.derivePlatformStatus(activeIncidents);

    // Get services health from health check
    let healthData: HealthCheckResult | null = null;
    try {
      healthData = await this.healthCheckService.checkHealth();
    } catch {
      // If health check fails, continue without service-level data
    }

    // Build services status combining health checks + incident affected services
    const serviceNames = ['api', 'websocket', 'database', 'redis', 'orchestrator'];
    const affectedServiceSet = new Set<string>();
    for (const incident of activeIncidents) {
      for (const svc of incident.affectedServices) {
        affectedServiceSet.add(svc.toLowerCase());
      }
    }

    // Map service names to health check keys
    const healthCheckKeyMap: Record<string, string> = {
      api: 'database',       // API is operational if this endpoint responds; fallback to database health
      websocket: 'redis',    // WebSocket depends on Redis for pub/sub
      database: 'database',
      redis: 'redis',
      orchestrator: 'bullmq', // Orchestrator depends on BullMQ
    };

    const services: Record<string, string> = {};
    for (const svc of serviceNames) {
      if (affectedServiceSet.has(svc)) {
        // Derive service status from most severe incident affecting it
        const affectingIncidents = activeIncidents.filter((i) =>
          i.affectedServices.some((s) => s.toLowerCase() === svc),
        );
        const hasCritical = affectingIncidents.some((i) => i.severity === 'critical');
        const hasMajor = affectingIncidents.some((i) => i.severity === 'major');
        if (hasCritical) {
          services[svc] = 'major_outage';
        } else if (hasMajor) {
          services[svc] = 'partial_outage';
        } else {
          services[svc] = 'degraded_performance';
        }
      } else if (healthData?.services) {
        // Map service name to its corresponding health check key
        const healthKey = healthCheckKeyMap[svc] || svc;
        const healthStatus = healthData.services[healthKey]?.status;
        services[svc] = healthStatus === 'unhealthy' ? 'major_outage' : 'operational';
      } else {
        services[svc] = 'operational';
      }
    }

    return {
      status: overallStatus,
      activeIncidents,
      recentlyResolved,
      services,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Dependency Health: GET /health/dependencies/:name
   * Returns health for a specific dependency by name.
   * Requires admin authentication.
   * Valid names: database, redis, bullmq, neo4j.
   * Returns 404 for unknown dependency names.
   */
  @Get('dependencies/:name')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getDependencyHealth(
    @Param('name') name: string,
  ): Promise<HealthProbeResult> {
    const validNames = ['database', 'redis', 'bullmq', 'neo4j'];
    if (!validNames.includes(name)) {
      throw new NotFoundException(
        `Unknown dependency: ${name}. Valid names: ${validNames.join(', ')}`,
      );
    }

    const result = await this.healthCheckService.checkDependency(name);
    if (!result) {
      throw new NotFoundException(`Dependency '${name}' not found`);
    }

    return result;
  }
}
