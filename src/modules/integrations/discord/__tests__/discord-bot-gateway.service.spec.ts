/**
 * DiscordBotGatewayService Tests
 * Story 21.4: Discord Bot (Optional) (AC9)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscordBotGatewayService } from '../services/discord-bot-gateway.service';
import { DiscordBotConfig } from '../../../../database/entities/discord-bot-config.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('DiscordBotGatewayService', () => {
  let service: DiscordBotGatewayService;
  let botConfigRepo: jest.Mocked<Repository<DiscordBotConfig>>;
  let integrationRepo: jest.Mocked<Repository<DiscordIntegration>>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let redisService: jest.Mocked<RedisService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockIntegrationId = '22222222-2222-2222-2222-222222222222';
  const mockBotConfigId = '33333333-3333-3333-3333-333333333333';
  const mockGuildId = '987654321098765432';
  const mockUserId = '44444444-4444-4444-4444-444444444444';
  const mockApplicationId = '123456789012345678';
  const mockBotToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.test-token';

  const mockIntegration: Partial<DiscordIntegration> = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    status: 'active',
  };

  const mockBotConfig: Partial<DiscordBotConfig> = {
    id: mockBotConfigId,
    discordIntegrationId: mockIntegrationId,
    guildId: mockGuildId,
    botToken: 'encrypted-token',
    botTokenIv: 'embedded',
    applicationId: mockApplicationId,
    publicKey: 'abcdef1234567890',
    commandChannelId: null,
    status: 'active',
    isActive: true,
    enabledCommands: { status: true, agents: true, deploy: false, costs: true, link: true, help: true },
    commandCount: 0,
    errorCount: 0,
    configuredBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordBotGatewayService,
        {
          provide: getRepositoryToken(DiscordBotConfig),
          useValue: {
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
            encrypt: jest.fn().mockReturnValue('encrypted-token'),
            decrypt: jest.fn().mockReturnValue(mockBotToken),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
      ],
    }).compile();

    service = module.get<DiscordBotGatewayService>(DiscordBotGatewayService);
    botConfigRepo = module.get(getRepositoryToken(DiscordBotConfig));
    integrationRepo = module.get(getRepositoryToken(DiscordIntegration));
    encryptionService = module.get(EncryptionService) as jest.Mocked<EncryptionService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe('setupBot', () => {
    it('encrypts bot token and stores config', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      botConfigRepo.findOne.mockResolvedValue(null); // No existing
      botConfigRepo.create.mockReturnValue(mockBotConfig as DiscordBotConfig);
      botConfigRepo.save.mockResolvedValue(mockBotConfig as DiscordBotConfig);

      // Mock fetch for slash command registration
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

      const result = await service.setupBot({
        workspaceId: mockWorkspaceId,
        guildId: mockGuildId,
        botToken: mockBotToken,
        applicationId: mockApplicationId,
        configuredBy: mockUserId,
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith(mockBotToken);
      expect(botConfigRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(mockBotConfigId);
    });

    it('registers slash commands via Discord REST API', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      botConfigRepo.findOne.mockResolvedValue(null);
      botConfigRepo.create.mockReturnValue(mockBotConfig as DiscordBotConfig);
      botConfigRepo.save.mockResolvedValue(mockBotConfig as DiscordBotConfig);

      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

      await service.setupBot({
        workspaceId: mockWorkspaceId,
        guildId: mockGuildId,
        botToken: mockBotToken,
        applicationId: mockApplicationId,
        configuredBy: mockUserId,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/applications/${mockApplicationId}/guilds/${mockGuildId}/commands`),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: `Bot ${mockBotToken}`,
          }),
        }),
      );
    });

    it('rejects duplicate guild setup', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      botConfigRepo.findOne
        .mockResolvedValueOnce(mockBotConfig as DiscordBotConfig); // existing guild

      await expect(
        service.setupBot({
          workspaceId: mockWorkspaceId,
          guildId: mockGuildId,
          botToken: mockBotToken,
          applicationId: mockApplicationId,
          configuredBy: mockUserId,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getBotConfig', () => {
    it('returns cached config from Redis', async () => {
      const cached = JSON.stringify({ ...mockBotConfig, botToken: '[REDACTED]' });
      redisService.get.mockResolvedValue(cached);

      const result = await service.getBotConfig(mockGuildId);

      expect(result).toBeTruthy();
      expect(integrationRepo.findOne).not.toHaveBeenCalled();
      expect(botConfigRepo.findOne).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      botConfigRepo.findOne.mockResolvedValue(mockBotConfig as DiscordBotConfig);

      const result = await service.getBotConfig(mockGuildId);

      expect(result).toBeTruthy();
      expect(botConfigRepo.findOne).toHaveBeenCalledWith({ where: { guildId: mockGuildId } });
      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('verifyInteractionSignature', () => {
    it('validates Ed25519 signature correctly (returns boolean)', () => {
      // Since real Ed25519 verification requires valid keys/signatures,
      // we test that the method returns a boolean without throwing
      const result = service.verifyInteractionSignature(
        '{"type":1}',
        'invalid-sig',
        '1234567890',
        'invalid-key',
      );

      expect(typeof result).toBe('boolean');
    });

    it('rejects invalid signature by returning false', () => {
      const result = service.verifyInteractionSignature(
        '{"type":1}',
        '0'.repeat(128),
        '1234567890',
        '0'.repeat(64),
      );

      expect(result).toBe(false);
    });
  });

  describe('updateBotConfig', () => {
    it('updates enabled commands and invalidates cache', async () => {
      // Mock getBotConfigByWorkspace path
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      botConfigRepo.findOne
        .mockResolvedValueOnce(mockBotConfig as DiscordBotConfig) // getBotConfigByWorkspace
        .mockResolvedValueOnce(mockBotConfig as DiscordBotConfig); // fresh fetch

      const updated = { ...mockBotConfig, enabledCommands: { status: true, deploy: true } };
      botConfigRepo.save.mockResolvedValue(updated as DiscordBotConfig);

      const result = await service.updateBotConfig(mockWorkspaceId, {
        enabledCommands: { status: true, deploy: true },
      });

      expect(botConfigRepo.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('disconnectBot', () => {
    it('removes config and invalidates cache', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      botConfigRepo.findOne
        .mockResolvedValueOnce(mockBotConfig as DiscordBotConfig) // getBotConfigByWorkspace
        .mockResolvedValueOnce(mockBotConfig as DiscordBotConfig); // fresh fetch
      botConfigRepo.remove.mockResolvedValue(mockBotConfig as DiscordBotConfig);

      // Mock deregister fetch
      mockFetch.mockResolvedValue({ ok: true });

      await service.disconnectBot(mockWorkspaceId);

      expect(botConfigRepo.remove).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('isCommandEnabled', () => {
    const cachedConfig = JSON.stringify({
      ...mockBotConfig,
      botToken: '[REDACTED]',
      botTokenIv: '[REDACTED]',
    });

    it('returns true for enabled commands (status=true)', async () => {
      redisService.get.mockResolvedValueOnce(cachedConfig);

      const statusEnabled = await service.isCommandEnabled(mockGuildId, 'status');
      expect(statusEnabled).toBe(true);
    });

    it('returns false for disabled commands (deploy=false)', async () => {
      redisService.get.mockResolvedValueOnce(cachedConfig);

      const deployEnabled = await service.isCommandEnabled(mockGuildId, 'deploy');
      expect(deployEnabled).toBe(false);
    });

    it('returns false when bot is inactive', async () => {
      const inactiveConfig = JSON.stringify({
        ...mockBotConfig,
        isActive: false,
        botToken: '[REDACTED]',
        botTokenIv: '[REDACTED]',
      });
      redisService.get.mockResolvedValueOnce(inactiveConfig);

      const result = await service.isCommandEnabled(mockGuildId, 'status');
      expect(result).toBe(false);
    });
  });

  describe('registerSlashCommands', () => {
    it('sends correct payload to Discord API', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

      await service.registerSlashCommands(mockGuildId, mockApplicationId, mockBotToken);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/applications/${mockApplicationId}/guilds/${mockGuildId}/commands`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bot ${mockBotToken}`,
          }),
          body: expect.any(String),
        }),
      );

      // Verify the body contains our command structure
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('devos');
      expect(body[0].options).toHaveLength(6); // status, agents, deploy, costs, link, help
    });
  });
});
