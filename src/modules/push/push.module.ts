/**
 * Push Notification Module
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (VapidKeyService, CleanupService, ScheduleModule)
 * Story 22.7: Mobile Push Notifications (MobilePushService, MobilePushController)
 *
 * NestJS module for Web Push API and Expo mobile push integration.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { PushToken } from '../../database/entities/push-token.entity';
import { MobileNotificationPreferences } from '../../database/entities/mobile-notification-preferences.entity';
import { PushNotificationService } from './push.service';
import { VapidKeyService } from './services/vapid-key.service';
import { PushSubscriptionCleanupService } from './services/push-subscription-cleanup.service';
import { MobilePushService } from './services/mobile-push.service';
import { MobilePushTriggerService } from './services/mobile-push-trigger.service';
import { PushController } from './push.controller';
import { MobilePushController } from './mobile-push.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscription, PushToken, MobileNotificationPreferences]),
    ConfigModule,
    ScheduleModule, // forRoot() is already called in AppModule
  ],
  controllers: [PushController, MobilePushController],
  providers: [
    VapidKeyService,
    PushNotificationService,
    PushSubscriptionCleanupService,
    MobilePushService,
    MobilePushTriggerService,
  ],
  exports: [PushNotificationService, VapidKeyService, MobilePushService, MobilePushTriggerService],
})
export class PushModule {}
