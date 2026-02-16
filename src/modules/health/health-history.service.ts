import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { HealthCheckService } from './health.service';
import { HealthMetricsService } from './health-metrics.service';
import {
  HealthHistoryEntry,
  HealthIncident,
} from './dto/health-check.dto';

const HEALTH_HISTORY_KEY = 'health:history';
const MAX_RETENTION_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * HealthHistoryService
 * Story 14.5: Health Check Dashboard (AC4)
 *
 * Tracks health check results over time using Redis sorted sets.
 * Provides history retrieval, uptime percentage calculation,
 * and incident detection for the health dashboard.
 */
@Injectable()
export class HealthHistoryService {
  private readonly logger = new Logger(HealthHistoryService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly healthCheckService: HealthCheckService,
    private readonly healthMetricsService: HealthMetricsService,
  ) {}

  /**
   * Scheduled health check every 60 seconds.
   * Records results to Redis sorted set and updates Prometheus metrics.
   */
  @Cron('0 * * * * *')
  async recordHealthCheck(): Promise<void> {
    try {
      const result = await this.healthCheckService.checkHealth();

      const entry: HealthHistoryEntry = {
        timestamp: result.timestamp,
        overallStatus: result.status,
        services: Object.fromEntries(
          Object.entries(result.services).map(([key, val]) => [
            key,
            val.status,
          ]),
        ),
        totalResponseTimeMs: Object.values(result.services).reduce(
          (sum, s) => sum + Math.max(0, s.responseTimeMs),
          0,
        ),
      };

      // Store in Redis sorted set with timestamp as score
      const score = new Date(result.timestamp).getTime();
      await this.redisService.zadd(
        HEALTH_HISTORY_KEY,
        score,
        JSON.stringify(entry),
      );

      // Prune entries older than 24 hours
      const cutoff = Date.now() - MAX_RETENTION_SECONDS * 1000;
      await this.redisService.zremrangebyscore(
        HEALTH_HISTORY_KEY,
        '-inf',
        cutoff,
      );

      // Update Prometheus metrics
      this.healthMetricsService.updateMetrics(result);
    } catch (error) {
      this.logger.warn(
        'Failed to record health check to history',
        (error as any)?.message,
      );
      // Graceful handling when Redis unavailable
    }
  }

  /**
   * Get health history entries for a given duration window.
   */
  async getHistory(
    duration: '1h' | '6h' | '24h',
  ): Promise<HealthHistoryEntry[]> {
    const durationMs = this.durationToMs(duration);
    const minScore = Date.now() - durationMs;

    try {
      const entries = await this.redisService.zrangebyscore(
        HEALTH_HISTORY_KEY,
        minScore,
        '+inf',
      );

      return entries.map((entry) => JSON.parse(entry));
    } catch (error: any) {
      this.logger.warn('Failed to retrieve health history', error?.message);
      return [];
    }
  }

  /**
   * Calculate uptime percentage for a given duration window.
   * Uptime = healthy entries / total entries * 100
   */
  async getUptimePercentage(duration: '1h' | '6h' | '24h'): Promise<number> {
    const entries = await this.getHistory(duration);

    if (entries.length === 0) {
      return 100; // No data = assume healthy
    }

    const healthyCount = entries.filter(
      (e) => e.overallStatus === 'healthy',
    ).length;

    return Number(((healthyCount / entries.length) * 100).toFixed(2));
  }

  /**
   * Get incidents (contiguous periods of degraded/unhealthy status).
   */
  async getIncidents(
    duration: '1h' | '6h' | '24h',
  ): Promise<HealthIncident[]> {
    const entries = await this.getHistory(duration);
    const incidents: HealthIncident[] = [];

    if (entries.length === 0) {
      return incidents;
    }

    let currentIncident: HealthIncident | null = null;

    for (const entry of entries) {
      if (entry.overallStatus !== 'healthy') {
        // Start or continue incident
        const affectedServices = Object.entries(entry.services)
          .filter(([, status]) => status !== 'healthy')
          .map(([name]) => name);

        if (!currentIncident) {
          currentIncident = {
            startedAt: entry.timestamp,
            resolvedAt: null,
            duration: 0,
            affectedServices,
            severity: entry.overallStatus as 'degraded' | 'unhealthy',
          };
        } else {
          // Update severity to worst seen
          if (
            entry.overallStatus === 'unhealthy' &&
            currentIncident.severity === 'degraded'
          ) {
            currentIncident.severity = 'unhealthy';
          }
          // Merge affected services
          for (const svc of affectedServices) {
            if (!currentIncident.affectedServices.includes(svc)) {
              currentIncident.affectedServices.push(svc);
            }
          }
        }
      } else if (currentIncident) {
        // Resolve the current incident
        currentIncident.resolvedAt = entry.timestamp;
        currentIncident.duration = Math.round(
          (new Date(entry.timestamp).getTime() -
            new Date(currentIncident.startedAt).getTime()) /
            1000,
        );
        incidents.push(currentIncident);
        currentIncident = null;
      }
    }

    // If there's an ongoing incident
    if (currentIncident) {
      currentIncident.duration = Math.round(
        (Date.now() - new Date(currentIncident.startedAt).getTime()) / 1000,
      );
      incidents.push(currentIncident);
    }

    return incidents;
  }

  private durationToMs(duration: '1h' | '6h' | '24h'): number {
    switch (duration) {
      case '1h':
        return 60 * 60 * 1000;
      case '6h':
        return 6 * 60 * 60 * 1000;
      case '24h':
        return 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }
}
