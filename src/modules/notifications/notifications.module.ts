/**
 * NotificationsModule
 * Story 10.5: Notification Triggers
 * Story 10.6: Configurable Notification Preferences
 *
 * NestJS module for notification trigger system.
 * Integrates with EventEmitter2, BullMQ, Push, and In-App notifications.
 * Includes preferences management and quiet hours.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

// Services
import { NotificationTriggerService } from './services/notification-trigger.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { NotificationBatchService } from './services/notification-batch.service';
import { NotificationDispatchService } from './services/notification-dispatch.service';
import { NotificationRecipientResolver } from './services/notification-recipient.resolver';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { QuietHoursService } from './services/quiet-hours.service';

// Controllers
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';

// Processors
import {
  NotificationBatchProcessor,
  NOTIFICATION_BATCH_QUEUE,
} from './processors/notification-batch.processor';

// Entities
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { Project } from '../../database/entities/project.entity';
import { NotificationPreferences } from '../../database/entities/notification-preferences.entity';

// Related Modules
import { PushModule } from '../push/push.module';
import { NotificationModule } from '../notification/notification.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    // Note: EventEmitterModule.forRoot() should be in app.module.ts
    // This module only needs EventEmitterModule features, not forRoot()

    // TypeORM for subscription, project, and preferences queries
    TypeOrmModule.forFeature([PushSubscription, Project, NotificationPreferences]),

    // BullMQ queue for batch processing
    BullModule.registerQueue({
      name: NOTIFICATION_BATCH_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs for debugging
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),

    // Related modules
    PushModule,
    NotificationModule,
    WorkspacesModule,
    RedisModule,
  ],
  controllers: [
    NotificationPreferencesController,
  ],
  providers: [
    // Core services
    NotificationTriggerService,
    NotificationTemplateService,
    NotificationBatchService,
    NotificationDispatchService,
    NotificationRecipientResolver,

    // Preferences services (Story 10.6)
    NotificationPreferencesService,
    QuietHoursService,

    // BullMQ processor
    NotificationBatchProcessor,
  ],
  exports: [
    NotificationTriggerService,
    NotificationDispatchService,
    NotificationTemplateService,
    NotificationRecipientResolver,
    NotificationPreferencesService,
    QuietHoursService,
  ],
})
export class NotificationsModule {}
