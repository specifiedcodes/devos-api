/**
 * SlackNotificationConfigService
 * Story 21.2: Slack Interactive Components (AC6)
 *
 * CRUD service for per-project, per-event notification routing.
 * Provides granular channel resolution with caching.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlackNotificationConfig } from '../../../../database/entities/slack-notification-config.entity';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { RedisService } from '../../../redis/redis.service';
import { UpsertNotificationConfigDto } from '../dto/slack-interaction.dto';

const CACHE_PREFIX = 'slack-notif-config:';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class SlackNotificationConfigService {
  private readonly logger = new Logger(SlackNotificationConfigService.name);

  constructor(
    @InjectRepository(SlackNotificationConfig)
    private readonly configRepo: Repository<SlackNotificationConfig>,
    @InjectRepository(SlackIntegration)
    private readonly integrationRepo: Repository<SlackIntegration>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get all notification configs for a Slack integration.
   */
  async getConfigs(slackIntegrationId: string): Promise<SlackNotificationConfig[]> {
    return this.configRepo.find({
      where: { slackIntegrationId },
      order: { eventType: 'ASC' },
    });
  }

  /**
   * Create or update a notification routing config.
   * Upserts based on (slackIntegrationId, eventType).
   */
  async upsertConfig(dto: UpsertNotificationConfigDto): Promise<SlackNotificationConfig> {
    // Check if config already exists for this integration + event type
    const existing = await this.configRepo.findOne({
      where: {
        slackIntegrationId: dto.slackIntegrationId,
        eventType: dto.eventType,
      },
    });

    if (existing) {
      // Update existing
      existing.channelId = dto.channelId;
      if (dto.channelName !== undefined) {
        existing.channelName = dto.channelName;
      }
      if (dto.projectId !== undefined) {
        existing.projectId = dto.projectId || null;
      }
      if (dto.isEnabled !== undefined) {
        existing.isEnabled = dto.isEnabled;
      }

      const updated = await this.configRepo.save(existing);

      // Invalidate cache
      await this.invalidateCache(dto.slackIntegrationId);

      return updated;
    }

    // Create new config
    const config = this.configRepo.create({
      slackIntegrationId: dto.slackIntegrationId,
      projectId: dto.projectId || null,
      eventType: dto.eventType,
      channelId: dto.channelId,
      channelName: dto.channelName,
      isEnabled: dto.isEnabled ?? true,
    });

    const saved = await this.configRepo.save(config);

    // Invalidate cache
    await this.invalidateCache(dto.slackIntegrationId);

    return saved;
  }

  /**
   * Delete a notification config.
   */
  async deleteConfig(id: string): Promise<void> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException('Notification config not found');
    }

    const integrationId = config.slackIntegrationId;
    await this.configRepo.remove(config);

    // Invalidate cache
    await this.invalidateCache(integrationId);
  }

  /**
   * Resolve the channel for a given event type and optional project.
   * Priority order:
   * 1. Project-specific config for event type
   * 2. Global config (projectId = null) for event type
   * 3. SlackIntegration.eventChannelConfig[eventType]
   * 4. SlackIntegration.defaultChannelId
   */
  async getChannelForEvent(
    workspaceId: string,
    eventType: string,
    projectId?: string,
  ): Promise<{ channelId: string; channelName?: string } | null> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);
    let configs: SlackNotificationConfig[];

    if (cached) {
      try {
        configs = JSON.parse(cached);
      } catch {
        configs = await this.loadAndCacheConfigs(workspaceId, cacheKey);
      }
    } else {
      configs = await this.loadAndCacheConfigs(workspaceId, cacheKey);
    }

    // 1. Project-specific config for event type
    if (projectId) {
      const projectConfig = configs.find(
        c => c.eventType === eventType && c.projectId === projectId && c.isEnabled,
      );
      if (projectConfig) {
        return { channelId: projectConfig.channelId, channelName: projectConfig.channelName };
      }
    }

    // 2. Global config (projectId = null) for event type
    const globalConfig = configs.find(
      c => c.eventType === eventType && !c.projectId && c.isEnabled,
    );
    if (globalConfig) {
      return { channelId: globalConfig.channelId, channelName: globalConfig.channelName };
    }

    // 3. Fall back to SlackIntegration.eventChannelConfig
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return null;
    }

    const eventConfig = integration.eventChannelConfig?.[eventType];
    if (eventConfig) {
      return { channelId: eventConfig.channelId, channelName: eventConfig.channelName };
    }

    // 4. Fall back to default channel
    if (integration.defaultChannelId) {
      return {
        channelId: integration.defaultChannelId,
        channelName: integration.defaultChannelName,
      };
    }

    return null;
  }

  /**
   * Load configs from DB and cache them.
   */
  private async loadAndCacheConfigs(
    workspaceId: string,
    cacheKey: string,
  ): Promise<SlackNotificationConfig[]> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return [];
    }

    const configs = await this.configRepo.find({
      where: { slackIntegrationId: integration.id },
    });

    try {
      await this.redisService.set(cacheKey, JSON.stringify(configs), CACHE_TTL);
    } catch (error) {
      this.logger.warn(
        `Failed to cache notification configs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return configs;
  }

  /**
   * Invalidate cached configs for an integration.
   */
  private async invalidateCache(slackIntegrationId: string): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: slackIntegrationId },
      });
      if (integration) {
        await this.redisService.del(`${CACHE_PREFIX}${integration.workspaceId}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate config cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
