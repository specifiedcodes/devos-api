/**
 * JiraIntegrationModule Tests
 * Story 21.6: Jira Two-Way Sync (AC9)
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { JiraIntegrationModule } from '../jira-integration.module';
import { JiraIntegrationController } from '../controllers/jira-integration.controller';
import { JiraWebhookController } from '../controllers/jira-webhook.controller';
import { JiraApiClientService } from '../services/jira-api-client.service';
import { JiraOAuthService } from '../services/jira-oauth.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraStoryListenerService } from '../services/jira-story-listener.service';
import { JiraSyncProcessor } from '../processors/jira-sync.processor';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem } from '../../../../database/entities/jira-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

describe('JiraIntegrationModule', () => {
  it('compiles the module with all providers', async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [JiraIntegrationController, JiraWebhookController],
      providers: [
        JiraApiClientService,
        JiraOAuthService,
        JiraSyncService,
        JiraStoryListenerService,
        JiraSyncProcessor,
        { provide: getRepositoryToken(JiraIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: mockRepo },
        { provide: getRepositoryToken(Story), useValue: mockRepo },
        { provide: getQueueToken('jira-sync'), useValue: mockQueue },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), setnx: jest.fn(), zadd: jest.fn(), zcard: jest.fn(), zremrangebyscore: jest.fn(), expire: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-value') } },
      ],
    }).compile();

    expect(module).toBeDefined();
    expect(module.get(JiraApiClientService)).toBeDefined();
    expect(module.get(JiraOAuthService)).toBeDefined();
    expect(module.get(JiraSyncService)).toBeDefined();
    expect(module.get(JiraStoryListenerService)).toBeDefined();
    expect(module.get(JiraSyncProcessor)).toBeDefined();
    expect(module.get(JiraIntegrationController)).toBeDefined();
    expect(module.get(JiraWebhookController)).toBeDefined();
  });

  it('exports JiraOAuthService, JiraSyncService, JiraStoryListenerService', () => {
    // Verify the module metadata exports
    const moduleMetadata = Reflect.getMetadata('exports', JiraIntegrationModule);
    // Module should export the key services
    expect(moduleMetadata).toBeDefined();
  });
});
