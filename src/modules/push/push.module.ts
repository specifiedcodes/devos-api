/**
 * Push Notification Module
 * Story 10.4: Push Notifications Setup
 *
 * NestJS module for Web Push API integration.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { PushNotificationService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscription]),
    ConfigModule,
  ],
  controllers: [PushController],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushModule {}
