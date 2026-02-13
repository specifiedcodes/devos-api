import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAggregate } from './entities/analytics-aggregate.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsCalculationService } from './services/analytics-calculation.service';
import { AnalyticsController } from './controllers/analytics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsEvent, AnalyticsAggregate])],
  controllers: [AnalyticsController],
  providers: [AnalyticsEventsService, AnalyticsCalculationService],
  exports: [AnalyticsEventsService, AnalyticsCalculationService],
})
export class AnalyticsModule {}
