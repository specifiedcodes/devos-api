import { Injectable, Logger } from '@nestjs/common';
import { Gauge, Histogram, Counter } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';
import { HealthCheckResult } from './dto/health-check.dto';

/**
 * HealthMetricsService
 * Story 14.5: Health Check Dashboard (AC5)
 *
 * Registers and updates health-specific Prometheus metrics
 * using the existing MetricsService registry.
 */
@Injectable()
export class HealthMetricsService {
  private readonly logger = new Logger(HealthMetricsService.name);

  private readonly healthCheckStatus: Gauge;
  private readonly healthCheckDuration: Histogram;
  private readonly healthCheckTotal: Counter;
  private readonly dependencyUp: Gauge;
  private readonly uptimePercentage: Gauge;

  constructor(private readonly metricsService: MetricsService) {
    const registry = this.metricsService.getRegistry();

    this.healthCheckStatus = new Gauge({
      name: 'devos_health_check_status',
      help: 'Health check status (1=healthy, 0.5=degraded, 0=unhealthy)',
      labelNames: ['service'],
      registers: [registry],
    });

    this.healthCheckDuration = new Histogram({
      name: 'devos_health_check_duration_seconds',
      help: 'Health check probe duration in seconds',
      labelNames: ['service'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    this.healthCheckTotal = new Counter({
      name: 'devos_health_check_total',
      help: 'Total health checks executed',
      labelNames: ['service', 'status'],
      registers: [registry],
    });

    this.dependencyUp = new Gauge({
      name: 'devos_dependency_up',
      help: 'Dependency availability (1=up, 0=down)',
      labelNames: ['dependency'],
      registers: [registry],
    });

    this.uptimePercentage = new Gauge({
      name: 'devos_uptime_percentage',
      help: 'Uptime percentage for time windows',
      labelNames: ['window'],
      registers: [registry],
    });
  }

  /**
   * Update all Prometheus metrics after a health check.
   */
  updateMetrics(result: HealthCheckResult): void {
    try {
      for (const [serviceName, probe] of Object.entries(result.services)) {
        // Update status gauge
        const statusValue = this.statusToValue(probe.status);
        this.healthCheckStatus.set({ service: serviceName }, statusValue);

        // Record duration in histogram (convert ms to seconds)
        if (probe.responseTimeMs >= 0) {
          this.healthCheckDuration.observe(
            { service: serviceName },
            probe.responseTimeMs / 1000,
          );
        }

        // Increment total counter
        this.healthCheckTotal.inc({
          service: serviceName,
          status: probe.status,
        });

        // Update dependency up/down gauge
        this.dependencyUp.set(
          { dependency: serviceName },
          probe.status !== 'unhealthy' ? 1 : 0,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to update health metrics', (error as any)?.message);
    }
  }

  /**
   * Update uptime percentage metrics.
   */
  updateUptimeMetrics(
    windows: Record<string, number>,
  ): void {
    try {
      for (const [windowName, percentage] of Object.entries(windows)) {
        this.uptimePercentage.set({ window: windowName }, percentage);
      }
    } catch (error) {
      this.logger.warn(
        'Failed to update uptime metrics',
        (error as any)?.message,
      );
    }
  }

  private statusToValue(
    status: 'healthy' | 'degraded' | 'unhealthy',
  ): number {
    switch (status) {
      case 'healthy':
        return 1;
      case 'degraded':
        return 0.5;
      case 'unhealthy':
        return 0;
      default:
        return 0;
    }
  }
}
