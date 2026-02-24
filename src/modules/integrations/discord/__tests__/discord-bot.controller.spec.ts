/**
 * DiscordBotController Tests
 * Story 21.4: Discord Bot (Optional) (AC12)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DiscordBotController } from '../controllers/discord-bot.controller';
import { DiscordBotGatewayService } from '../services/discord-bot-gateway.service';
import { DiscordUserLinkService } from '../services/discord-user-link.service';
import { DiscordCommandHandlerService } from '../services/discord-command-handler.service';
import { DiscordBotConfig } from '../../../../database/entities/discord-bot-config.entity';
import { DiscordUserLink } from '../../../../database/entities/discord-user-link.entity';
import { DiscordInteractionLog } from '../../../../database/entities/discord-interaction-log.entity';

describe('DiscordBotController', () => {
  let controller: DiscordBotController;
  let botGatewayService: jest.Mocked<DiscordBotGatewayService>;
  let userLinkService: jest.Mocked<DiscordUserLinkService>;
  let commandHandlerService: jest.Mocked<DiscordCommandHandlerService>;
  let logRepo: jest.Mocked<Repository<DiscordInteractionLog>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockGuildId = '987654321098765432';
  const mockUserId = '33333333-3333-3333-3333-333333333333';
  const mockLinkId = '55555555-5555-5555-5555-555555555555';
  const mockBotConfigId = '44444444-4444-4444-4444-444444444444';

  const mockBotConfig: Partial<DiscordBotConfig> = {
    id: mockBotConfigId,
    guildId: mockGuildId,
    botToken: 'encrypted',
    botTokenIv: 'embedded',
    applicationId: '123456789',
    publicKey: 'abcdef',
    status: 'active',
    isActive: true,
    enabledCommands: { status: true, help: true },
    commandCount: 5,
    errorCount: 0,
    configuredBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserLink: Partial<DiscordUserLink> = {
    id: mockLinkId,
    workspaceId: mockWorkspaceId,
    discordUserId: '123456789012345678',
    devosUserId: mockUserId,
    discordUsername: 'testuser',
    status: 'linked',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockInteractionLog: Partial<DiscordInteractionLog> = {
    id: '66666666-6666-6666-6666-666666666666',
    workspaceId: mockWorkspaceId,
    discordUserId: '123456789012345678',
    commandName: 'status',
    resultStatus: 'success',
    responseTimeMs: 150,
    createdAt: new Date(),
  };

  const mockRequest = {
    user: { sub: mockUserId },
  };

  // Mock Express request for @Req() in handleInteraction
  const mockExpressRequest = {
    rawBody: undefined,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordBotController],
      providers: [
        {
          provide: DiscordBotGatewayService,
          useValue: {
            setupBot: jest.fn().mockResolvedValue(mockBotConfig),
            getBotConfigByWorkspace: jest.fn().mockResolvedValue(mockBotConfig),
            getBotConfig: jest.fn().mockResolvedValue(mockBotConfig),
            updateBotConfig: jest.fn().mockResolvedValue(mockBotConfig),
            disconnectBot: jest.fn().mockResolvedValue(undefined),
            verifyInteractionSignature: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: DiscordUserLinkService,
          useValue: {
            completeLinking: jest.fn().mockResolvedValue(mockUserLink),
            listLinks: jest.fn().mockResolvedValue([mockUserLink]),
            unlinkById: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DiscordCommandHandlerService,
          useValue: {
            handleSlashCommand: jest.fn().mockResolvedValue({
              type: 4,
              data: { embeds: [{ title: 'Test' }] },
            }),
          },
        },
        {
          provide: getRepositoryToken(DiscordInteractionLog),
          useValue: {
            findAndCount: jest.fn().mockResolvedValue([[mockInteractionLog], 1]),
          },
        },
      ],
    }).compile();

    controller = module.get<DiscordBotController>(DiscordBotController);
    botGatewayService = module.get(DiscordBotGatewayService) as jest.Mocked<DiscordBotGatewayService>;
    userLinkService = module.get(DiscordUserLinkService) as jest.Mocked<DiscordUserLinkService>;
    commandHandlerService = module.get(DiscordCommandHandlerService) as jest.Mocked<DiscordCommandHandlerService>;
    logRepo = module.get(getRepositoryToken(DiscordInteractionLog));
  });

  describe('POST /interactions', () => {
    it('rejects missing signature headers (401)', async () => {
      await expect(
        controller.handleInteraction(
          { type: 2, guild_id: mockGuildId },
          {},
          mockExpressRequest,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('handles PING interaction (type 1) with PONG response', async () => {
      const result = await controller.handleInteraction(
        { type: 1 },
        { 'x-signature-ed25519': 'sig', 'x-signature-timestamp': '123' },
        mockExpressRequest,
      );

      expect(result).toEqual({ type: 1 });
    });

    it('routes APPLICATION_COMMAND (type 2) to command handler', async () => {
      const body = {
        type: 2,
        guild_id: mockGuildId,
        channel_id: 'channel-123',
        member: { user: { id: '123', username: 'testuser' } },
        data: {
          name: 'devos',
          options: [{ name: 'status', options: [] }],
        },
      };

      const result = await controller.handleInteraction(
        body,
        { 'x-signature-ed25519': 'sig', 'x-signature-timestamp': '123' },
        mockExpressRequest,
      );

      expect(commandHandlerService.handleSlashCommand).toHaveBeenCalledWith(
        mockGuildId,
        '123',
        'status',
        expect.objectContaining({ username: 'testuser' }),
        'channel-123',
      );
    });
  });

  describe('POST /setup', () => {
    it('creates bot config with encrypted token', async () => {
      const result = await controller.setupBot(
        mockWorkspaceId,
        {
          botToken: 'test-token',
          applicationId: '123456789',
          guildId: mockGuildId,
        },
        mockRequest,
      );

      expect(botGatewayService.setupBot).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          botToken: 'test-token',
          configuredBy: mockUserId,
        }),
      );
    });

    it('rejects missing required fields (400) via DTO validation', async () => {
      // This would be caught by class-validator in the actual pipeline
      // Here we test the controller delegates properly
      botGatewayService.setupBot.mockRejectedValue(
        new BadRequestException('Missing required fields'),
      );

      await expect(
        controller.setupBot(
          mockWorkspaceId,
          { botToken: '', applicationId: '', guildId: '' },
          mockRequest,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /config', () => {
    it('returns bot config for workspace', async () => {
      const result = await controller.getBotConfig(mockWorkspaceId);

      expect(result).toHaveProperty('id');
      // Verify sensitive fields are redacted
      expect((result as DiscordBotConfig).botToken).toBe('[REDACTED]');
      expect((result as DiscordBotConfig).botTokenIv).toBe('[REDACTED]');
    });

    it('returns { connected: false } when no bot configured', async () => {
      botGatewayService.getBotConfigByWorkspace.mockResolvedValue(null);

      const result = await controller.getBotConfig(mockWorkspaceId);

      expect(result).toEqual({ connected: false });
    });
  });

  describe('PUT /config', () => {
    it('updates bot configuration', async () => {
      const result = await controller.updateBotConfig(mockWorkspaceId, {
        enabledCommands: { status: true, deploy: true },
      });

      expect(botGatewayService.updateBotConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        { enabledCommands: { status: true, deploy: true } },
      );
    });
  });

  describe('DELETE /disconnect', () => {
    it('removes bot config', async () => {
      await controller.disconnectBot(mockWorkspaceId);

      expect(botGatewayService.disconnectBot).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('POST /complete-link', () => {
    it('completes user linking with valid token', async () => {
      const result = await controller.completeLink(
        { linkToken: 'valid-token' },
        mockRequest,
      );

      expect(result.success).toBe(true);
      expect(result.discordUsername).toBe('testuser');
      expect(userLinkService.completeLinking).toHaveBeenCalledWith(
        'valid-token',
        mockUserId,
      );
    });

    it('rejects invalid/expired token (400)', async () => {
      userLinkService.completeLinking.mockRejectedValue(
        new BadRequestException('Invalid or expired link token'),
      );

      await expect(
        controller.completeLink({ linkToken: 'invalid' }, mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /user-links', () => {
    it('returns all user links for workspace', async () => {
      const result = await controller.listUserLinks(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].discordUsername).toBe('testuser');
    });
  });

  describe('DELETE /user-links/:linkId', () => {
    it('removes user link', async () => {
      await controller.unlinkUser(mockWorkspaceId, mockLinkId);

      expect(userLinkService.unlinkById).toHaveBeenCalledWith(mockWorkspaceId, mockLinkId);
    });
  });

  describe('GET /interaction-logs', () => {
    it('returns paginated interaction logs', async () => {
      const result = await controller.getInteractionLogs(mockWorkspaceId, '20', '0');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(logRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: mockWorkspaceId },
          order: { createdAt: 'DESC' },
          take: 20,
          skip: 0,
        }),
      );
    });

    it('validates limit/offset NaN guard', async () => {
      const result = await controller.getInteractionLogs(
        mockWorkspaceId,
        'not-a-number',
        'also-nan',
      );

      // Should use defaults when NaN
      expect(logRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20, // default
          skip: 0,  // default
        }),
      );
      expect(result.items).toBeDefined();
    });
  });
});
