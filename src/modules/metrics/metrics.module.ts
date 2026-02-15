import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
import { AuthMetricsService } from './services/auth-metrics.service';
import { BusinessMetricsService } from './services/business-metrics.service';
import { DatabaseMetricsService } from './services/database-metrics.service';
import { RedisMetricsService } from './services/redis-metrics.service';
import { QueueMetricsService } from './services/queue-metrics.service';

/**
 * MetricsModule
 * Story 14.1: Prometheus Metrics Exporter
 *
 * Global NestJS module that configures prom-client with default metrics collection.
 * Exposes /metrics endpoint and provides metric services for all domains.
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'agent-tasks',
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    AuthMetricsService,
    BusinessMetricsService,
    DatabaseMetricsService,
    RedisMetricsService,
    QueueMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [
    MetricsService,
    AuthMetricsService,
    BusinessMetricsService,
    DatabaseMetricsService,
    RedisMetricsService,
    QueueMetricsService,
  ],
})
export class MetricsModule {}
