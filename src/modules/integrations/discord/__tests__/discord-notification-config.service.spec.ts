/**
 * DiscordNotificationConfigService Tests
 * Story 21.3: Discord Webhook Integration (AC2)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DiscordNotificationConfigService } from '../services/discord-notification-config.service';
import { DiscordNotificationConfig } from '../../../../database/entities/discord-notification-config.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

describe('DiscordNotificationConfigService', () => {
  let service: DiscordNotificationConfigService;
  let configRepo: jest.Mocked<Repository<DiscordNotificationConfig>>;
  let integrationRepo: jest.Mocked<Repository<DiscordIntegration>>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let redisService: jest.Mocked<RedisService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockIntegrationId = '22222222-2222-2222-2222-222222222222';
  const mockConfigId = '33333333-3333-3333-3333-333333333333';

  const mockIntegration: Partial<DiscordIntegration> = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    defaultWebhookUrl: 'encrypted-url',
    defaultWebhookUrlIv: 'embedded',
    defaultChannelName: '#general',
    status: 'active',
  };

  const mockConfig: Partial<DiscordNotificationConfig> = {
    id: mockConfigId,
    discordIntegrationId: mockIntegrationId,
    eventType: 'story_completed',
    webhookUrl: null,
    webhookUrlIv: null,
    channelName: null,
    isEnabled: true,
    projectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            encrypt: jest.fn().mockReturnValue('encrypted-value'),
            decrypt: jest.fn().mockReturnValue('https://discord.com/api/webhooks/123456/abcdef'),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DiscordNotificationConfigService>(DiscordNotificationConfigService);
    configRepo = module.get(getRepositoryToken(DiscordNotificationConfig));
    integrationRepo = module.get(getRepositoryToken(DiscordIntegration));
    encryptionService = module.get(EncryptionService) as jest.Mocked<EncryptionService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe('getConfigs', () => {
    it('returns all configs for workspace', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.find.mockResolvedValue([mockConfig as DiscordNotificationConfig]);

      const result = await service.getConfigs(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('story_completed');
    });

    it('returns empty array when no configs exist', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.find.mockResolvedValue([]);

      const result = await service.getConfigs(mockWorkspaceId);

      expect(result).toEqual([]);
    });

    it('throws NotFoundException when integration not found', async () => {
      integrationRepo.findOne.mockResolvedValue(null);

      await expect(service.getConfigs(mockWorkspaceId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertConfig', () => {
    it('creates new config when none exists', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);
      configRepo.create.mockReturnValue(mockConfig as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue(mockConfig as DiscordNotificationConfig);

      const result = await service.upsertConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        isEnabled: true,
      });

      expect(configRepo.create).toHaveBeenCalled();
      expect(configRepo.save).toHaveBeenCalled();
      expect(result.eventType).toBe('story_completed');
    });

    it('updates existing config when one exists for same event type', async () => {
      const existing = { ...mockConfig } as DiscordNotificationConfig;
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(existing);
      configRepo.save.mockResolvedValue({ ...existing, isEnabled: false } as DiscordNotificationConfig);

      const result = await service.upsertConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        isEnabled: false,
      });

      expect(configRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false }));
    });

    it('creates separate config when project_id differs', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);
      configRepo.create.mockReturnValue({ ...mockConfig, projectId: 'project-1' } as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue({ ...mockConfig, projectId: 'project-1' } as DiscordNotificationConfig);

      const result = await service.upsertConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        projectId: '44444444-4444-4444-4444-444444444444',
      });

      expect(configRepo.create).toHaveBeenCalled();
    });

    it('validates event type against allowed list (rejects invalid)', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);

      await expect(
        service.upsertConfig(mockWorkspaceId, { eventType: 'invalid_event' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('encrypts webhook URL when provided', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);
      configRepo.create.mockReturnValue(mockConfig as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue(mockConfig as DiscordNotificationConfig);

      await service.upsertConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        webhookUrl: 'https://discord.com/api/webhooks/123456/abcdef',
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith('https://discord.com/api/webhooks/123456/abcdef');
    });

    it('accepts null webhook URL (uses default)', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);
      configRepo.create.mockReturnValue(mockConfig as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue(mockConfig as DiscordNotificationConfig);

      await service.upsertConfig(mockWorkspaceId, {
        eventType: 'story_completed',
      });

      expect(encryptionService.encrypt).not.toHaveBeenCalled();
    });

    it('invalidates Redis cache on upsert', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);
      configRepo.create.mockReturnValue(mockConfig as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue(mockConfig as DiscordNotificationConfig);

      await service.upsertConfig(mockWorkspaceId, { eventType: 'story_completed' });

      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('toggleConfig', () => {
    it('enables config when disabled', async () => {
      const disabledConfig = { ...mockConfig, isEnabled: false } as DiscordNotificationConfig;
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(disabledConfig);
      configRepo.save.mockResolvedValue({ ...disabledConfig, isEnabled: true } as DiscordNotificationConfig);

      const result = await service.toggleConfig(mockWorkspaceId, mockConfigId, true);

      expect(configRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: true }));
    });

    it('disables config when enabled', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(mockConfig as DiscordNotificationConfig);
      configRepo.save.mockResolvedValue({ ...mockConfig, isEnabled: false } as DiscordNotificationConfig);

      const result = await service.toggleConfig(mockWorkspaceId, mockConfigId, false);

      expect(configRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false }));
    });

    it('throws NotFoundException for non-existent config', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);

      await expect(
        service.toggleConfig(mockWorkspaceId, mockConfigId, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('validates workspace ownership', async () => {
      integrationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.toggleConfig(mockWorkspaceId, mockConfigId, true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteConfig', () => {
    it('removes config and invalidates cache', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(mockConfig as DiscordNotificationConfig);
      configRepo.remove.mockResolvedValue(mockConfig as DiscordNotificationConfig);

      await service.deleteConfig(mockWorkspaceId, mockConfigId);

      expect(configRepo.remove).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });

    it('throws NotFoundException for non-existent config', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteConfig(mockWorkspaceId, mockConfigId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('seedDefaultConfigs', () => {
    it('creates configs for all event types', async () => {
      configRepo.create.mockImplementation((data: any) => data);
      configRepo.save.mockResolvedValue([] as any);

      await service.seedDefaultConfigs(mockIntegrationId);

      expect(configRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'story_completed' }),
          expect.objectContaining({ eventType: 'epic_completed' }),
          expect.objectContaining({ eventType: 'deployment_success' }),
          expect.objectContaining({ eventType: 'deployment_failed' }),
          expect.objectContaining({ eventType: 'agent_error' }),
          expect.objectContaining({ eventType: 'agent_message' }),
          expect.objectContaining({ eventType: 'context_degraded' }),
          expect.objectContaining({ eventType: 'context_critical' }),
        ]),
      );
    });

    it('sets all configs to enabled with null webhook (default)', async () => {
      configRepo.create.mockImplementation((data: any) => data);
      configRepo.save.mockResolvedValue([] as any);

      await service.seedDefaultConfigs(mockIntegrationId);

      const savedConfigs = (configRepo.save as jest.Mock).mock.calls[0][0];
      savedConfigs.forEach((config: any) => {
        expect(config.isEnabled).toBe(true);
        expect(config.webhookUrl).toBeNull();
      });
    });
  });

  describe('resolveWebhookForEvent', () => {
    it('returns project-specific config when available', async () => {
      const projectId = '55555555-5555-5555-5555-555555555555';
      const projectConfig = {
        ...mockConfig,
        projectId,
        webhookUrl: 'encrypted-project-url',
        isEnabled: true,
      } as DiscordNotificationConfig;

      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValueOnce(projectConfig);

      const result = await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed', projectId);

      expect(result).toBeTruthy();
      expect(result!.isEnabled).toBe(true);
    });

    it('falls back to global event config when no project-specific config', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValueOnce(null); // No project-specific
      configRepo.findOne.mockResolvedValueOnce(mockConfig as DiscordNotificationConfig); // Global config

      const result = await service.resolveWebhookForEvent(
        mockWorkspaceId,
        'story_completed',
        '55555555-5555-5555-5555-555555555555',
      );

      expect(result).toBeTruthy();
    });

    it('falls back to default webhook when no event config', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);

      const result = await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed');

      expect(result).toBeTruthy();
      expect(result!.webhookUrl).toBe('https://discord.com/api/webhooks/123456/abcdef');
    });

    it('returns null when integration not found', async () => {
      integrationRepo.findOne.mockResolvedValue(null);

      const result = await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed');

      expect(result).toBeNull();
    });

    it('returns isEnabled:false when config is disabled', async () => {
      const disabledConfig = { ...mockConfig, isEnabled: false } as DiscordNotificationConfig;
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      // No projectId passed, so only the global lookup happens
      configRepo.findOne.mockResolvedValueOnce(disabledConfig);

      const result = await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed');

      expect(result).toBeTruthy();
      expect(result!.isEnabled).toBe(false);
    });

    it('caches result in Redis', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      configRepo.findOne.mockResolvedValue(null);

      await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed');

      expect(redisService.set).toHaveBeenCalled();
    });

    it('returns from cache on hit', async () => {
      const cachedResult = { webhookUrl: 'https://cached.url', channelName: '#cached', isEnabled: true };
      redisService.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.resolveWebhookForEvent(mockWorkspaceId, 'story_completed');

      expect(result).toEqual(cachedResult);
      expect(integrationRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
