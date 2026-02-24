/**
 * NotificationsModule
 * Story 10.5: Notification Triggers
 * Story 10.6: Configurable Notification Preferences
 * Story 16.4: Slack Notification Integration
 * Story 16.5: Discord Notification Integration
 * Story 16.6: Production Email Service
 *
 * NestJS module for notification trigger system.
 * Integrates with EventEmitter2, BullMQ, Push, In-App, Slack, Discord, and Email notifications.
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

// Slack services (Story 16.4)
import { SlackNotificationService } from './services/slack-notification.service';
import { SlackOAuthService } from './services/slack-oauth.service';
import { SlackBlockBuilderService } from './services/slack-block-builder.service';

// Discord services (Story 16.5)
import { DiscordNotificationService } from './services/discord-notification.service';
import { DiscordEmbedBuilderService } from './services/discord-embed-builder.service';

// Controllers
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { SlackNotificationController } from './controllers/slack-notification.controller';
import { DiscordNotificationController } from './controllers/discord-notification.controller';

// Processors
import {
  NotificationBatchProcessor,
  NOTIFICATION_BATCH_QUEUE,
} from './processors/notification-batch.processor';
import {
  SlackMessageProcessor,
  SLACK_NOTIFICATIONS_QUEUE,
} from './processors/slack-message.processor';
import {
  DiscordMessageProcessor,
  DISCORD_NOTIFICATIONS_QUEUE,
} from './processors/discord-message.processor';

// Entities
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { Project } from '../../database/entities/project.entity';
import { NotificationPreferences } from '../../database/entities/notification-preferences.entity';
import { SlackIntegration } from '../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../database/entities/discord-integration.entity';
import { DiscordNotificationConfig } from '../../database/entities/discord-notification-config.entity';

// Story 21.3: Discord notification config service
import { DiscordNotificationConfigService } from '../integrations/discord/services/discord-notification-config.service';

// Story 21.1: Slack user mapping service (imported from SlackIntegrationModule)
import { SlackUserMappingService } from '../integrations/slack/services/slack-user-mapping.service';
import { SlackNotificationConfigService } from '../integrations/slack/services/slack-notification-config.service';
import { SlackUserMapping } from '../../database/entities/slack-user-mapping.entity';
import { SlackNotificationConfig } from '../../database/entities/slack-notification-config.entity';
import { SlackInteractionLog } from '../../database/entities/slack-interaction-log.entity';
import { User } from '../../database/entities/user.entity';

// Related Modules
import { PushModule } from '../push/push.module';
import { NotificationModule } from '../notification/notification.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RedisModule } from '../redis/redis.module';
import { EmailModule } from '../email/email.module';
import { EncryptionModule } from '../../shared/encryption/encryption.module';

@Module({
  imports: [
    // Note: EventEmitterModule.forRoot() should be in app.module.ts
    // This module only needs EventEmitterModule features, not forRoot()

    // TypeORM for subscription, project, preferences, and Slack integration queries
    TypeOrmModule.forFeature([PushSubscription, Project, NotificationPreferences, SlackIntegration, DiscordIntegration, DiscordNotificationConfig, SlackUserMapping, SlackNotificationConfig, SlackInteractionLog, User]),

    // Story 21.1: Encryption module for user mapping service
    EncryptionModule,

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

    // BullMQ queue for Slack message delivery (Story 16.4)
    BullModule.registerQueue({
      name: SLACK_NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),

    // BullMQ queue for Discord message delivery (Story 16.5)
    BullModule.registerQueue({
      name: DISCORD_NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    }),

    // Related modules
    PushModule,
    NotificationModule,
    WorkspacesModule,
    RedisModule,
    EmailModule, // Story 16.6: Email notification support
  ],
  controllers: [
    NotificationPreferencesController,
    SlackNotificationController,
    DiscordNotificationController,
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

    // Slack services (Story 16.4)
    SlackNotificationService,
    SlackOAuthService,
    SlackBlockBuilderService,

    // Discord services (Story 16.5)
    DiscordNotificationService,
    DiscordEmbedBuilderService,

    // Story 21.1: Slack user mapping service
    SlackUserMappingService,

    // Story 21.2: Slack notification config service
    SlackNotificationConfigService,

    // Story 21.3: Discord notification config service
    DiscordNotificationConfigService,

    // BullMQ processors
    NotificationBatchProcessor,
    SlackMessageProcessor,
    DiscordMessageProcessor,
  ],
  exports: [
    NotificationTriggerService,
    NotificationDispatchService,
    NotificationTemplateService,
    NotificationRecipientResolver,
    NotificationPreferencesService,
    QuietHoursService,
    SlackNotificationService,
    SlackOAuthService,
    SlackUserMappingService,
    SlackNotificationConfigService,
    DiscordNotificationService,
    DiscordNotificationConfigService,
  ],
})
export class NotificationsModule {}
