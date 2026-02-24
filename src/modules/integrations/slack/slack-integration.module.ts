/**
 * SlackIntegrationModule
 * Story 21.1: Slack OAuth Integration (AC9)
 *
 * Dedicated module for Epic 21 Slack integration components:
 * - SlackEventsController for Events API and Interactive Components
 * - SlackUserMappingService for user mapping between Slack and DevOS
 *
 * Existing Story 16.4 notification components remain in NotificationsModule.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { SlackUserMapping } from '../../../database/entities/slack-user-mapping.entity';
import { User } from '../../../database/entities/user.entity';
import { SlackEventsController } from './controllers/slack-events.controller';
import { SlackUserMappingService } from './services/slack-user-mapping.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlackIntegration, SlackUserMapping, User]),
    forwardRef(() => NotificationsModule),
    EncryptionModule,
    RedisModule,
  ],
  controllers: [SlackEventsController],
  providers: [SlackUserMappingService],
  exports: [SlackUserMappingService],
})
export class SlackIntegrationModule {}
