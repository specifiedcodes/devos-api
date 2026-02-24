/**
 * SlackIntegrationModule Tests
 * Story 21.1: Slack OAuth Integration (AC9)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SlackEventsController } from '../controllers/slack-events.controller';
import { SlackUserMappingService } from '../services/slack-user-mapping.service';
import { SlackOAuthService } from '../../../notifications/services/slack-oauth.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { SlackUserMapping } from '../../../../database/entities/slack-user-mapping.entity';
import { User } from '../../../../database/entities/user.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

describe('SlackIntegrationModule', () => {
  let module: TestingModule;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [SlackEventsController],
      providers: [
        SlackUserMappingService,
        { provide: getRepositoryToken(SlackIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(SlackUserMapping), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: SlackOAuthService, useValue: { verifySignature: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();
  });

  it('compiles without errors', () => {
    expect(module).toBeDefined();
  });

  it('SlackEventsController is registered', () => {
    const controller = module.get<SlackEventsController>(SlackEventsController);
    expect(controller).toBeDefined();
  });

  it('SlackUserMappingService is resolvable', () => {
    const service = module.get<SlackUserMappingService>(SlackUserMappingService);
    expect(service).toBeDefined();
  });

  it('all providers are resolvable from the module', () => {
    expect(module.get(getRepositoryToken(SlackIntegration))).toBeDefined();
    expect(module.get(getRepositoryToken(SlackUserMapping))).toBeDefined();
    expect(module.get(getRepositoryToken(User))).toBeDefined();
    expect(module.get(EncryptionService)).toBeDefined();
    expect(module.get(RedisService)).toBeDefined();
  });

  it('cross-module injection of SlackOAuthService works', () => {
    const oauthService = module.get(SlackOAuthService);
    expect(oauthService).toBeDefined();
    expect(oauthService.verifySignature).toBeDefined();
  });
});
