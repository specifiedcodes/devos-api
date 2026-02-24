/**
 * SlackNotificationService
 * Story 16.4: Slack Notification Integration (AC3)
 *
 * Core service for sending Slack notifications with rate limiting,
 * quiet hours, Block Kit formatting, and error handling.
 * Uses fetch() for Slack API calls (no @slack/web-api dependency).
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';
import { SlackBlockBuilderService } from './slack-block-builder.service';
import { NotificationEvent, NotificationType } from '../events/notification.events';

const RATE_LIMIT_PREFIX = 'slack-rl:';
const CACHE_PREFIX = 'slack-integration:';
const CACHE_TTL = 300; // 5 minutes
const CRITICAL_TYPES: NotificationType[] = ['deployment_failed', 'agent_error'];

@Injectable()
export class SlackNotificationService {
  private readonly logger = new Logger(SlackNotificationService.name);
  private readonly isConfigured: boolean;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(SlackIntegration)
    private readonly slackIntegrationRepo: Repository<SlackIntegration>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly blockBuilder: SlackBlockBuilderService,
  ) {
    this.isConfigured = !!this.configService.get<string>('SLACK_CLIENT_ID');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    if (!this.isConfigured) {
      this.logger.log('Slack integration not configured (SLACK_CLIENT_ID missing). Slack notifications disabled.');
    }
  }

  /**
   * Send a notification to Slack for a workspace.
   * Resolves channel from event type config or default channel.
   * Respects rate limits and quiet hours.
   */
  async sendNotification(
    workspaceId: string,
    notification: NotificationEvent,
  ): Promise<{ sent: boolean; channelId?: string; error?: string }> {
    if (!this.isConfigured) {
      return { sent: false, error: 'Slack not configured' };
    }

    // Get integration
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return { sent: false, error: 'No Slack integration found for workspace' };
    }

    if (integration.status !== 'active') {
      return { sent: false, error: `Slack integration status is ${integration.status}` };
    }

    // Check quiet hours
    if (this.isInQuietHours(integration) && !this.isCritical(notification.type)) {
      return { sent: false, error: 'Suppressed during quiet hours' };
    }

    // Check rate limit
    const rateLimited = await this.isRateLimited(workspaceId, integration.rateLimitPerHour);
    if (rateLimited) {
      this.logger.warn(`Slack rate limit exceeded for workspace ${workspaceId}`);
      return { sent: false, error: 'Rate limit exceeded' };
    }

    // Resolve channel
    const channelId = this.resolveChannel(integration, notification.type);
    if (!channelId) {
      return { sent: false, error: 'No Slack channel configured' };
    }

    // Build message
    const message = this.blockBuilder.buildMessage(notification.type, notification.payload, this.frontendUrl);

    // Add mention for critical events
    const mentionText = this.getMentionText(integration, notification.type);
    if (mentionText) {
      message.text = `${mentionText} ${message.text}`;
    }

    // Decrypt bot token
    let token: string;
    try {
      token = this.encryptionService.decrypt(integration.botToken);
    } catch (error) {
      this.logger.error(`Failed to decrypt Slack token for workspace ${workspaceId}`);
      await this.recordError(integration, 'Failed to decrypt bot token');
      return { sent: false, error: 'Failed to decrypt bot token' };
    }

    // Send to Slack
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          ...message,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await response.json() as any;

      if (!result.ok) {
        // Handle specific Slack errors
        if (result.error === 'invalid_auth' || result.error === 'token_revoked') {
          await this.slackIntegrationRepo.update(
            { id: integration.id },
            { status: 'revoked', lastError: result.error, lastErrorAt: new Date() },
          );
          // Invalidate cache
          await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
          return { sent: false, error: result.error };
        }

        if (response.status === 429) {
          await this.recordError(integration, 'Slack rate limited (429)');
          return { sent: false, error: 'Slack API rate limited' };
        }

        await this.recordError(integration, result.error || 'Unknown Slack API error');
        return { sent: false, error: result.error };
      }

      // Success - update stats
      await this.recordSuccess(workspaceId, integration);

      return { sent: true, channelId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Slack API call failed for workspace ${workspaceId}: ${errorMsg}`);
      await this.recordError(integration, errorMsg);
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Get Slack integration for a workspace (cached).
   */
  async getIntegration(workspaceId: string): Promise<SlackIntegration | null> {
    // Try cache first
    const cached = await this.redisService.get(`${CACHE_PREFIX}${workspaceId}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    const integration = await this.slackIntegrationRepo.findOne({
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
   * Test Slack connection by sending a test message.
   */
  async testConnection(workspaceId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Slack not configured' };
    }

    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return { success: false, error: 'No Slack integration found' };
    }

    const channelId = integration.defaultChannelId;
    if (!channelId) {
      return { success: false, error: 'No default channel configured' };
    }

    let token: string;
    try {
      token = this.encryptionService.decrypt(integration.botToken);
    } catch {
      return { success: false, error: 'Failed to decrypt bot token' };
    }

    try {
      const message = this.blockBuilder.buildTestMessage();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: channelId, ...message }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const result = await response.json() as any;

      if (!result.ok) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * List available channels for channel selection UI.
   */
  async listChannels(workspaceId: string): Promise<Array<{ id: string; name: string; isPrivate: boolean }>> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      return [];
    }

    let token: string;
    try {
      token = this.encryptionService.decrypt(integration.botToken);
    } catch {
      return [];
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200',
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);
      const result = await response.json() as any;

      if (!result.ok) {
        this.logger.error(`Failed to list Slack channels: ${result.error}`);
        return [];
      }

      return (result.channels || []).map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.is_private || false,
      }));
    } catch (error) {
      this.logger.error('Failed to list Slack channels', error instanceof Error ? error.stack : String(error));
      return [];
    }
  }

  /**
   * Update event-to-channel routing configuration.
   */
  async updateEventChannelConfig(
    workspaceId: string,
    config: Record<string, { channelId: string; channelName: string }>,
  ): Promise<SlackIntegration> {
    const integration = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new Error('No Slack integration found for workspace');
    }

    integration.eventChannelConfig = config;
    const saved = await this.slackIntegrationRepo.save(integration);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);

    return saved;
  }

  /**
   * Update Slack integration configuration fields.
   * Applies only the provided fields (partial update), invalidates cache.
   */
  async updateConfig(
    workspaceId: string,
    config: {
      defaultChannelId?: string;
      defaultChannelName?: string;
      eventChannelConfig?: Record<string, { channelId: string; channelName: string }>;
      quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string };
      rateLimitPerHour?: number;
      mentionConfig?: Record<string, string | null>;
    },
  ): Promise<SlackIntegration> {
    const integration = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new Error('No Slack integration found for workspace');
    }

    const updateData: Partial<SlackIntegration> = {};
    if (config.defaultChannelId !== undefined) updateData.defaultChannelId = config.defaultChannelId;
    if (config.defaultChannelName !== undefined) updateData.defaultChannelName = config.defaultChannelName;
    if (config.eventChannelConfig !== undefined) updateData.eventChannelConfig = config.eventChannelConfig;
    if (config.quietHoursConfig !== undefined) updateData.quietHoursConfig = config.quietHoursConfig;
    if (config.rateLimitPerHour !== undefined) updateData.rateLimitPerHour = config.rateLimitPerHour;
    if (config.mentionConfig !== undefined) updateData.mentionConfig = config.mentionConfig;

    if (Object.keys(updateData).length > 0) {
      await this.slackIntegrationRepo.update({ workspaceId }, updateData as any);
    }

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);

    // Fetch and return updated integration
    const updated = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });
    return updated!;
  }

  /**
   * Disconnect Slack integration (revoke token, delete record).
   */
  async disconnect(workspaceId: string): Promise<void> {
    const integration = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return;
    }

    // Try to revoke token
    let revokeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = this.encryptionService.decrypt(integration.botToken);
      const controller = new AbortController();
      revokeTimeout = setTimeout(() => controller.abort(), 10000);

      await fetch('https://slack.com/api/auth.revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.warn('Failed to revoke Slack token during disconnect', error instanceof Error ? error.stack : String(error));
    } finally {
      if (revokeTimeout) clearTimeout(revokeTimeout);
    }

    // Delete record
    await this.slackIntegrationRepo.remove(integration);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
  }

  /**
   * Resolve the target Slack channel for a notification type.
   */
  private resolveChannel(integration: SlackIntegration, type: NotificationType): string | null {
    // Check event-specific channel config
    const eventConfig = integration.eventChannelConfig?.[type];
    if (eventConfig?.channelId) {
      return eventConfig.channelId;
    }

    // Fall back to default channel
    return integration.defaultChannelId || null;
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
  private isInQuietHours(integration: SlackIntegration): boolean {
    const config = integration.quietHoursConfig;
    if (!config || !config.enabled) {
      return false;
    }

    try {
      const now = new Date();
      // Parse start and end times
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
        // Same day range (e.g., 09:00 - 17:00)
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight range (e.g., 22:00 - 08:00)
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check rate limit using Redis sorted set.
   */
  private async isRateLimited(workspaceId: string, limitPerHour: number): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${workspaceId}`;
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Prune old entries
    await this.redisService.zremrangebyscore(key, 0, oneHourAgo);

    // Set TTL to prevent orphaned keys if all entries are pruned
    await this.redisService.expire(key, 3600);

    // Count entries in the last hour
    const entries = await this.redisService.zrangebyscore(key, oneHourAgo, now);

    return entries.length >= limitPerHour;
  }

  /**
   * Record successful send in rate limiter and update stats.
   */
  private async recordSuccess(workspaceId: string, integration: SlackIntegration): Promise<void> {
    const key = `${RATE_LIMIT_PREFIX}${workspaceId}`;
    const now = Date.now();

    // Add to rate limit sorted set
    await this.redisService.zadd(key, now, `${now}`);
    await this.redisService.expire(key, 3600);

    // Update stats
    await this.slackIntegrationRepo.update(
      { id: integration.id },
      {
        lastMessageAt: new Date(),
        messageCount: () => 'message_count + 1',
        errorCount: 0, // Reset consecutive error count on success
      } as any,
    );

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
  }

  /**
   * Record an error and potentially set status to 'error'.
   */
  private async recordError(integration: SlackIntegration, errorMsg: string): Promise<void> {
    const newErrorCount = (integration.errorCount || 0) + 1;
    const updateData: any = {
      errorCount: newErrorCount,
      lastError: errorMsg,
      lastErrorAt: new Date(),
    };

    // After 3 consecutive errors, set status to 'error'
    if (newErrorCount >= 3) {
      updateData.status = 'error';
      this.logger.warn(`Slack integration for workspace ${integration.workspaceId} set to error after ${newErrorCount} consecutive failures`);
    }

    await this.slackIntegrationRepo.update({ id: integration.id }, updateData);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${integration.workspaceId}`);
  }

  /**
   * Get mention text for a notification type based on mention config.
   */
  private getMentionText(integration: SlackIntegration, type: NotificationType): string | null {
    if (!integration.mentionConfig) return null;

    if (this.isCritical(type) && integration.mentionConfig.critical) {
      return `<!${integration.mentionConfig.critical.replace('@', '')}>`;
    }

    if (integration.mentionConfig.normal) {
      return integration.mentionConfig.normal;
    }

    return null;
  }
}
