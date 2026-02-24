/**
 * DiscordBotGatewayService
 * Story 21.4: Discord Bot (Optional) (AC2)
 *
 * Core bot gateway service for managing Discord bot configuration.
 * Uses HTTP-based Discord Interactions Endpoint (not WebSocket gateway).
 * Slash commands are registered via Discord REST API.
 * Ed25519 signature verification for incoming interactions.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DiscordBotConfig } from '../../../../database/entities/discord-bot-config.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

const CACHE_PREFIX = 'discord-bot-config:';
const CACHE_TTL = 300; // 5 minutes

const SLASH_COMMANDS = [
  {
    name: 'devos',
    description: 'DevOS bot commands',
    options: [
      {
        name: 'status',
        description: 'Show current sprint/project status',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'agents',
        description: 'List active agents and their tasks',
        type: 1,
      },
      {
        name: 'deploy',
        description: 'Trigger a deployment',
        type: 1,
        options: [
          {
            name: 'project',
            description: 'Project name',
            type: 3, // STRING
            required: true,
          },
          {
            name: 'environment',
            description: 'Target environment',
            type: 3,
            required: true,
            choices: [
              { name: 'staging', value: 'staging' },
              { name: 'production', value: 'production' },
            ],
          },
        ],
      },
      {
        name: 'costs',
        description: 'Show current month cost summary',
        type: 1,
      },
      {
        name: 'link',
        description: 'Link your Discord account to DevOS',
        type: 1,
      },
      {
        name: 'help',
        description: 'List all available commands',
        type: 1,
      },
    ],
  },
];

@Injectable()
export class DiscordBotGatewayService {
  private readonly logger = new Logger(DiscordBotGatewayService.name);

  constructor(
    @InjectRepository(DiscordBotConfig)
    private readonly botConfigRepo: Repository<DiscordBotConfig>,
    @InjectRepository(DiscordIntegration)
    private readonly integrationRepo: Repository<DiscordIntegration>,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register Discord slash commands for a guild using the Discord REST API.
   * Commands: /devos status, /devos agents, /devos deploy, /devos costs, /devos link, /devos help
   */
  async registerSlashCommands(
    guildId: string,
    applicationId: string,
    botToken: string,
  ): Promise<void> {
    const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify(SLASH_COMMANDS),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Failed to register slash commands for guild ${guildId}: ${response.status} - ${errorBody}`,
        );
        throw new BadRequestException(
          `Failed to register slash commands: Discord returned ${response.status}`,
        );
      }

      this.logger.log(`Slash commands registered for guild ${guildId}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Verify Discord interaction signature (Ed25519).
   * Uses the public key from Discord application settings.
   */
  verifyInteractionSignature(
    body: string,
    signature: string,
    timestamp: string,
    publicKey: string,
  ): boolean {
    try {
      const message = Buffer.from(timestamp + body);
      const sig = Buffer.from(signature, 'hex');
      const key = Buffer.from(publicKey, 'hex');

      return crypto.verify(
        null, // Ed25519 does not use a separate hash algorithm
        message,
        { key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]), format: 'der', type: 'spki' },
        sig,
      );
    } catch (error) {
      this.logger.warn(
        `Ed25519 verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Get bot config for a guild (cached in Redis).
   */
  async getBotConfig(guildId: string): Promise<DiscordBotConfig | null> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}guild:${guildId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    const config = await this.botConfigRepo.findOne({ where: { guildId } });

    if (config) {
      // Cache without bot token for security
      const cacheSafe = { ...config, botToken: '[REDACTED]', botTokenIv: '[REDACTED]' };
      await this.redisService.set(cacheKey, JSON.stringify(cacheSafe), CACHE_TTL);
    }

    return config;
  }

  /**
   * Get bot config by workspace ID.
   */
  async getBotConfigByWorkspace(workspaceId: string): Promise<DiscordBotConfig | null> {
    // Check cache
    const cacheKey = `${CACHE_PREFIX}workspace:${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    // Find the integration for this workspace, then find its bot config
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return null;
    }

    const config = await this.botConfigRepo.findOne({
      where: { discordIntegrationId: integration.id },
    });

    if (config) {
      const cacheSafe = { ...config, botToken: '[REDACTED]', botTokenIv: '[REDACTED]' };
      await this.redisService.set(cacheKey, JSON.stringify(cacheSafe), CACHE_TTL);
    }

    return config;
  }

  /**
   * Setup a new bot for a guild. Encrypts and stores bot token.
   * Registers slash commands after storage.
   */
  async setupBot(params: {
    workspaceId: string;
    guildId: string;
    botToken: string;
    applicationId: string;
    publicKey?: string;
    commandChannelId?: string;
    commandChannelName?: string;
    configuredBy: string;
  }): Promise<DiscordBotConfig> {
    // Check integration exists
    const integration = await this.integrationRepo.findOne({
      where: { workspaceId: params.workspaceId },
    });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    // Check for duplicate guild
    const existingGuild = await this.botConfigRepo.findOne({
      where: { guildId: params.guildId },
    });
    if (existingGuild) {
      throw new ConflictException('A bot is already configured for this guild');
    }

    // Check for duplicate integration
    const existingIntegration = await this.botConfigRepo.findOne({
      where: { discordIntegrationId: integration.id },
    });
    if (existingIntegration) {
      throw new ConflictException('A bot is already configured for this workspace');
    }

    // Encrypt bot token
    const encryptedToken = this.encryptionService.encrypt(params.botToken);

    // Create config
    const config = this.botConfigRepo.create({
      discordIntegrationId: integration.id,
      guildId: params.guildId,
      botToken: encryptedToken,
      botTokenIv: 'embedded',
      applicationId: params.applicationId,
      publicKey: params.publicKey,
      commandChannelId: params.commandChannelId,
      commandChannelName: params.commandChannelName,
      configuredBy: params.configuredBy,
      status: 'active',
      isActive: true,
      enabledCommands: {
        status: true,
        agents: true,
        deploy: false,
        costs: true,
        link: true,
        help: true,
      },
      commandCount: 0,
      errorCount: 0,
    });

    const saved = await this.botConfigRepo.save(config);

    // Register slash commands with Discord
    try {
      await this.registerSlashCommands(
        params.guildId,
        params.applicationId,
        params.botToken,
      );
    } catch (error) {
      this.logger.warn(
        `Slash command registration failed for guild ${params.guildId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Non-critical - bot config is saved, commands can be registered later
    }

    return saved;
  }

  /**
   * Update bot configuration (enabled commands, channel restriction, etc.)
   */
  async updateBotConfig(
    workspaceId: string,
    updates: Partial<Pick<DiscordBotConfig, 'commandChannelId' | 'commandChannelName' | 'enabledCommands' | 'isActive'>>,
  ): Promise<DiscordBotConfig> {
    const config = await this.getBotConfigByWorkspace(workspaceId);
    if (!config) {
      throw new NotFoundException('No Discord bot configured for workspace');
    }

    // Fetch fresh from DB (cache may have redacted fields)
    const freshConfig = await this.botConfigRepo.findOne({ where: { id: config.id } });
    if (!freshConfig) {
      throw new NotFoundException('Bot config not found');
    }

    if (updates.commandChannelId !== undefined) freshConfig.commandChannelId = updates.commandChannelId;
    if (updates.commandChannelName !== undefined) freshConfig.commandChannelName = updates.commandChannelName;
    if (updates.enabledCommands !== undefined) freshConfig.enabledCommands = updates.enabledCommands;
    if (updates.isActive !== undefined) freshConfig.isActive = updates.isActive;

    const saved = await this.botConfigRepo.save(freshConfig);

    // Invalidate cache
    await this.invalidateCache(freshConfig.guildId, workspaceId);

    return saved;
  }

  /**
   * Disconnect the bot (remove config, deregister slash commands).
   */
  async disconnectBot(workspaceId: string): Promise<void> {
    const config = await this.getBotConfigByWorkspace(workspaceId);
    if (!config) {
      throw new NotFoundException('No Discord bot configured for workspace');
    }

    // Fetch fresh from DB to get bot token for deregistration
    const freshConfig = await this.botConfigRepo.findOne({ where: { id: config.id } });
    if (freshConfig) {
      // Attempt to deregister slash commands
      try {
        const botToken = this.encryptionService.decrypt(freshConfig.botToken);
        const url = `https://discord.com/api/v10/applications/${freshConfig.applicationId}/guilds/${freshConfig.guildId}/commands`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${botToken}`,
            },
            body: JSON.stringify([]),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to deregister slash commands: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      await this.botConfigRepo.remove(freshConfig);
    }

    // Invalidate cache
    await this.invalidateCache(config.guildId, workspaceId);
  }

  /**
   * Check if a command is enabled for this guild.
   */
  async isCommandEnabled(guildId: string, commandName: string): Promise<boolean> {
    const config = await this.getBotConfig(guildId);
    if (!config || !config.isActive) {
      return false;
    }

    // If enabledCommands is empty, allow all
    if (!config.enabledCommands || Object.keys(config.enabledCommands).length === 0) {
      return true;
    }

    return config.enabledCommands[commandName] === true;
  }

  /**
   * Invalidate cached bot config for guild and workspace.
   */
  private async invalidateCache(guildId: string, workspaceId: string): Promise<void> {
    await Promise.all([
      this.redisService.del(`${CACHE_PREFIX}guild:${guildId}`),
      this.redisService.del(`${CACHE_PREFIX}workspace:${workspaceId}`),
    ]);
  }
}
