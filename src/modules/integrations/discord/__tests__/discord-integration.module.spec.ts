/**
 * DiscordIntegrationModule Tests
 * Story 21.3: Discord Webhook Integration (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DiscordIntegrationModule } from '../discord-integration.module';
import { DiscordNotificationConfigService } from '../services/discord-notification-config.service';
import { DiscordNotificationConfig } from '../../../../database/entities/discord-notification-config.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

describe('DiscordIntegrationModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        DiscordNotificationConfigService,
        {
          provide: getRepositoryToken(DiscordNotificationConfig),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DiscordIntegration),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();
  });

  it('compiles without errors', () => {
    expect(module).toBeDefined();
  });

  it('DiscordNotificationConfigService is resolvable', () => {
    const service = module.get<DiscordNotificationConfigService>(DiscordNotificationConfigService);
    expect(service).toBeDefined();
  });

  it('DiscordNotificationConfigService has expected methods', () => {
    const service = module.get<DiscordNotificationConfigService>(DiscordNotificationConfigService);
    expect(service.getConfigs).toBeDefined();
    expect(service.upsertConfig).toBeDefined();
    expect(service.toggleConfig).toBeDefined();
    expect(service.deleteConfig).toBeDefined();
    expect(service.seedDefaultConfigs).toBeDefined();
    expect(service.resolveWebhookForEvent).toBeDefined();
  });
});
