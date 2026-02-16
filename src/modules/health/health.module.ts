import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HealthCheckService } from './health.service';
import { HealthController } from './health.controller';
import { HealthHistoryService } from './health-history.service';
import { HealthMetricsService } from './health-metrics.service';
import { IncidentQueryService } from './incident-query.service';
import { Incident } from '../../database/entities/incident.entity';
import { IncidentUpdate } from '../../database/entities/incident-update.entity';

/**
 * HealthModule
 * Story 14.5: Health Check Dashboard (AC6)
 * Story 14.9: Incident Management (AC11) - Added Incident entities for public status endpoints
 *
 * Provides comprehensive health monitoring for the DevOS platform.
 * Includes liveness/readiness probes, health history tracking,
 * Prometheus health metrics, and public incident status endpoints.
 *
 * Dependencies:
 * - TerminusModule: NestJS health check framework
 * - RedisModule: Global - for health history storage and Redis probes
 * - MetricsModule: Global - for Prometheus metric registration
 * - ScheduleModule: Already imported in AppModule for cron jobs
 * - BullModule: For BullMQ queue health probes
 * - TypeORM DataSource: Automatically available for database probes
 * - Incident/IncidentUpdate: For public status endpoints (Story 14.9)
 */
@Module({
  imports: [
    TerminusModule,
    TypeOrmModule.forFeature([Incident, IncidentUpdate]),
    BullModule.registerQueue({
      name: 'agent-tasks',
    }),
  ],
  controllers: [HealthController],
  providers: [HealthCheckService, HealthHistoryService, HealthMetricsService, IncidentQueryService],
  exports: [HealthCheckService],
})
export class HealthModule {}
