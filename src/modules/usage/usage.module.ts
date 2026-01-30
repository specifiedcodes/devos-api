import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from '../../database/entities/usage-record.entity';
import { ApiUsage } from '../../database/entities/api-usage.entity';
import { UsageTrackingService } from './services/usage-tracking.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { UsageV2Controller } from './controllers/usage-v2.controller';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../../shared/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageRecord, ApiUsage]),
    RedisModule,
    AuditModule,
  ],
  providers: [UsageTrackingService, UsageService, PricingService],
  controllers: [UsageV2Controller],
  exports: [UsageTrackingService, UsageService, PricingService],
})
export class UsageModule {}
