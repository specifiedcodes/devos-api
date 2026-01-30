import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from '../../database/entities/usage-record.entity';
import { ApiUsage } from '../../database/entities/api-usage.entity';
import { UsageTrackingService } from './services/usage-tracking.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { UsageController } from './controllers/usage.controller';
import { UsageV2Controller } from './controllers/usage-v2.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageRecord, ApiUsage]),
    RedisModule,
  ],
  providers: [UsageTrackingService, UsageService, PricingService],
  controllers: [UsageController, UsageV2Controller],
  exports: [UsageTrackingService, UsageService, PricingService],
})
export class UsageModule {}
