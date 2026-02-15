import { Injectable, OnModuleInit } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { MetricsService } from './modules/metrics/metrics.service';

/**
 * AppService
 * Enhanced with Prometheus health metrics (Story 14.1)
 */
@Injectable()
export class AppService implements OnModuleInit {
  private readonly healthCheckStatus: Gauge;
  private readonly uptimeSeconds: Gauge;
  private readonly appInfo: Gauge;

  constructor(private readonly metricsService: MetricsService) {
    const registry = this.metricsService.getRegistry();

    this.healthCheckStatus = new Gauge({
      name: 'devos_health_check_status',
      help: 'Health check status (1=healthy, 0=unhealthy)',
      registers: [registry],
    });

    this.uptimeSeconds = new Gauge({
      name: 'devos_uptime_seconds',
      help: 'Process uptime in seconds',
      registers: [registry],
    });

    this.appInfo = new Gauge({
      name: 'devos_app_info',
      help: 'Application information',
      labelNames: ['version', 'node_version', 'environment'],
      registers: [registry],
    });
  }

  onModuleInit() {
    // Set app info gauge to 1 on initialization
    this.appInfo.set(
      {
        version: process.env.npm_package_version || '0.1.0',
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development',
      },
      1,
    );
  }

  getHello(): string {
    return 'DevOS API is running!';
  }

  getHealth(): {
    status: string;
    timestamp: string;
    uptime: number;
  } {
    const uptime = process.uptime();

    // Update Prometheus gauges
    this.healthCheckStatus.set(1);
    this.uptimeSeconds.set(uptime);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime,
    };
  }
}
