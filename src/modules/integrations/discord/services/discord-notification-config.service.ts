/**
 * DiscordNotificationConfigService
 * Story 21.3: Discord Webhook Integration (AC2)
 *
 * Service for managing per-event-type Discord notification configuration,
 * including CRUD operations and resolving the effective webhook URL for a given event type.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DiscordNotificationConfig } from '../../../../database/entities/discord-notification-config.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import {
  DISCORD_EVENT_TYPES,
  UpsertDiscordNotificationConfigDto,
} from '../dto/discord-notification-config.dto';

const CACHE_PREFIX = 'discord-notif-config:';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class DiscordNotificationConfigService {
  private readonly logger = new Logger(DiscordNotificationConfigService.name);

  constructor(
    @InjectRepository(DiscordNotificationConfig)
    private readonly configRepo: Repository<DiscordNotificationConfig>,
    @InjectRepository(DiscordIntegration)
    private readonly integrationRepo: Repository<DiscordIntegration>,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get all notification configs for a Discord integration by workspace.
   * Returns configs sorted by event type.
   */
  async getConfigs(workspaceId: string): Promise<DiscordNotificationConfig[]> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    return this.configRepo.find({
      where: { discordIntegrationId: integration.id },
      order: { eventType: 'ASC' },
    });
  }

  /**
   * Upsert a notification config for a specific event type.
   * If config already exists for this event type + project, update it.
   * If not, create a new one. Validates event type against allowed list.
   */
  async upsertConfig(
    workspaceId: string,
    dto: UpsertDiscordNotificationConfigDto,
  ): Promise<DiscordNotificationConfig> {
    // Validate event type
    if (!DISCORD_EVENT_TYPES.includes(dto.eventType as any)) {
      throw new BadRequestException(`Invalid event type: ${dto.eventType}. Allowed: ${DISCORD_EVENT_TYPES.join(', ')}`);
    }

    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    // Check for existing config
    const projectId = dto.projectId || null;
    const existing = await this.configRepo.findOne({
      where: {
        discordIntegrationId: integration.id,
        eventType: dto.eventType,
        projectId: projectId === null ? IsNull() : projectId,
      },
    });

    // Encrypt webhook URL if provided
    let encryptedWebhookUrl: string | null | undefined = undefined;
    let webhookUrlIv: string | null | undefined = undefined;
    if (dto.webhookUrl !== undefined) {
      if (dto.webhookUrl) {
        encryptedWebhookUrl = this.encryptionService.encrypt(dto.webhookUrl);
        webhookUrlIv = 'embedded';
      } else {
        encryptedWebhookUrl = null;
        webhookUrlIv = null;
      }
    }

    if (existing) {
      // Update existing config
      if (encryptedWebhookUrl !== undefined) {
        existing.webhookUrl = encryptedWebhookUrl;
        existing.webhookUrlIv = webhookUrlIv ?? null;
      }
      if (dto.channelName !== undefined) {
        existing.channelName = dto.channelName;
      }
      if (dto.isEnabled !== undefined) {
        existing.isEnabled = dto.isEnabled;
      }

      const updated = await this.configRepo.save(existing);

      // Invalidate cache
      await this.invalidateCache(workspaceId);

      return updated;
    }

    // Create new config
    const config = this.configRepo.create({
      discordIntegrationId: integration.id,
      projectId: projectId,
      eventType: dto.eventType,
      webhookUrl: encryptedWebhookUrl ?? null,
      webhookUrlIv: webhookUrlIv ?? null,
      channelName: dto.channelName || null,
      isEnabled: dto.isEnabled ?? true,
    });

    const saved = await this.configRepo.save(config);

    // Invalidate cache
    await this.invalidateCache(workspaceId);

    return saved;
  }

  /**
   * Toggle enable/disable for a notification config.
   */
  async toggleConfig(
    workspaceId: string,
    configId: string,
    isEnabled: boolean,
  ): Promise<DiscordNotificationConfig> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    const config = await this.configRepo.findOne({
      where: { id: configId, discordIntegrationId: integration.id },
    });
    if (!config) {
      throw new NotFoundException('Notification config not found');
    }

    config.isEnabled = isEnabled;
    const updated = await this.configRepo.save(config);

    // Invalidate cache
    await this.invalidateCache(workspaceId);

    return updated;
  }

  /**
   * Delete a notification config.
   */
  async deleteConfig(workspaceId: string, configId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    const config = await this.configRepo.findOne({
      where: { id: configId, discordIntegrationId: integration.id },
    });
    if (!config) {
      throw new NotFoundException('Notification config not found');
    }

    await this.configRepo.remove(config);

    // Invalidate cache
    await this.invalidateCache(workspaceId);
  }

  /**
   * Seed default notification configs when a Discord integration is first created.
   * Creates one config per event type, all enabled, using default webhook.
   */
  async seedDefaultConfigs(
    discordIntegrationId: string,
  ): Promise<DiscordNotificationConfig[]> {
    const configs: DiscordNotificationConfig[] = [];

    for (const eventType of DISCORD_EVENT_TYPES) {
      const config = this.configRepo.create({
        discordIntegrationId,
        projectId: null,
        eventType,
        webhookUrl: null, // Use default webhook
        webhookUrlIv: null,
        channelName: null,
        isEnabled: true,
      });
      configs.push(config);
    }

    return this.configRepo.save(configs);
  }

  /**
   * Get the effective webhook URL and channel name for an event type and optional project.
   * Resolution order: project-specific config -> global event config -> default webhook.
   * Cached in Redis for fast lookup.
   */
  async resolveWebhookForEvent(
    workspaceId: string,
    eventType: string,
    projectId?: string,
  ): Promise<{ webhookUrl: string; channelName?: string; isEnabled: boolean } | null> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}${workspaceId}:${eventType}:${projectId || 'global'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Decrypt the webhook URL if it was encrypted in the cache
        if (parsed._encrypted && parsed.webhookUrl) {
          parsed.webhookUrl = this.encryptionService.decrypt(parsed.webhookUrl);
          delete parsed._encrypted;
        }
        return parsed;
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return null;
    }

    // 1. Project-specific config for event type
    if (projectId) {
      const projectConfig = await this.configRepo.findOne({
        where: {
          discordIntegrationId: integration.id,
          eventType,
          projectId,
        },
      });
      if (projectConfig) {
        const result = await this.buildResolvedResult(projectConfig, integration);
        await this.cacheResult(cacheKey, result);
        return result;
      }
    }

    // 2. Global config (projectId = null) for event type
    const globalConfig = await this.configRepo.findOne({
      where: {
        discordIntegrationId: integration.id,
        eventType,
        projectId: IsNull(),
      },
    });
    if (globalConfig) {
      const result = await this.buildResolvedResult(globalConfig, integration);
      await this.cacheResult(cacheKey, result);
      return result;
    }

    // 3. Fall back to default webhook
    if (integration.defaultWebhookUrl) {
      try {
        const webhookUrl = this.encryptionService.decrypt(integration.defaultWebhookUrl);
        const result = {
          webhookUrl,
          channelName: integration.defaultChannelName,
          isEnabled: true,
        };
        await this.cacheResult(cacheKey, result);
        return result;
      } catch {
        this.logger.error(`Failed to decrypt default webhook for workspace ${workspaceId}`);
        return null;
      }
    }

    return null;
  }

  /**
   * Build resolved result from a config, decrypting webhook URL if present.
   */
  private async buildResolvedResult(
    config: DiscordNotificationConfig,
    integration: DiscordIntegration,
  ): Promise<{ webhookUrl: string; channelName?: string; isEnabled: boolean }> {
    let webhookUrl: string;

    if (config.webhookUrl) {
      // Config has its own webhook URL - decrypt it
      try {
        webhookUrl = this.encryptionService.decrypt(config.webhookUrl);
      } catch {
        // Fall back to default webhook
        webhookUrl = this.encryptionService.decrypt(integration.defaultWebhookUrl);
      }
    } else {
      // Use default webhook
      webhookUrl = this.encryptionService.decrypt(integration.defaultWebhookUrl);
    }

    return {
      webhookUrl,
      channelName: config.channelName || integration.defaultChannelName,
      isEnabled: config.isEnabled,
    };
  }

  /**
   * Cache a resolved result in Redis.
   * Security: The webhook URL is encrypted before caching to avoid
   * storing plaintext credentials in Redis.
   */
  private async cacheResult(
    cacheKey: string,
    result: { webhookUrl: string; channelName?: string; isEnabled: boolean },
  ): Promise<void> {
    try {
      // Encrypt the webhook URL before storing in Redis cache
      const cachePayload = {
        ...result,
        webhookUrl: this.encryptionService.encrypt(result.webhookUrl),
        _encrypted: true,
      };
      await this.redisService.set(cacheKey, JSON.stringify(cachePayload), CACHE_TTL);
    } catch (error) {
      this.logger.warn(
        `Failed to cache notification config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invalidate all cached configs for a workspace.
   * Uses Redis SCAN+DEL pattern to clear both global and project-specific
   * cache entries, avoiding stale cache after config changes.
   */
  private async invalidateCache(workspaceId: string): Promise<void> {
    try {
      // Invalidate global event type caches
      const keysToDelete: string[] = [];
      for (const eventType of DISCORD_EVENT_TYPES) {
        keysToDelete.push(`${CACHE_PREFIX}${workspaceId}:${eventType}:global`);
      }
      // Batch delete global keys
      await Promise.all(keysToDelete.map((key) => this.redisService.del(key)));

      // Also delete any project-specific cache entries via pattern scan
      // Use scanDel if available, otherwise rely on TTL expiry for project keys
      if (typeof (this.redisService as any).scanDel === 'function') {
        await (this.redisService as any).scanDel(`${CACHE_PREFIX}${workspaceId}:*`);
      } else if (typeof (this.redisService as any).keys === 'function') {
        const projectKeys = await (this.redisService as any).keys(`${CACHE_PREFIX}${workspaceId}:*`);
        if (projectKeys && projectKeys.length > 0) {
          await Promise.all(projectKeys.map((key: string) => this.redisService.del(key)));
        }
      }
      // If neither method is available, project-specific entries will expire
      // naturally via TTL (300s), which is an acceptable degradation.
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate config cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
