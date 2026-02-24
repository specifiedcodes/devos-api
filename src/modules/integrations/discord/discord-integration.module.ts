/**
 * DiscordIntegrationModule
 * Story 21.3: Discord Webhook Integration (AC5)
 *
 * Dedicated module for Epic 21 Discord integration components:
 * - DiscordNotificationConfigService for per-event notification routing
 *
 * Existing Story 16.5 notification components remain in NotificationsModule.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { DiscordNotificationConfig } from '../../../database/entities/discord-notification-config.entity';
import { DiscordNotificationConfigService } from './services/discord-notification-config.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordIntegration, DiscordNotificationConfig]),
    forwardRef(() => NotificationsModule),
    EncryptionModule,
    RedisModule,
  ],
  providers: [DiscordNotificationConfigService],
  exports: [DiscordNotificationConfigService],
})
export class DiscordIntegrationModule {}
