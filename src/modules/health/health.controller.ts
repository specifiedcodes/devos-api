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
