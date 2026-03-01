import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAggregate } from './entities/analytics-aggregate.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsCalculationService } from './services/analytics-calculation.service';
import { ProjectAnalyticsService } from './services/project-analytics.service';
import { AgentPerformanceService } from './services/agent-performance.service';
import { CostAnalyticsService } from './services/cost-analytics.service';
import { CumulativeFlowService } from './services/cumulative-flow.service';
import { ScheduledReportsService } from './services/scheduled-reports.service';
import { ReportGeneratorService } from './services/report-generator.service';
import { ExportService } from './services/export.service';
import { ReportScheduler } from './schedulers/report.scheduler';
import { AnalyticsController } from './controllers/analytics.controller';
import { ProjectAnalyticsController } from './controllers/project-analytics.controller';
import { AdvancedAnalyticsController } from './controllers/advanced-analytics.controller';
import { Story } from '../../database/entities/story.entity';
import { Sprint } from '../../database/entities/sprint.entity';
import { Agent } from '../../database/entities/agent.entity';
import { ApiUsage } from '../../database/entities/api-usage.entity';
import { ScheduledReport } from '../../database/entities/scheduled-report.entity';
import { SprintMetric } from '../../database/entities/sprint-metric.entity';
import { VelocityMetric } from '../../database/entities/velocity-metric.entity';
import { Project } from '../../database/entities/project.entity';
import { SprintsModule } from '../sprints/sprints.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsEvent,
      AnalyticsAggregate,
      Story,
      Sprint,
      Agent,
      ApiUsage,
      ScheduledReport,
      SprintMetric,
      VelocityMetric,
      Project,
    ]),
    SprintsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AnalyticsController,
    ProjectAnalyticsController,
    AdvancedAnalyticsController,
  ],
  providers: [
    AnalyticsEventsService,
    AnalyticsCalculationService,
    ProjectAnalyticsService,
    AgentPerformanceService,
    CostAnalyticsService,
    CumulativeFlowService,
    ScheduledReportsService,
    ReportGeneratorService,
    ExportService,
    ReportScheduler,
  ],
  exports: [
    AnalyticsEventsService,
    AnalyticsCalculationService,
    ProjectAnalyticsService,
    AgentPerformanceService,
    CostAnalyticsService,
    CumulativeFlowService,
    ScheduledReportsService,
    ReportGeneratorService,
    ExportService,
  ],
})
export class AnalyticsModule {}
