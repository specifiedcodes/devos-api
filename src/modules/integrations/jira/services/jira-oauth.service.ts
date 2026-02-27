/**
 * JiraOAuthService
 * Story 21.6: Jira Two-Way Sync (AC3)
 *
 * Service handling the Atlassian OAuth 2.0 (3LO) flow: generating authorization URLs,
 * exchanging authorization codes for access and refresh tokens, site selection,
 * and managing the connection lifecycle.
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
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem, JiraSyncStatus } from '../../../../database/entities/jira-sync-item.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraApiClientService } from './jira-api-client.service';
import { JiraIntegrationStatusDto } from '../dto/jira-integration.dto';

const OAUTH_STATE_TTL = 600; // 10 minutes

@Injectable()
export class JiraOAuthService {
  private readonly logger = new Logger(JiraOAuthService.name);

  constructor(
    @InjectRepository(JiraIntegration)
    private readonly integrationRepo: Repository<JiraIntegration>,
    @InjectRepository(JiraSyncItem)
    private readonly syncItemRepo: Repository<JiraSyncItem>,
    private readonly apiClient: JiraApiClientService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate Atlassian OAuth 2.0 (3LO) authorization URL with state parameter.
   */
  async getAuthorizationUrl(
    workspaceId: string,
    userId: string,
  ): Promise<{ url: string; state: string }> {
    const state = randomBytes(32).toString('hex');
    const clientId = this.configService.get<string>('JIRA_CLIENT_ID');
    const redirectUri = this.configService.get<string>('JIRA_REDIRECT_URI');

    // Store state in Redis with 10-minute TTL
    await this.redisService.set(
      `jira-oauth:${state}`,
      JSON.stringify({ workspaceId, userId, state }),
      OAUTH_STATE_TTL,
    );

    const scopes = 'read:jira-work write:jira-work read:jira-user offline_access';
    const url = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri || '')}&response_type=code&state=${state}&prompt=consent`;

    return { url, state };
  }

  /**
   * Handle OAuth callback: exchange code for access+refresh tokens, fetch accessible sites.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{
    integrationId: string;
    sites: Array<{ id: string; url: string; name: string }>;
  }> {
    // Validate state from Redis
    const stateData = await this.redisService.get(`jira-oauth:${state}`);
    if (!stateData) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const { workspaceId, userId } = JSON.parse(stateData);

    // Delete state to prevent replay
    await this.redisService.del(`jira-oauth:${state}`);

    // Check for existing integration
    const existing = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (existing) {
      throw new ConflictException('Jira integration already exists for this workspace');
    }

    // Exchange code for tokens
    const clientId = this.configService.get<string>('JIRA_CLIENT_ID');
    const clientSecret = this.configService.get<string>('JIRA_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('JIRA_REDIRECT_URI');

    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    const refreshTokenPlain = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Encrypt the tokens (encrypt() returns a single string in iv:authTag:ciphertext format)
    const encryptedAccess = this.encryptionService.encrypt(accessTokenPlain);
    const encryptedRefresh = this.encryptionService.encrypt(refreshTokenPlain);

    // Create integration record with placeholder data
    const integration = this.integrationRepo.create({
      workspaceId,
      jiraSiteUrl: 'pending',
      jiraProjectKey: 'PEND',
      cloudId: 'pending',
      accessToken: encryptedAccess,
      accessTokenIv: '',
      refreshToken: encryptedRefresh,
      refreshTokenIv: '',
      tokenExpiresAt,
      connectedBy: userId,
      isActive: false, // Not active until setup is completed
    });

    const saved = await this.integrationRepo.save(integration);

    // Fetch accessible sites using the new token
    const sites = await this.apiClient.getAccessibleSites(
      saved.accessToken,
      saved.accessTokenIv,
    );

    return {
      integrationId: saved.id,
      sites: sites.map((s) => ({ id: s.id, url: s.url, name: s.name })),
    };
  }

  /**
   * Complete integration setup: select site, project, configure status mapping, issue type, register webhook.
   */
  async completeSetup(
    workspaceId: string,
    integrationId: string,
    dto: {
      cloudId: string;
      siteUrl: string;
      projectKey: string;
      projectName?: string;
      statusMapping?: Record<string, string>;
      fieldMapping?: Record<string, string>;
      issueType?: string;
      syncDirection?: string;
    },
  ): Promise<JiraIntegration> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Update integration with selected site and project
    integration.cloudId = dto.cloudId;
    integration.jiraSiteUrl = dto.siteUrl;
    integration.jiraProjectKey = dto.projectKey;
    integration.jiraProjectName = dto.projectName;
    integration.isActive = true;

    if (dto.statusMapping) {
      integration.statusMapping = dto.statusMapping;
    }
    if (dto.fieldMapping) {
      integration.fieldMapping = dto.fieldMapping;
    }
    if (dto.issueType) {
      integration.issueType = dto.issueType;
    }
    if (dto.syncDirection) {
      integration.syncDirection = dto.syncDirection as 'devos_to_jira' | 'jira_to_devos' | 'bidirectional';
    }

    // Generate webhook secret and register webhook
    const webhookSecret = randomBytes(32).toString('hex');
    const webhookUrl = this.configService.get<string>('JIRA_WEBHOOK_URL');

    try {
      const webhookResult = await this.apiClient.registerWebhook(
        integration,
        webhookUrl || '',
        ['jira:issue_created', 'jira:issue_updated', 'jira:issue_deleted', 'comment_created', 'comment_updated'],
      );

      if (webhookResult?.webhookRegistrationResult?.[0]?.createdWebhookId) {
        integration.webhookId = String(webhookResult.webhookRegistrationResult[0].createdWebhookId);
      }

      const encryptedSecret = this.encryptionService.encrypt(webhookSecret);
      integration.webhookSecret = encryptedSecret;
      integration.webhookSecretIv = '';
    } catch (error) {
      this.logger.warn('Failed to register Jira webhook, integration will work without real-time updates');
    }

    return this.integrationRepo.save(integration);
  }

  /**
   * Disconnect Jira integration.
   */
  async disconnect(workspaceId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    // Try to delete webhook from Jira (best effort)
    try {
      if (integration.webhookId) {
        await this.apiClient.deleteWebhook(integration, integration.webhookId);
      }
    } catch {
      this.logger.warn('Failed to delete Jira webhook during disconnect');
    }

    await this.integrationRepo.remove(integration);
  }

  /**
   * Get integration status for a workspace.
   */
  async getStatus(workspaceId: string): Promise<JiraIntegrationStatusDto> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });

    if (!integration) {
      return { connected: false };
    }

    // Get sync item stats
    const syncItemStats = await this.getSyncItemStats(integration.id);

    return {
      connected: true,
      siteUrl: integration.jiraSiteUrl,
      projectKey: integration.jiraProjectKey,
      projectName: integration.jiraProjectName,
      issueType: integration.issueType,
      syncDirection: integration.syncDirection,
      statusMapping: integration.statusMapping,
      isActive: integration.isActive,
      lastSyncAt: integration.lastSyncAt?.toISOString(),
      lastError: integration.lastError || undefined,
      lastErrorAt: integration.lastErrorAt?.toISOString(),
      errorCount: integration.errorCount,
      syncCount: integration.syncCount,
      tokenExpiresAt: integration.tokenExpiresAt?.toISOString(),
      syncItemStats,
      connectedAt: integration.createdAt.toISOString(),
      connectedBy: integration.connectedBy,
    };
  }

  /**
   * Verify Jira connection health.
   */
  async verifyConnection(
    workspaceId: string,
  ): Promise<{ valid: boolean; siteName?: string; projectName?: string; error?: string }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return { valid: false, error: 'No Jira integration found' };
    }

    const result = await this.apiClient.verifyToken(integration);

    if (!result.valid) {
      await this.integrationRepo.update(integration.id, {
        lastError: result.error,
        lastErrorAt: new Date(),
        errorCount: () => 'error_count + 1',
      } as any);
    }

    return {
      valid: result.valid,
      siteName: integration.jiraSiteUrl,
      projectName: integration.jiraProjectName,
      error: result.error,
    };
  }

  /**
   * Update status mapping configuration.
   */
  async updateStatusMapping(
    workspaceId: string,
    statusMapping: Record<string, string>,
  ): Promise<JiraIntegration> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    integration.statusMapping = statusMapping;
    return this.integrationRepo.save(integration);
  }

  /**
   * Update sync direction.
   */
  async updateSyncDirection(
    workspaceId: string,
    syncDirection: 'devos_to_jira' | 'jira_to_devos' | 'bidirectional',
  ): Promise<JiraIntegration> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    integration.syncDirection = syncDirection;
    return this.integrationRepo.save(integration);
  }

  /**
   * Update issue type for new issues.
   */
  async updateIssueType(
    workspaceId: string,
    issueType: string,
  ): Promise<JiraIntegration> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Jira integration found');
    }

    integration.issueType = issueType;
    return this.integrationRepo.save(integration);
  }

  /**
   * Get the integration entity for a workspace (used by other services).
   */
  async getIntegration(workspaceId: string): Promise<JiraIntegration | null> {
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
      where: { jiraIntegrationId: integrationId },
      select: ['syncStatus'],
    });

    return {
      total: items.length,
      synced: items.filter((i) => i.syncStatus === JiraSyncStatus.SYNCED).length,
      pending: items.filter((i) => i.syncStatus === JiraSyncStatus.PENDING).length,
      conflict: items.filter((i) => i.syncStatus === JiraSyncStatus.CONFLICT).length,
      error: items.filter((i) => i.syncStatus === JiraSyncStatus.ERROR).length,
    };
  }
}
