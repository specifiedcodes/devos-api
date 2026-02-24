/**
 * DiscordIntegrationModule
 * Story 21.3: Discord Webhook Integration (AC5)
 * Story 21.4: Discord Bot (Optional) (AC7)
 *
 * Dedicated module for Epic 21 Discord integration components:
 * - DiscordNotificationConfigService for per-event notification routing
 * - DiscordBotGatewayService for bot configuration and slash command registration
 * - DiscordUserLinkService for Discord-to-DevOS user mapping
 * - DiscordCommandHandlerService for slash command processing
 * - DiscordBotController for bot REST endpoints
 *
 * Existing Story 16.5 notification components remain in NotificationsModule.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { DiscordNotificationConfig } from '../../../database/entities/discord-notification-config.entity';
import { DiscordBotConfig } from '../../../database/entities/discord-bot-config.entity';
import { DiscordUserLink } from '../../../database/entities/discord-user-link.entity';
import { DiscordInteractionLog } from '../../../database/entities/discord-interaction-log.entity';
import { User } from '../../../database/entities/user.entity';
import { DiscordNotificationConfigService } from './services/discord-notification-config.service';
import { DiscordBotGatewayService } from './services/discord-bot-gateway.service';
import { DiscordUserLinkService } from './services/discord-user-link.service';
import { DiscordCommandHandlerService } from './services/discord-command-handler.service';
import { DiscordBotController } from './controllers/discord-bot.controller';
import { NotificationsModule } from '../../notifications/notifications.module';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DiscordIntegration,
      DiscordNotificationConfig,
      DiscordBotConfig,
      DiscordUserLink,
      DiscordInteractionLog,
      User,
    ]),
    forwardRef(() => NotificationsModule),
    EncryptionModule,
    RedisModule,
  ],
  controllers: [
    DiscordBotController,
  ],
  providers: [
    DiscordNotificationConfigService,
    DiscordBotGatewayService,
    DiscordUserLinkService,
    DiscordCommandHandlerService,
  ],
  exports: [
    DiscordNotificationConfigService,
    DiscordBotGatewayService,
    DiscordUserLinkService,
    DiscordCommandHandlerService,
  ],
})
export class DiscordIntegrationModule {}
