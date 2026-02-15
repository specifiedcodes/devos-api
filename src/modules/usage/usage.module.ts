import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from '../../database/entities/usage-record.entity';
import { ApiUsage } from '../../database/entities/api-usage.entity';
import { WorkspaceSettings } from '../../database/entities/workspace-settings.entity';
import { UsageTrackingService } from './services/usage-tracking.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { SpendingAlertService } from './services/spending-alert.service';
import { SpendCapService } from './services/spend-cap.service';
import { SpendCapEnforcementService } from './services/spend-cap-enforcement.service';
import { CsvExportService } from './services/csv-export.service';
import { SpendingAlertJob } from './jobs/spending-alert.job';
import { SpendCapThresholdListener } from './listeners/spend-cap-threshold.listener';
import { UsageV2Controller } from './controllers/usage-v2.controller';
import { UsageHealthController } from './controllers/usage-health.controller';
import { SpendCapController } from './controllers/spend-cap.controller';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageRecord, ApiUsage, WorkspaceSettings]),
    RedisModule,
    AuditModule,
    forwardRef(() => NotificationModule),
    EmailModule,
  ],
  providers: [
    UsageTrackingService,
    UsageService,
    PricingService,
    SpendingAlertService,
    SpendCapService,
    SpendCapEnforcementService,
    CsvExportService,
    SpendingAlertJob,
    SpendCapThresholdListener,
  ],
  controllers: [UsageV2Controller, UsageHealthController, SpendCapController],
  exports: [
    UsageTrackingService,
    UsageService,
    PricingService,
    SpendingAlertService,
    SpendCapService,
    SpendCapEnforcementService,
  ],
})
export class UsageModule {}
