import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { HealthCheckService } from './health.service';
import { HealthController } from './health.controller';
import { HealthHistoryService } from './health-history.service';
import { HealthMetricsService } from './health-metrics.service';

/**
 * HealthModule
 * Story 14.5: Health Check Dashboard (AC6)
 *
 * Provides comprehensive health monitoring for the DevOS platform.
 * Includes liveness/readiness probes, health history tracking,
 * and Prometheus health metrics.
 *
 * Dependencies:
 * - TerminusModule: NestJS health check framework
 * - RedisModule: Global - for health history storage and Redis probes
 * - MetricsModule: Global - for Prometheus metric registration
 * - ScheduleModule: Already imported in AppModule for cron jobs
 * - BullModule: For BullMQ queue health probes
 * - TypeORM DataSource: Automatically available for database probes
 */
@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({
      name: 'agent-tasks',
    }),
  ],
  controllers: [HealthController],
  providers: [HealthCheckService, HealthHistoryService, HealthMetricsService],
  exports: [HealthCheckService],
})
export class HealthModule {}
