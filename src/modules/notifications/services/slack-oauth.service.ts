/**
 * SlackOAuthService
 * Story 16.4: Slack Notification Integration (AC4)
 *
 * Handles Slack OAuth 2.0 flow, token encryption, and signature verification.
 * Uses fetch() for Slack API calls (no @slack/web-api dependency).
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';

const OAUTH_STATE_PREFIX = 'slack-oauth-state:';
const OAUTH_STATE_TTL = 600; // 10 minutes

@Injectable()
export class SlackOAuthService {
  private readonly logger = new Logger(SlackOAuthService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly signingSecret: string | undefined;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(SlackIntegration)
    private readonly slackIntegrationRepo: Repository<SlackIntegration>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {
    this.clientId = this.configService.get<string>('SLACK_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('SLACK_CLIENT_SECRET');
    this.signingSecret = this.configService.get<string>('SLACK_SIGNING_SECRET');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Generate Slack OAuth authorization URL.
   * Stores state parameter in Redis for CSRF protection.
   */
  async getAuthorizationUrl(workspaceId: string, userId: string): Promise<string> {
    if (!this.clientId) {
      throw new BadRequestException('Slack integration is not configured. Missing SLACK_CLIENT_ID.');
    }

    // Generate cryptographically random state parameter
    const state = crypto.randomBytes(32).toString('hex');

    // Store in Redis with 10-minute TTL
    await this.redisService.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({ workspaceId, userId }),
      OAUTH_STATE_TTL,
    );

    // Build OAuth URL - Story 21.1: Enhanced scopes for Events API, user mapping, slash commands
    const scopes = 'chat:write,channels:read,groups:read,incoming-webhook,commands,users:read,users:read.email,app_mentions:read';
    const redirectUri = `${this.frontendUrl}/integrations/slack/callback`;
    const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(this.clientId)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    return url;
  }

  /**
   * Handle OAuth callback from Slack.
   * Exchanges code for token, stores encrypted token.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ workspaceId: string; teamName: string }> {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException('Slack integration is not configured. Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET.');
    }

    // Validate state parameter from Redis (CSRF check)
    const stateData = await this.redisService.get(`${OAUTH_STATE_PREFIX}${state}`);
    if (!stateData) {
      throw new BadRequestException('Invalid or expired OAuth state parameter');
    }

    const { workspaceId, userId } = JSON.parse(stateData);

    // Exchange code for token
    const redirectUri = `${this.frontendUrl}/integrations/slack/callback`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let tokenResponse: any;
    try {
      const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: redirectUri,
        }).toString(),
        signal: controller.signal,
      });

      tokenResponse = await response.json();
    } catch (error) {
      this.logger.error('Failed to exchange Slack OAuth code', error instanceof Error ? error.stack : String(error));
      throw new BadRequestException('Failed to exchange code with Slack');
    } finally {
      clearTimeout(timeout);
    }

    if (!tokenResponse.ok) {
      this.logger.error(`Slack OAuth error: ${tokenResponse.error}`);
      throw new BadRequestException(`Slack OAuth failed: ${tokenResponse.error}`);
    }

    // Extract from response
    const accessToken = tokenResponse.access_token;
    const teamId = tokenResponse.team?.id;
    const teamName = tokenResponse.team?.name || '';
    const botUserId = tokenResponse.bot_user_id;
    const incomingWebhook = tokenResponse.incoming_webhook;
    const scopesGranted = tokenResponse.scope || '';

    // Encrypt access token
    const encrypted = this.encryptionService.encrypt(accessToken);
    // The encrypt() method returns "iv:authTag:ciphertext" format
    // We store the full encrypted string in botToken and the empty string as IV
    // since the IV is embedded in the encrypted string

    // Upsert SlackIntegration record
    const existing = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });

    if (existing) {
      // Update existing record
      existing.teamId = teamId;
      existing.teamName = teamName;
      existing.botToken = encrypted;
      existing.botTokenIV = 'embedded'; // IV is embedded in encrypted string format
      existing.botUserId = botUserId;
      existing.incomingWebhookUrl = incomingWebhook?.url;
      existing.incomingWebhookChannel = incomingWebhook?.channel;
      existing.scopes = scopesGranted;
      existing.connectedBy = userId;
      existing.status = 'active';
      existing.errorCount = 0;
      existing.lastError = null;
      existing.lastErrorAt = null;
      existing.connectedAt = new Date();

      await this.slackIntegrationRepo.save(existing);
    } else {
      // Create new record
      const integration = this.slackIntegrationRepo.create({
        workspaceId,
        teamId,
        teamName,
        botToken: encrypted,
        botTokenIV: 'embedded',
        botUserId,
        incomingWebhookUrl: incomingWebhook?.url,
        incomingWebhookChannel: incomingWebhook?.channel,
        defaultChannelId: incomingWebhook?.channel_id,
        defaultChannelName: incomingWebhook?.channel,
        scopes: scopesGranted,
        connectedBy: userId,
        status: 'active',
        eventChannelConfig: {},
        mentionConfig: { critical: '@here', normal: null },
        rateLimitPerHour: 60,
        messageCount: 0,
        errorCount: 0,
      });

      await this.slackIntegrationRepo.save(integration);
    }

    // Delete state from Redis
    await this.redisService.del(`${OAUTH_STATE_PREFIX}${state}`);

    return { workspaceId, teamName };
  }

  /**
   * Verify Slack connection is healthy by calling auth.test API.
   * Returns team info and bot identity.
   * Story 21.1: AC4
   */
  async verifyConnection(
    workspaceId: string,
  ): Promise<{
    ok: boolean;
    teamId?: string;
    teamName?: string;
    botUserId?: string;
    botUserName?: string;
    error?: string;
  }> {
    const integration = await this.slackIntegrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { ok: false, error: 'No Slack integration found for this workspace' };
    }

    let token: string;
    try {
      token = this.encryptionService.decrypt(integration.botToken);
    } catch {
      return { ok: false, error: 'Failed to decrypt bot token' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      const result = await response.json() as any;

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      return {
        ok: true,
        teamId: result.team_id,
        teamName: result.team,
        botUserId: result.user_id,
        botUserName: result.user,
      };
    } catch (error) {
      this.logger.error(
        `Slack auth.test failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, error: 'Failed to verify Slack connection' };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Re-initiate OAuth flow to refresh/upgrade scopes.
   * Generates new authorization URL with updated scopes.
   * Story 21.1: AC4
   */
  async refreshConnection(workspaceId: string, userId: string): Promise<string> {
    return this.getAuthorizationUrl(workspaceId, userId);
  }

  /**
   * Verify Slack request signature (for webhooks/events).
   * Uses timing-safe comparison to prevent timing attacks.
   */
  verifySignature(signature: string, timestamp: string, body: string): boolean {
    if (!this.signingSecret) {
      this.logger.warn('SLACK_SIGNING_SECRET not configured, cannot verify signature');
      return false;
    }

    // Reject if timestamp is >5 minutes old (replay protection)
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return false;
    }

    // Compute HMAC-SHA256
    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(sigBasestring);
    const computed = `v0=${hmac.digest('hex')}`;

    // Timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, 'utf8'),
        Buffer.from(signature, 'utf8'),
      );
    } catch {
      return false;
    }
  }
}
