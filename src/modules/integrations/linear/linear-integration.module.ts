/**
 * LinearIntegrationModule
 * Story 21.5: Linear Two-Way Sync (AC9)
 *
 * NestJS module encapsulating all Linear integration components:
 * - LinearApiClientService for Linear GraphQL API communication
 * - LinearOAuthService for OAuth flow and configuration management
 * - LinearSyncService for bidirectional synchronization
 * - LinearStoryListenerService for event-driven sync triggers
 * - LinearSyncProcessor for async BullMQ job processing
 * - LinearIntegrationController for REST API
 * - LinearWebhookController for Linear webhook events
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { LinearSyncItem } from '../../../database/entities/linear-sync-item.entity';
import { Story } from '../../../database/entities/story.entity';
import { LinearIntegrationController } from './controllers/linear-integration.controller';
import { LinearWebhookController } from './controllers/linear-webhook.controller';
import { LinearApiClientService } from './services/linear-api-client.service';
import { LinearOAuthService } from './services/linear-oauth.service';
import { LinearSyncService } from './services/linear-sync.service';
import { LinearStoryListenerService } from './services/linear-story-listener.service';
import { LinearSyncProcessor } from './processors/linear-sync.processor';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LinearIntegration, LinearSyncItem, Story]),
    BullModule.registerQueue({
      name: 'linear-sync',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 }, // 24 hours
        removeOnFail: { age: 604800 }, // 7 days
      },
    }),
    EncryptionModule,
    RedisModule,
  ],
  controllers: [LinearIntegrationController, LinearWebhookController],
  providers: [
    LinearApiClientService,
    LinearOAuthService,
    LinearSyncService,
    LinearSyncProcessor,
    LinearStoryListenerService,
  ],
  exports: [LinearOAuthService, LinearSyncService, LinearStoryListenerService],
})
export class LinearIntegrationModule {}
