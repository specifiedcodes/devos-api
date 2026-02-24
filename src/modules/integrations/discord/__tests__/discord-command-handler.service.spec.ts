/**
 * DiscordCommandHandlerService Tests
 * Story 21.4: Discord Bot (Optional) (AC11)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscordCommandHandlerService } from '../services/discord-command-handler.service';
import { DiscordBotGatewayService } from '../services/discord-bot-gateway.service';
import { DiscordUserLinkService } from '../services/discord-user-link.service';
import { RedisService } from '../../../redis/redis.service';
import { DiscordInteractionLog } from '../../../../database/entities/discord-interaction-log.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';

describe('DiscordCommandHandlerService', () => {
  let service: DiscordCommandHandlerService;
  let botGatewayService: jest.Mocked<DiscordBotGatewayService>;
  let userLinkService: jest.Mocked<DiscordUserLinkService>;
  let redisService: jest.Mocked<RedisService>;
  let logRepo: jest.Mocked<Repository<DiscordInteractionLog>>;
  let integrationRepo: jest.Mocked<Repository<DiscordIntegration>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockIntegrationId = '22222222-2222-2222-2222-222222222222';
  const mockGuildId = '987654321098765432';
  const mockDiscordUserId = '123456789012345678';
  const mockDevosUserId = '33333333-3333-3333-3333-333333333333';

  const mockBotConfig = {
    id: '44444444-4444-4444-4444-444444444444',
    discordIntegrationId: mockIntegrationId,
    guildId: mockGuildId,
    status: 'active',
    isActive: true,
    enabledCommands: { status: true, agents: true, deploy: true, costs: true, link: true, help: true },
  };

  const mockIntegration: Partial<DiscordIntegration> = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    status: 'active',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordCommandHandlerService,
        {
          provide: DiscordBotGatewayService,
          useValue: {
            getBotConfig: jest.fn().mockResolvedValue(mockBotConfig),
            isCommandEnabled: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: DiscordUserLinkService,
          useValue: {
            findDevosUserByDiscordId: jest.fn().mockResolvedValue(null),
            initiateLinking: jest.fn().mockResolvedValue({
              linkUrl: 'http://localhost:3000/integrations/discord/link?token=test',
              expiresAt: new Date(Date.now() + 600000),
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            zremrangebyscore: jest.fn().mockResolvedValue(0),
            zrangebyscore: jest.fn().mockResolvedValue([]),
            zadd: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: getRepositoryToken(DiscordInteractionLog),
          useValue: {
            create: jest.fn().mockImplementation((data: any) => data),
            save: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getRepositoryToken(DiscordIntegration),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockIntegration),
          },
        },
      ],
    }).compile();

    service = module.get<DiscordCommandHandlerService>(DiscordCommandHandlerService);
    botGatewayService = module.get(DiscordBotGatewayService) as jest.Mocked<DiscordBotGatewayService>;
    userLinkService = module.get(DiscordUserLinkService) as jest.Mocked<DiscordUserLinkService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    logRepo = module.get(getRepositoryToken(DiscordInteractionLog));
    integrationRepo = module.get(getRepositoryToken(DiscordIntegration));
  });

  describe('handleSlashCommand', () => {
    it('routes to correct handler based on command name', async () => {
      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'status',
        {},
      );

      expect(result.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
      expect(result.data.embeds).toBeDefined();
      expect(result.data.embeds![0].title).toBe('Project Status');
    });

    it('returns "Unknown command" for invalid command', async () => {
      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'invalid_command',
        {},
      );

      expect(result.data.embeds![0].title).toBe('Error');
      expect(result.data.embeds![0].description).toContain('Unknown command');
    });

    it('enforces rate limiting (guild-level)', async () => {
      // Simulate guild rate limited
      redisService.zrangebyscore.mockResolvedValueOnce(
        Array(10).fill('timestamp'), // 10 entries = at limit
      );

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'status',
        {},
      );

      expect(result.data.content).toContain('Rate limited');
      expect(result.data.flags).toBe(64); // EPHEMERAL
    });

    it('enforces rate limiting (user-level)', async () => {
      // Guild not rate limited
      redisService.zrangebyscore
        .mockResolvedValueOnce([]) // guild: not limited
        .mockResolvedValueOnce(Array(5).fill('timestamp')); // user: at limit

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'status',
        {},
      );

      expect(result.data.content).toContain('Rate limited');
      expect(result.data.flags).toBe(64);
    });
  });

  describe('handleStatus', () => {
    it('returns sprint/project summary embed', async () => {
      const result = await service.handleStatus(mockWorkspaceId);

      expect(result.type).toBe(4);
      expect(result.data.embeds).toHaveLength(1);
      expect(result.data.embeds![0].title).toBe('Project Status');
      expect(result.data.embeds![0].fields.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('handleAgents', () => {
    it('returns active agents list embed', async () => {
      const result = await service.handleAgents(mockWorkspaceId);

      expect(result.type).toBe(4);
      expect(result.data.embeds).toHaveLength(1);
      expect(result.data.embeds![0].title).toBe('Active Agents');
    });
  });

  describe('handleDeploy', () => {
    it('rejects unlinked users with ephemeral message', async () => {
      userLinkService.findDevosUserByDiscordId.mockResolvedValue(null);

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'deploy',
        { project: 'myapp', environment: 'staging' },
      );

      expect(result.data.content).toContain('link your Discord account');
      expect(result.data.flags).toBe(64); // EPHEMERAL
    });

    it('rejects users without deployment permission (unlinked)', async () => {
      userLinkService.findDevosUserByDiscordId.mockResolvedValue(null);

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'deploy',
        { project: 'myapp', environment: 'staging' },
      );

      expect(result.data.flags).toBe(64); // EPHEMERAL
    });

    it('triggers deployment for authorized users', async () => {
      userLinkService.findDevosUserByDiscordId.mockResolvedValue(mockDevosUserId);

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'deploy',
        { project: 'myapp', environment: 'staging' },
      );

      expect(result.data.embeds![0].title).toBe('Deployment Triggered');
      expect(result.data.embeds![0].fields.some((f: { name: string }) => f.name === 'Project')).toBe(true);
    });
  });

  describe('handleCosts', () => {
    it('returns cost summary as ephemeral message', async () => {
      userLinkService.findDevosUserByDiscordId.mockResolvedValue(mockDevosUserId);

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'costs',
        {},
      );

      expect(result.data.embeds![0].title).toBe('Cost Summary');
      expect(result.data.flags).toBe(64); // EPHEMERAL
    });

    it('rejects unlinked users for costs', async () => {
      userLinkService.findDevosUserByDiscordId.mockResolvedValue(null);

      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'costs',
        {},
      );

      expect(result.data.content).toContain('link your Discord account');
      expect(result.data.flags).toBe(64);
    });
  });

  describe('handleLink', () => {
    it('generates link URL and returns ephemeral message', async () => {
      const result = await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'link',
        {},
      );

      expect(result.data.flags).toBe(64); // EPHEMERAL
      expect(result.data.embeds![0].title).toBe('Link Discord to DevOS');
      expect(result.data.embeds![0].description).toContain('Click here to link');
    });
  });

  describe('handleHelp', () => {
    it('returns command list embed', async () => {
      const result = await service.handleHelp();

      expect(result.type).toBe(4);
      expect(result.data.embeds).toHaveLength(1);
      expect(result.data.embeds![0].title).toBe('DevOS Bot Commands');
      expect(result.data.embeds![0].fields.length).toBe(6); // 6 commands
    });
  });

  describe('interaction logging', () => {
    it('records all commands with response time', async () => {
      await service.handleSlashCommand(
        mockGuildId,
        mockDiscordUserId,
        'status',
        {},
      );

      expect(logRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          discordUserId: mockDiscordUserId,
          commandName: 'status',
          resultStatus: 'success',
          responseTimeMs: expect.any(Number),
        }),
      );
      expect(logRepo.save).toHaveBeenCalled();
    });
  });
});
