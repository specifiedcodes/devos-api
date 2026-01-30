import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from '../../database/entities/usage-record.entity';
import { UsageTrackingService } from './services/usage-tracking.service';
import { UsageController } from './controllers/usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UsageRecord])],
  providers: [UsageTrackingService],
  controllers: [UsageController],
  exports: [UsageTrackingService],
})
export class UsageModule {}
