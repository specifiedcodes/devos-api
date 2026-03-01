import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Sprint } from '../../database/entities/sprint.entity';
import { Story } from '../../database/entities/story.entity';
import { Project } from '../../database/entities/project.entity';
import { SprintMetric } from '../../database/entities/sprint-metric.entity';
import { VelocityMetric } from '../../database/entities/velocity-metric.entity';
import { SprintsController } from './sprints.controller';
import { SprintMetricsController } from './sprint-metrics.controller';
import { SprintsService } from './sprints.service';
import { SprintMetricsService } from './services/sprint-metrics.service';
import { VelocityMetricsService } from './services/velocity-metrics.service';
import { MetricsScheduler } from './schedulers/metrics.scheduler';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, Story, Project, SprintMetric, VelocityMetric]),
    ScheduleModule.forRoot(),
    RedisModule,
  ],
  controllers: [SprintsController, SprintMetricsController],
  providers: [
    SprintsService,
    SprintMetricsService,
    VelocityMetricsService,
    MetricsScheduler,
  ],
  exports: [SprintsService, SprintMetricsService, VelocityMetricsService],
})
export class SprintsModule {}
