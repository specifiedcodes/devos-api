/**
 * DiscordNotificationService
 * Story 16.5: Discord Notification Integration (AC3)
 * Story 21.3: Discord Webhook Integration (AC3, AC8)
 *
 * Core service for sending Discord notifications via webhooks with rate limiting,
 * quiet hours, embed formatting, and error handling.
 * Uses fetch() for Discord API calls (no discord.js dependency).
 *
 * Enhanced in Story 21.3 with:
 * - getDetailedStatus: Full integration status for frontend health display
 * - verifyWebhook: Validate webhook URL via Discord API
 * - DiscordNotificationConfigService integration for per-event routing
 * - seedDefaultConfigs on new integration creation
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';
import { DiscordEmbedBuilderService } from './discord-embed-builder.service';
import { NotificationEvent, NotificationType } from '../events/notification.events';
import { DiscordNotificationConfigService } from '../../integrations/discord/services/discord-notification-config.service';

const RATE_LIMIT_PREFIX = 'discord-rl:';
const CACHE_PREFIX = 'discord-integration:';
const CACHE_TTL = 300; // 5 minutes
const CRITICAL_TYPES: NotificationType[] = ['deployment_failed', 'agent_error'];
const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/(\d+)\/([\w-]+)$/;

@Injectable()
export class DiscordNotificationService {
  private readonly logger = new Logger(DiscordNotificationService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(DiscordIntegration)
    private readonly discordIntegrationRepo: Repository<DiscordIntegration>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly embedBuilder: DiscordEmbedBuilderService,
    @Optional() @Inject(DiscordNotificationConfigService)
    private readonly notificationConfigService?: DiscordNotificationConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Send a notification to Discord for a workspace.
   * Resolves webhook from event type config or default webhook.
   * Respects rate limits (30/min per webhook) and quiet hours.
   */
  async sendNotification(
    workspaceId: string,
    notification: NotificationEvent,
  ): Promise<{ sent: boolean; channelName?: string; error?: string; retryAfter?: number }> {
    // Get integration
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return { sent: false, error: 'No Discord integration found for workspace' };
    }

    if (integration.status !== 'active') {
      return { sent: false, error: `Discord integration status is ${integration.status}` };
    }

    // Check quiet hours
    if (this.isInQuietHours(integration) && !this.isCritical(notification.type)) {
      return { sent: false, error: 'Suppressed during quiet hours' };
    }

    // Resolve webhook URL and ID
    const webhookInfo = await this.resolveWebhook(integration, notification.type);
    if (!webhookInfo) {
      return { sent: false, error: 'No Discord webhook configured' };
    }

    // Check rate limit using webhook ID
    const rateLimited = await this.isRateLimited(webhookInfo.webhookId, integration.rateLimitPerMinute);
    if (rateLimited) {
      this.logger.warn(`Discord rate limit exceeded for webhook ${webhookInfo.webhookId} in workspace ${workspaceId}`);
      return { sent: false, error: 'Rate limit exceeded' };
    }

    // Build message
    const message = this.embedBuilder.buildMessage(notification.type, notification.payload, this.frontendUrl);

    // Add mention for critical events
    const mentionText = this.getMentionText(integration, notification.type);
    if (mentionText) {
      message.content = `${mentionText} ${message.content}`;
    }

    // Send to Discord
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(webhookInfo.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: message.content || '',
            embeds: message.embeds,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      // Discord returns 204 No Content on success
      if (response.status === 204 || response.status === 200) {
        // Success - update stats
        await this.recordSuccess(workspaceId, webhookInfo.webhookId, integration);
        return { sent: true, channelName: webhookInfo.channelName };
      }

      // Handle 429 rate limit
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
        this.logger.warn(`Discord rate limited (429) for workspace ${workspaceId}, retry after ${retryAfter}s`);
        await this.recordError(integration, 'Discord rate limited (429)');
        return { sent: false, error: 'Discord rate limited', retryAfter };
      }

      // Handle 404 - webhook deleted
      if (response.status === 404) {
        await this.discordIntegrationRepo.update(
          { id: integration.id },
          { status: 'invalid_webhook', lastError: 'Webhook not found (404)', lastErrorAt: new Date() },
        );
        await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
        return { sent: false, error: 'Webhook not found (deleted)' };
      }

      // Handle 401 - webhook invalid
      if (response.status === 401) {
        await this.discordIntegrationRepo.update(
          { id: integration.id },
          { status: 'invalid_webhook', lastError: 'Webhook unauthorized (401)', lastErrorAt: new Date() },
        );
        await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
        return { sent: false, error: 'Webhook unauthorized' };
      }

      // Other errors
      let errorMsg = `Discord API error: ${response.status}`;
      try {
        const errorBody = await response.json() as any;
        if (errorBody.message) {
          errorMsg = errorBody.message;
        }
      } catch {
        // Ignore JSON parse errors
      }

      await this.recordError(integration, errorMsg);
      return { sent: false, error: errorMsg };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Discord API call failed for workspace ${workspaceId}: ${errorMsg}`);
      await this.recordError(integration, errorMsg);
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Get Discord integration for a workspace (cached).
   */
  async getIntegration(workspaceId: string): Promise<DiscordIntegration | null> {
    // Try cache first
    const cached = await this.redisService.get(`${CACHE_PREFIX}${workspaceId}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    const integration = await this.discordIntegrationRepo.findOne({
      where: { workspaceId },
    });

    if (integration) {
      // Cache the result
      await this.redisService.set(
        `${CACHE_PREFIX}${workspaceId}`,
        JSON.stringify(integration),
        CACHE_TTL,
      );
    }

    return integration;
  }

  /**
   * Add or update a Discord webhook for a workspace.
   * Validates the webhook URL, extracts webhook ID, sends a test message.
   */
  async addWebhook(
    workspaceId: string,
    userId: string,
    webhookUrl: string,
    channelName?: string,
  ): Promise<{ success: boolean; guildName?: string; channelName?: string; error?: string }> {
    // Validate webhook URL format
    const match = webhookUrl.match(DISCORD_WEBHOOK_URL_PATTERN);
    if (!match) {
      return { success: false, error: 'Invalid Discord webhook URL format' };
    }

    const webhookId = match[2];
    const webhookToken = match[3];

    // Validate webhook by calling Discord GET endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
          method: 'GET',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return { success: false, error: 'Invalid webhook URL - Discord returned error' };
      }

      const webhookInfo = await response.json() as any;
      const guildId = webhookInfo.guild_id || undefined;
      const guildName = webhookInfo.name || undefined;

      // Encrypt webhook URL
      const encrypted = this.encryptionService.encrypt(webhookUrl);

      // Check if integration already exists for this workspace
      const existing = await this.discordIntegrationRepo.findOne({ where: { workspaceId } });

      if (existing) {
        // Update existing
        // Note: webhookToken is NOT stored separately to avoid plaintext credential leakage.
        // The token is part of the encrypted defaultWebhookUrl and extracted at runtime via URL parsing.
        await this.discordIntegrationRepo.update(
          { id: existing.id },
          {
            defaultWebhookUrl: encrypted,
            defaultWebhookUrlIv: 'embedded',
            defaultWebhookId: webhookId,
            defaultWebhookToken: null, // Token is embedded in encrypted URL; don't store in plaintext
            defaultChannelName: channelName || existing.defaultChannelName,
            guildId,
            guildName,
            status: 'active',
            errorCount: 0,
            lastError: null,
          },
        );
      } else {
        // Create new
        const newIntegration = this.discordIntegrationRepo.create({
          workspaceId,
          defaultWebhookUrl: encrypted,
          defaultWebhookUrlIv: 'embedded',
          defaultWebhookId: webhookId,
          defaultWebhookToken: undefined, // Token is embedded in encrypted URL; don't store in plaintext
          defaultChannelName: channelName,
          guildId,
          guildName,
          connectedBy: userId,
          status: 'active',
          eventWebhookConfig: {},
          mentionConfig: { critical: null, normal: null },
          rateLimitPerMinute: 30,
          messageCount: 0,
          errorCount: 0,
        });
        const savedIntegration = await this.discordIntegrationRepo.save(newIntegration);

        // Story 21.3 AC8: Seed default notification configs for new integration
        if (this.notificationConfigService) {
          try {
            await this.notificationConfigService.seedDefaultConfigs(savedIntegration.id);
          } catch (seedError) {
            // Seed failure is non-critical - don't fail the main flow
            this.logger.warn(
              `Failed to seed default notification configs for workspace ${workspaceId}: ${seedError instanceof Error ? seedError.message : String(seedError)}`,
            );
          }
        }
      }

      // Invalidate cache
      await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);

      // Send test message
      const testMessage = this.embedBuilder.buildTestMessage();
      try {
        const testController = new AbortController();
        const testTimeout = setTimeout(() => testController.abort(), 10000);

        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: testMessage.content,
              embeds: testMessage.embeds,
            }),
            signal: testController.signal,
          });
        } finally {
          clearTimeout(testTimeout);
        }
      } catch {
        // Test message failure is non-critical
        this.logger.warn(`Failed to send test message to Discord webhook for workspace ${workspaceId}`);
      }

      return {
        success: true,
        guildName,
        channelName: channelName || webhookInfo.channel_id,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Test Discord webhook by sending a test embed.
   */
  async testConnection(workspaceId: string): Promise<{ success: boolean; error?: string }> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return { success: false, error: 'No Discord integration found' };
    }

    // Decrypt webhook URL
    let webhookUrl: string;
    try {
      webhookUrl = this.encryptionService.decrypt(integration.defaultWebhookUrl);
    } catch {
      return { success: false, error: 'Failed to decrypt webhook URL' };
    }

    try {
      const message = this.embedBuilder.buildTestMessage();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: message.content,
            embeds: message.embeds,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 204 || response.status === 200) {
        return { success: true };
      }

      return { success: false, error: `Discord returned status ${response.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Update event-to-webhook routing configuration.
   */
  async updateEventWebhookConfig(
    workspaceId: string,
    config: Record<string, { webhookUrl: string; channelName: string }>,
  ): Promise<DiscordIntegration> {
    const integration = await this.discordIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new Error('No Discord integration found for workspace');
    }

    // Encrypt each webhook URL in the config
    const encryptedConfig: Record<string, { webhookUrl: string; webhookUrlIv: string; channelName: string }> = {};
    for (const [eventType, eventConfig] of Object.entries(config)) {
      const encrypted = this.encryptionService.encrypt(eventConfig.webhookUrl);
      encryptedConfig[eventType] = {
        webhookUrl: encrypted,
        webhookUrlIv: 'embedded',
        channelName: eventConfig.channelName,
      };
    }

    integration.eventWebhookConfig = encryptedConfig;
    const saved = await this.discordIntegrationRepo.save(integration);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);

    return saved;
  }

  /**
   * Update Discord integration configuration fields.
   * Applies only the provided fields (partial update), invalidates cache.
   */
  async updateConfig(
    workspaceId: string,
    config: {
      name?: string;
      defaultWebhookUrl?: string;
      defaultChannelName?: string;
      eventWebhookConfig?: Record<string, { webhookUrl: string; channelName: string }>;
      quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string };
      rateLimitPerMinute?: number;
      mentionConfig?: Record<string, string | null>;
    },
  ): Promise<DiscordIntegration> {
    const integration = await this.discordIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new Error('No Discord integration found for workspace');
    }

    const updateData: Partial<DiscordIntegration> = {};
    if (config.name !== undefined) updateData.name = config.name;
    if (config.defaultChannelName !== undefined) updateData.defaultChannelName = config.defaultChannelName;
    if (config.quietHoursConfig !== undefined) updateData.quietHoursConfig = config.quietHoursConfig;
    if (config.rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = config.rateLimitPerMinute;
    if (config.mentionConfig !== undefined) updateData.mentionConfig = config.mentionConfig;

    // Handle webhook URL update (needs encryption)
    if (config.defaultWebhookUrl !== undefined) {
      const match = config.defaultWebhookUrl.match(DISCORD_WEBHOOK_URL_PATTERN);
      if (match) {
        const encrypted = this.encryptionService.encrypt(config.defaultWebhookUrl);
        updateData.defaultWebhookUrl = encrypted;
        updateData.defaultWebhookUrlIv = 'embedded';
        updateData.defaultWebhookId = match[2];
        // Token is embedded in encrypted URL; don't store in plaintext column
        updateData.defaultWebhookToken = undefined;
      }
    }

    // Handle event webhook config (needs encryption)
    if (config.eventWebhookConfig !== undefined) {
      const encryptedConfig: Record<string, { webhookUrl: string; webhookUrlIv: string; channelName: string }> = {};
      for (const [eventType, eventConfig] of Object.entries(config.eventWebhookConfig)) {
        const encrypted = this.encryptionService.encrypt(eventConfig.webhookUrl);
        encryptedConfig[eventType] = {
          webhookUrl: encrypted,
          webhookUrlIv: 'embedded',
          channelName: eventConfig.channelName,
        };
      }
      updateData.eventWebhookConfig = encryptedConfig;
    }

    if (Object.keys(updateData).length > 0) {
      await this.discordIntegrationRepo
        .createQueryBuilder()
        .update(DiscordIntegration)
        .set(updateData)
        .where('workspace_id = :workspaceId', { workspaceId })
        .execute();
    }

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);

    // Fetch and return updated integration
    const updated = await this.discordIntegrationRepo.findOne({ where: { workspaceId } });
    return updated!;
  }

  /**
   * Disconnect Discord integration (delete record, invalidate cache).
   */
  async disconnect(workspaceId: string): Promise<void> {
    // Delete record directly without a separate findOne query.
    // The controller already checks existence before calling this method.
    // No token revocation needed for webhooks (unlike Slack OAuth).
    await this.discordIntegrationRepo.delete({ workspaceId });

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
  }

  /**
   * Get detailed integration status for frontend display.
   * Includes connection health, stats, and config summary.
   * Story 21.3 AC3
   */
  async getDetailedStatus(
    workspaceId: string,
  ): Promise<{
    connected: boolean;
    name?: string;
    guildName?: string;
    guildId?: string;
    defaultWebhookId?: string;
    defaultChannelName?: string;
    status?: string;
    quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;
    rateLimitPerMinute?: number;
    mentionConfig?: Record<string, string | null>;
    messageCount?: number;
    errorCount?: number;
    lastMessageAt?: string;
    lastError?: string;
    lastErrorAt?: string;
    connectedAt?: string;
    connectedBy?: string;
  }> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      name: integration.name,
      guildName: integration.guildName,
      guildId: integration.guildId,
      defaultWebhookId: integration.defaultWebhookId,
      defaultChannelName: integration.defaultChannelName,
      status: integration.status,
      quietHoursConfig: integration.quietHoursConfig,
      rateLimitPerMinute: integration.rateLimitPerMinute,
      mentionConfig: integration.mentionConfig,
      messageCount: integration.messageCount,
      errorCount: integration.errorCount,
      lastMessageAt: integration.lastMessageAt?.toISOString?.() || (integration.lastMessageAt as unknown as string) || undefined,
      lastError: integration.lastError || undefined,
      lastErrorAt: integration.lastErrorAt?.toISOString?.() || (integration.lastErrorAt as unknown as string) || undefined,
      connectedAt: integration.connectedAt?.toISOString?.() || (integration.connectedAt as unknown as string) || undefined,
      connectedBy: integration.connectedBy,
    };
  }

  /**
   * Verify a Discord webhook URL is valid by calling Discord GET API.
   * Does NOT send a message - just validates the webhook exists.
   * Story 21.3 AC3
   */
  async verifyWebhook(
    webhookUrl: string,
  ): Promise<{ valid: boolean; guildName?: string; channelName?: string; error?: string }> {
    const match = webhookUrl.match(DISCORD_WEBHOOK_URL_PATTERN);
    if (!match) {
      return { valid: false, error: 'Invalid Discord webhook URL format' };
    }

    const webhookId = match[2];
    const webhookToken = match[3];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
          method: 'GET',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return { valid: false, error: `Discord returned status ${response.status}` };
      }

      const webhookInfo = await response.json() as Record<string, unknown>;
      return {
        valid: true,
        guildName: (webhookInfo.name as string) || undefined,
        channelName: (webhookInfo.channel_id as string) || undefined,
      };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Resolve the target Discord webhook for a notification type.
   * Returns decrypted webhook URL and webhook ID.
   *
   * Resolution order (Story 21.3 AC3):
   * 1. DiscordNotificationConfigService (per-event config table) - if available
   * 2. Legacy JSONB eventWebhookConfig - backward compatibility fallback
   * 3. Default webhook URL
   */
  private async resolveWebhook(
    integration: DiscordIntegration,
    type: NotificationType,
    projectId?: string,
  ): Promise<{ webhookUrl: string; webhookId: string; channelName?: string } | null> {
    // 1. Check DiscordNotificationConfigService first (Story 21.3)
    if (this.notificationConfigService) {
      try {
        const configResult = await this.notificationConfigService.resolveWebhookForEvent(
          integration.workspaceId,
          type,
          projectId,
        );
        if (configResult && configResult.isEnabled) {
          const match = configResult.webhookUrl.match(DISCORD_WEBHOOK_URL_PATTERN);
          return {
            webhookUrl: configResult.webhookUrl,
            webhookId: match ? match[2] : 'unknown',
            channelName: configResult.channelName,
          };
        }
        // If config exists but is disabled, skip this event
        if (configResult && !configResult.isEnabled) {
          return null;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to resolve webhook from config service for type ${type}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fall through to legacy config
      }
    }

    // 2. Fall back to legacy JSONB eventWebhookConfig
    const eventConfig = integration.eventWebhookConfig?.[type];
    if (eventConfig?.webhookUrl) {
      try {
        const decryptedUrl = this.encryptionService.decrypt(eventConfig.webhookUrl);
        const match = decryptedUrl.match(DISCORD_WEBHOOK_URL_PATTERN);
        if (match) {
          return {
            webhookUrl: decryptedUrl,
            webhookId: match[2],
            channelName: eventConfig.channelName,
          };
        }
      } catch {
        this.logger.error(`Failed to decrypt event-specific webhook for type ${type}`);
      }
    }

    // 3. Fall back to default webhook
    if (!integration.defaultWebhookUrl) {
      return null;
    }

    try {
      const decryptedUrl = this.encryptionService.decrypt(integration.defaultWebhookUrl);
      return {
        webhookUrl: decryptedUrl,
        webhookId: integration.defaultWebhookId || 'unknown',
        channelName: integration.defaultChannelName,
      };
    } catch {
      this.logger.error(`Failed to decrypt default webhook for workspace ${integration.workspaceId}`);
      return null;
    }
  }

  /**
   * Check if a notification type is critical (bypasses quiet hours).
   */
  private isCritical(type: NotificationType): boolean {
    return CRITICAL_TYPES.includes(type);
  }

  /**
   * Check if current time is within quiet hours.
   */
  private isInQuietHours(integration: DiscordIntegration): boolean {
    const config = integration.quietHoursConfig;
    if (!config || !config.enabled) {
      return false;
    }

    try {
      const now = new Date();
      const [startHour, startMin] = config.startTime.split(':').map(Number);
      const [endHour, endMin] = config.endTime.split(':').map(Number);

      // Convert current time to the configured timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone || 'UTC',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const currentMin = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

      const currentMinutes = currentHour * 60 + currentMin;
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check rate limit using Redis sorted set (30/min per webhook).
   */
  private async isRateLimited(webhookId: string, limitPerMinute: number): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${webhookId}`;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Prune old entries first (before count to avoid stale data)
    await this.redisService.zremrangebyscore(key, 0, oneMinuteAgo);

    // Count entries in the last minute
    const entries = await this.redisService.zrangebyscore(key, oneMinuteAgo, now);

    // Set TTL after count to ensure key exists (set by prior zadd calls);
    // expire on potentially empty key is a harmless no-op
    if (entries.length > 0) {
      await this.redisService.expire(key, 120);
    }

    return entries.length >= limitPerMinute;
  }

  /**
   * Record successful send in rate limiter and update stats.
   */
  private async recordSuccess(workspaceId: string, webhookId: string, integration: DiscordIntegration): Promise<void> {
    const key = `${RATE_LIMIT_PREFIX}${webhookId}`;
    const now = Date.now();

    // Add to rate limit sorted set
    await this.redisService.zadd(key, now, `${now}`);
    await this.redisService.expire(key, 120);

    // Update stats using QueryBuilder for atomic increment (avoids unsafe `as any`)
    await this.discordIntegrationRepo
      .createQueryBuilder()
      .update(DiscordIntegration)
      .set({
        lastMessageAt: new Date(),
        errorCount: 0, // Reset consecutive error count on success
      })
      .where('id = :id', { id: integration.id })
      .execute();

    // Atomic increment of message_count to avoid race conditions
    await this.discordIntegrationRepo
      .createQueryBuilder()
      .update(DiscordIntegration)
      .set({ messageCount: () => 'message_count + 1' })
      .where('id = :id', { id: integration.id })
      .execute();

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
  }

  /**
   * Record an error and potentially set status to 'error'.
   * Uses atomic QueryBuilder increment to avoid race conditions
   * with concurrent error recording.
   */
  private async recordError(integration: DiscordIntegration, errorMsg: string): Promise<void> {
    // Atomic increment of error_count + set lastError/lastErrorAt
    await this.discordIntegrationRepo
      .createQueryBuilder()
      .update(DiscordIntegration)
      .set({
        lastError: errorMsg,
        lastErrorAt: new Date(),
        errorCount: () => 'error_count + 1',
      })
      .where('id = :id', { id: integration.id })
      .execute();

    // After 3 consecutive errors, set status to 'error'
    // Use a conditional update to atomically check and set status
    const result = await this.discordIntegrationRepo
      .createQueryBuilder()
      .update(DiscordIntegration)
      .set({ status: 'error' })
      .where('id = :id AND error_count >= 3 AND status != :errorStatus', {
        id: integration.id,
        errorStatus: 'error',
      })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.warn(`Discord integration for workspace ${integration.workspaceId} set to error after 3+ consecutive failures`);
    }

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${integration.workspaceId}`);
  }

  /**
   * Get mention text for a notification type based on mention config.
   */
  private getMentionText(integration: DiscordIntegration, type: NotificationType): string | null {
    if (!integration.mentionConfig) return null;

    if (this.isCritical(type) && integration.mentionConfig.critical) {
      return integration.mentionConfig.critical;
    }

    if (integration.mentionConfig.normal) {
      return integration.mentionConfig.normal;
    }

    return null;
  }
}
