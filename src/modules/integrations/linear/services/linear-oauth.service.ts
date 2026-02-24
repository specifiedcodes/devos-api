/**
 * LinearOAuthService
 * Story 21.5: Linear Two-Way Sync (AC3)
 *
 * Service handling the Linear OAuth 2.0 flow: generating authorization URLs,
 * exchanging authorization codes for access tokens, and managing the connection lifecycle.
 */

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem, LinearSyncStatus } from '../../../../database/entities/linear-sync-item.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { LinearApiClientService } from './linear-api-client.service';
import { LinearIntegrationStatusDto } from '../dto/linear-integration.dto';

const OAUTH_STATE_TTL = 600; // 10 minutes

@Injectable()
export class LinearOAuthService {
  private readonly logger = new Logger(LinearOAuthService.name);

  constructor(
    @InjectRepository(LinearIntegration)
    private readonly integrationRepo: Repository<LinearIntegration>,
    @InjectRepository(LinearSyncItem)
    private readonly syncItemRepo: Repository<LinearSyncItem>,
    private readonly apiClient: LinearApiClientService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate Linear OAuth authorization URL with state parameter.
   */
  async getAuthorizationUrl(
    workspaceId: string,
    userId: string,
  ): Promise<{ url: string; state: string }> {
    const state = randomBytes(32).toString('hex');
    const clientId = this.configService.get<string>('LINEAR_CLIENT_ID');
    const redirectUri = this.configService.get<string>('LINEAR_REDIRECT_URI');

    // Store state in Redis with 10-minute TTL
    await this.redisService.set(
      `linear-oauth:${state}`,
      JSON.stringify({ workspaceId, userId, state }),
      OAUTH_STATE_TTL,
    );

    const url = `https://linear.app/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || '')}&response_type=code&scope=read,write,issues:create&state=${state}`;

    return { url, state };
  }

  /**
   * Handle OAuth callback: exchange code for token, fetch teams, store integration.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{
    integrationId: string;
    teams: Array<{ id: string; name: string; key: string }>;
  }> {
    // Validate state from Redis
    const stateData = await this.redisService.get(`linear-oauth:${state}`);
    if (!stateData) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const { workspaceId, userId } = JSON.parse(stateData);

    // Delete state to prevent replay
    await this.redisService.del(`linear-oauth:${state}`);

    // Check for existing integration
    const existing = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (existing) {
      throw new ConflictException('Linear integration already exists for this workspace');
    }

    // Exchange code for access token
    const clientId = this.configService.get<string>('LINEAR_CLIENT_ID');
    const clientSecret = this.configService.get<string>('LINEAR_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('LINEAR_REDIRECT_URI');

    const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri || '',
        client_id: clientId || '',
        client_secret: clientSecret || '',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange authorization code for token');
    }

    const tokenData = await tokenResponse.json();
    const accessTokenPlain = tokenData.access_token;

    // Encrypt the access token
    const { encrypted, iv } = this.encryptionService.encrypt(accessTokenPlain);

    // Create integration record with temporary team data
    const integration = this.integrationRepo.create({
      workspaceId,
      linearTeamId: 'pending', // Will be set in completeSetup
      accessToken: encrypted,
      accessTokenIv: iv,
      connectedBy: userId,
      isActive: false, // Not active until setup is completed
    });

    const saved = await this.integrationRepo.save(integration);

    // Fetch teams using the new token
    const teams = await this.apiClient.getTeams(saved.accessToken, saved.accessTokenIv);

    return { integrationId: saved.id, teams };
  }

  /**
   * Complete integration setup: select team, configure status mapping, create webhook.
   */
  async completeSetup(
    workspaceId: string,
    integrationId: string,
    dto: { teamId: string; statusMapping?: Record<string, string>; fieldMapping?: Record<string, string>; syncDirection?: string },
  ): Promise<LinearIntegration> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Fetch team name
    const teams = await this.apiClient.getTeams(integration.accessToken, integration.accessTokenIv);
    const selectedTeam = teams.find((t) => t.id === dto.teamId);

    // Generate webhook secret and create webhook
    const webhookSecret = randomBytes(32).toString('hex');
    const webhookUrl = this.configService.get<string>('LINEAR_WEBHOOK_URL');

    let webhookResult: { id: string; enabled: boolean } | undefined;
    try {
      webhookResult = await this.apiClient.createWebhook(
        integration.accessToken,
        integration.accessTokenIv,
        dto.teamId,
        webhookUrl || '',
        webhookSecret,
      );
    } catch (error) {
      this.logger.warn('Failed to create Linear webhook, integration will work without real-time updates');
    }

    // Encrypt webhook secret
    const encryptedSecret = this.encryptionService.encrypt(webhookSecret);

    // Update integration
    integration.linearTeamId = dto.teamId;
    integration.linearTeamName = selectedTeam?.name;
    integration.isActive = true;
    integration.webhookSecret = encryptedSecret.encrypted;
    integration.webhookSecretIv = encryptedSecret.iv;

    if (dto.statusMapping) {
      integration.statusMapping = dto.statusMapping;
    }
    if (dto.fieldMapping) {
      integration.fieldMapping = dto.fieldMapping;
    }
    if (dto.syncDirection) {
      integration.syncDirection = dto.syncDirection as 'devos_to_linear' | 'linear_to_devos' | 'bidirectional';
    }

    return this.integrationRepo.save(integration);
  }

  /**
   * Disconnect Linear integration.
   */
  async disconnect(workspaceId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    // Try to delete webhook from Linear (best effort)
    try {
      if (integration.webhookSecret && integration.webhookSecretIv) {
        this.logger.log('Attempting to delete Linear webhook');
        // Note: We don't store the webhook ID, so we can't delete it from Linear.
        // A future improvement would be to store the webhookId on the integration
        // entity so it can be cleaned up on disconnect. For now, the webhook will
        // become orphaned in Linear but signature verification will fail since
        // the secret is removed with the integration record.
      }
    } catch {
      this.logger.warn('Failed to delete Linear webhook during disconnect');
    }

    await this.integrationRepo.remove(integration);
  }

  /**
   * Get integration status for a workspace.
   */
  async getStatus(workspaceId: string): Promise<LinearIntegrationStatusDto> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });

    if (!integration) {
      return { connected: false };
    }

    // Get sync item stats
    const syncItemStats = await this.getSyncItemStats(integration.id);

    return {
      connected: true,
      teamName: integration.linearTeamName,
      teamId: integration.linearTeamId,
      syncDirection: integration.syncDirection,
      statusMapping: integration.statusMapping,
      isActive: integration.isActive,
      lastSyncAt: integration.lastSyncAt?.toISOString(),
      lastError: integration.lastError || undefined,
      lastErrorAt: integration.lastErrorAt?.toISOString(),
      errorCount: integration.errorCount,
      syncCount: integration.syncCount,
      syncItemStats,
      connectedAt: integration.createdAt.toISOString(),
      connectedBy: integration.connectedBy,
    };
  }

  /**
   * Verify Linear connection health.
   */
  async verifyConnection(
    workspaceId: string,
  ): Promise<{ valid: boolean; teamName?: string; error?: string }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { valid: false, error: 'No Linear integration found' };
    }

    const result = await this.apiClient.verifyToken(integration.accessToken, integration.accessTokenIv);

    if (!result.valid) {
      await this.integrationRepo.update(integration.id, {
        lastError: result.error,
        lastErrorAt: new Date(),
        errorCount: () => 'error_count + 1',
      } as Partial<LinearIntegration>);
    }

    return {
      valid: result.valid,
      teamName: integration.linearTeamName,
      error: result.error,
    };
  }

  /**
   * Update status mapping configuration.
   */
  async updateStatusMapping(
    workspaceId: string,
    statusMapping: Record<string, string>,
  ): Promise<LinearIntegration> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    integration.statusMapping = statusMapping;
    return this.integrationRepo.save(integration);
  }

  /**
   * Update sync direction.
   */
  async updateSyncDirection(
    workspaceId: string,
    syncDirection: 'devos_to_linear' | 'linear_to_devos' | 'bidirectional',
  ): Promise<LinearIntegration> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Linear integration found');
    }

    integration.syncDirection = syncDirection;
    return this.integrationRepo.save(integration);
  }

  /**
   * Get the integration entity for a workspace (used by other services).
   */
  async getIntegration(workspaceId: string): Promise<LinearIntegration | null> {
    return this.integrationRepo.findOne({ where: { workspaceId } });
  }

  private async getSyncItemStats(integrationId: string): Promise<{
    total: number;
    synced: number;
    pending: number;
    conflict: number;
    error: number;
  }> {
    const items = await this.syncItemRepo.find({
      where: { linearIntegrationId: integrationId },
      select: ['syncStatus'],
    });

    return {
      total: items.length,
      synced: items.filter((i) => i.syncStatus === LinearSyncStatus.SYNCED).length,
      pending: items.filter((i) => i.syncStatus === LinearSyncStatus.PENDING).length,
      conflict: items.filter((i) => i.syncStatus === LinearSyncStatus.CONFLICT).length,
      error: items.filter((i) => i.syncStatus === LinearSyncStatus.ERROR).length,
    };
  }
}
