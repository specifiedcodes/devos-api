/**
 * LinearIntegrationModule Tests
 * Story 21.5: Linear Two-Way Sync (AC9)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { LinearIntegrationController } from '../controllers/linear-integration.controller';
import { LinearWebhookController } from '../controllers/linear-webhook.controller';
import { LinearApiClientService } from '../services/linear-api-client.service';
import { LinearOAuthService } from '../services/linear-oauth.service';
import { LinearSyncService } from '../services/linear-sync.service';
import { LinearStoryListenerService } from '../services/linear-story-listener.service';
import { LinearSyncProcessor } from '../processors/linear-sync.processor';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem } from '../../../../database/entities/linear-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

describe('LinearIntegrationModule', () => {
  let module: TestingModule;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [LinearIntegrationController, LinearWebhookController],
      providers: [
        LinearApiClientService,
        LinearOAuthService,
        LinearSyncService,
        LinearSyncProcessor,
        LinearStoryListenerService,
        { provide: getRepositoryToken(LinearIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(LinearSyncItem), useValue: mockRepo },
        { provide: getRepositoryToken(Story), useValue: mockRepo },
        { provide: getQueueToken('linear-sync'), useValue: mockQueue },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), zadd: jest.fn(), zcard: jest.fn(), zremrangebyscore: jest.fn(), expire: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
      ],
    }).compile();
  });

  it('compiles without errors', () => {
    expect(module).toBeDefined();
  });

  it('all providers are resolvable', () => {
    expect(module.get(LinearApiClientService)).toBeDefined();
    expect(module.get(LinearOAuthService)).toBeDefined();
    expect(module.get(LinearSyncService)).toBeDefined();
    expect(module.get(LinearSyncProcessor)).toBeDefined();
    expect(module.get(LinearStoryListenerService)).toBeDefined();
  });

  it('all controllers are registered', () => {
    expect(module.get(LinearIntegrationController)).toBeDefined();
    expect(module.get(LinearWebhookController)).toBeDefined();
  });

  it('LinearOAuthService is resolvable (exported)', () => {
    const oauthService = module.get(LinearOAuthService);
    expect(oauthService).toBeDefined();
  });

  it('LinearSyncService is resolvable (exported)', () => {
    const syncService = module.get(LinearSyncService);
    expect(syncService).toBeDefined();
  });

  it('LinearStoryListenerService is resolvable (exported)', () => {
    const listenerService = module.get(LinearStoryListenerService);
    expect(listenerService).toBeDefined();
  });

  it('BullMQ linear-sync queue is available', () => {
    const queue = module.get(getQueueToken('linear-sync'));
    expect(queue).toBeDefined();
    expect(queue.add).toBeDefined();
  });
});
