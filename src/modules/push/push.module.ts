/**
 * Push Notification Module
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (VapidKeyService, CleanupService, ScheduleModule)
 *
 * NestJS module for Web Push API integration.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { PushNotificationService } from './push.service';
import { VapidKeyService } from './services/vapid-key.service';
import { PushSubscriptionCleanupService } from './services/push-subscription-cleanup.service';
import { PushController } from './push.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscription]),
    ConfigModule,
    ScheduleModule, // forRoot() is already called in AppModule
  ],
  controllers: [PushController],
  providers: [
    VapidKeyService,
    PushNotificationService,
    PushSubscriptionCleanupService,
  ],
  exports: [PushNotificationService, VapidKeyService],
})
export class PushModule {}
