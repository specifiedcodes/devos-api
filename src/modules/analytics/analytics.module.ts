import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAggregate } from './entities/analytics-aggregate.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsCalculationService } from './services/analytics-calculation.service';
import { ProjectAnalyticsService } from './services/project-analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { ProjectAnalyticsController } from './controllers/project-analytics.controller';
import { Story } from '../../database/entities/story.entity';
import { Sprint } from '../../database/entities/sprint.entity';
import { Agent } from '../../database/entities/agent.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsEvent,
      AnalyticsAggregate,
      Story,
      Sprint,
      Agent,
    ]),
  ],
  controllers: [AnalyticsController, ProjectAnalyticsController],
  providers: [AnalyticsEventsService, AnalyticsCalculationService, ProjectAnalyticsService],
  exports: [AnalyticsEventsService, AnalyticsCalculationService, ProjectAnalyticsService],
})
export class AnalyticsModule {}
