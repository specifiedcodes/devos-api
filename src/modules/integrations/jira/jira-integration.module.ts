/**
 * JiraIntegrationModule
 * Story 21.6: Jira Two-Way Sync (AC9)
 *
 * NestJS module encapsulating all Jira integration components:
 * - JiraApiClientService for Jira REST API v3 communication
 * - JiraOAuthService for OAuth 2.0 (3LO) flow and configuration management
 * - JiraSyncService for bidirectional synchronization
 * - JiraStoryListenerService for event-driven sync triggers
 * - JiraSyncProcessor for async BullMQ job processing
 * - JiraIntegrationController for REST API
 * - JiraWebhookController for Jira webhook events
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { JiraSyncItem } from '../../../database/entities/jira-sync-item.entity';
import { Story } from '../../../database/entities/story.entity';
import { JiraIntegrationController } from './controllers/jira-integration.controller';
import { JiraWebhookController } from './controllers/jira-webhook.controller';
import { JiraApiClientService } from './services/jira-api-client.service';
import { JiraOAuthService } from './services/jira-oauth.service';
import { JiraSyncService } from './services/jira-sync.service';
import { JiraStoryListenerService } from './services/jira-story-listener.service';
import { JiraSyncProcessor } from './processors/jira-sync.processor';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JiraIntegration, JiraSyncItem, Story]),
    BullModule.registerQueue({
      name: 'jira-sync',
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
  controllers: [JiraIntegrationController, JiraWebhookController],
  providers: [
    JiraApiClientService,
    JiraOAuthService,
    JiraSyncService,
    JiraSyncProcessor,
    JiraStoryListenerService,
  ],
  exports: [JiraOAuthService, JiraSyncService, JiraStoryListenerService],
})
export class JiraIntegrationModule {}
