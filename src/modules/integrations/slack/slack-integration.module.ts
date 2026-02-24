/**
 * SlackIntegrationModule
 * Story 21.1: Slack OAuth Integration (AC9)
 * Story 21.2: Slack Interactive Components (AC10)
 *
 * Dedicated module for Epic 21 Slack integration components:
 * - SlackEventsController for Events API, Interactive Components, and Slash Commands
 * - SlackUserMappingService for user mapping between Slack and DevOS
 * - SlackInteractionHandlerService for processing interactive payloads
 * - SlackNotificationConfigService for per-project notification routing
 *
 * Existing Story 16.4 notification components remain in NotificationsModule.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { SlackUserMapping } from '../../../database/entities/slack-user-mapping.entity';
import { SlackNotificationConfig } from '../../../database/entities/slack-notification-config.entity';
import { SlackInteractionLog } from '../../../database/entities/slack-interaction-log.entity';
import { User } from '../../../database/entities/user.entity';
import { SlackEventsController } from './controllers/slack-events.controller';
import { SlackUserMappingService } from './services/slack-user-mapping.service';
import { SlackInteractionHandlerService } from './services/slack-interaction-handler.service';
import { SlackNotificationConfigService } from './services/slack-notification-config.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SlackIntegration,
      SlackUserMapping,
      SlackNotificationConfig,
      SlackInteractionLog,
      User,
    ]),
    forwardRef(() => NotificationsModule),
    EncryptionModule,
    RedisModule,
  ],
  controllers: [SlackEventsController],
  providers: [
    SlackUserMappingService,
    SlackInteractionHandlerService,
    SlackNotificationConfigService,
  ],
  exports: [
    SlackUserMappingService,
    SlackInteractionHandlerService,
    SlackNotificationConfigService,
  ],
})
export class SlackIntegrationModule {}
