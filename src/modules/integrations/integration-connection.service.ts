import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
} from '../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../shared/encryption/encryption.service';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';
import { OnboardingService } from '../onboarding/services/onboarding.service';
import { RedisService } from '../redis/redis.service';
import {
  IntegrationResponseDto,
  GitHubStatusResponseDto,
  AuthorizationUrlResponseDto,
  DisconnectResponseDto,
} from './dto/integration-response.dto';

const OAUTH_STATE_PREFIX = 'github-oauth-state:';
const RAILWAY_OAUTH_STATE_PREFIX = 'railway-oauth-state:';
const VERCEL_OAUTH_STATE_PREFIX = 'vercel-oauth-state:';
const SUPABASE_OAUTH_STATE_PREFIX = 'supabase-oauth-state:';
const OAUTH_STATE_TTL = 600; // 10 minutes in seconds

@Injectable()
export class IntegrationConnectionService {
  private readonly logger = new Logger(IntegrationConnectionService.name);

  private readonly githubClientId: string;
  private readonly githubClientSecret: string;
  private readonly githubCallbackUrl: string;
  private readonly frontendUrl: string;

  private readonly railwayClientId: string;
  private readonly railwayClientSecret: string;
  private readonly railwayCallbackUrl: string;

  private readonly vercelClientId: string;
  private readonly vercelClientSecret: string;
  private readonly vercelCallbackUrl: string;

  private readonly supabaseClientId: string;
  private readonly supabaseClientSecret: string;
  private readonly supabaseCallbackUrl: string;

  constructor(
    @InjectRepository(IntegrationConnection)
    private readonly integrationRepository: Repository<IntegrationConnection>,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly auditService: AuditService,
    private readonly onboardingService: OnboardingService,
    private readonly redisService: RedisService,
  ) {
    this.githubClientId = this.configService.get<string>('GITHUB_CLIENT_ID', '');
    this.githubClientSecret = this.configService.get<string>('GITHUB_CLIENT_SECRET', '');
    this.githubCallbackUrl = this.configService.get<string>(
      'GITHUB_CALLBACK_URL',
      'http://localhost:3001/api/v1/integrations/github/oauth/callback',
    );
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    this.railwayClientId = this.configService.get<string>('RAILWAY_CLIENT_ID', '');
    this.railwayClientSecret = this.configService.get<string>('RAILWAY_CLIENT_SECRET', '');
    this.railwayCallbackUrl = this.configService.get<string>(
      'RAILWAY_CALLBACK_URL',
      'http://localhost:3001/api/v1/integrations/railway/oauth/callback',
    );

    this.vercelClientId = this.configService.get<string>('VERCEL_CLIENT_ID', '');
    this.vercelClientSecret = this.configService.get<string>('VERCEL_CLIENT_SECRET', '');
    this.vercelCallbackUrl = this.configService.get<string>(
      'VERCEL_CALLBACK_URL',
      'http://localhost:3001/api/v1/integrations/vercel/oauth/callback',
    );

    this.supabaseClientId = this.configService.get<string>('SUPABASE_CLIENT_ID', '');
    this.supabaseClientSecret = this.configService.get<string>('SUPABASE_CLIENT_SECRET', '');
    this.supabaseCallbackUrl = this.configService.get<string>(
      'SUPABASE_CALLBACK_URL',
      'http://localhost:3001/api/v1/integrations/supabase/oauth/callback',
    );
  }

  /**
   * Generate GitHub OAuth authorization URL
   * Creates a CSRF state token stored in Redis
   */
  async generateAuthorizationUrl(
    userId: string,
    workspaceId: string,
  ): Promise<AuthorizationUrlResponseDto> {
    const state = uuidv4();

    // Store CSRF state in Redis with 10-minute TTL
    const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
    const stateValue = JSON.stringify({ userId, workspaceId });
    await this.redisService.set(stateKey, stateValue, OAUTH_STATE_TTL);

    // Build GitHub authorization URL with properly encoded parameters
    const scopes = 'repo,user:email,read:org';
    const params = new URLSearchParams({
      client_id: this.githubClientId,
      scope: scopes,
      state,
      redirect_uri: this.githubCallbackUrl,
    });
    const authorizationUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    this.logger.log(
      `Generated GitHub OAuth URL for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
    );

    return { authorizationUrl };
  }

  /**
   * Handle GitHub OAuth callback
   * Validates CSRF state, exchanges code for token, stores encrypted token
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    // Validate CSRF state
    const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
    const stateValue = await this.redisService.get(stateKey);

    if (!stateValue) {
      throw new ForbiddenException('Invalid or expired OAuth state');
    }

    const { userId, workspaceId } = JSON.parse(stateValue);

    try {
      // Exchange code for access token
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://github.com/login/oauth/access_token',
          {
            client_id: this.githubClientId,
            client_secret: this.githubClientSecret,
            code,
          },
          {
            headers: {
              Accept: 'application/json',
            },
          },
        ),
      );

      const {
        access_token: accessToken,
        token_type: tokenType,
        scope,
      } = tokenResponse.data;

      if (!accessToken) {
        throw new Error('No access token received from GitHub');
      }

      // Fetch GitHub user info
      const userResponse = await firstValueFrom(
        this.httpService.get('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }),
      );

      const githubUser = userResponse.data;

      // Encrypt access token with workspace-scoped key
      const { encryptedData, iv } = this.encryptionService.encryptWithWorkspaceKey(
        workspaceId,
        accessToken,
      );

      // Upsert integration record (update if existing disconnected record)
      let integration = await this.integrationRepository.findOne({
        where: { workspaceId, provider: IntegrationProvider.GITHUB },
      });

      if (integration) {
        // Update existing record
        integration.status = IntegrationStatus.ACTIVE;
        integration.encryptedAccessToken = encryptedData;
        integration.encryptionIV = iv;
        integration.tokenType = tokenType || 'bearer';
        integration.scopes = scope || '';
        integration.externalUserId = String(githubUser.id);
        integration.externalUsername = githubUser.login;
        integration.externalAvatarUrl = githubUser.avatar_url;
        integration.userId = userId;
        integration.connectedAt = new Date();
        integration.lastUsedAt = null as any;
      } else {
        // Create new record
        integration = this.integrationRepository.create({
          workspaceId,
          userId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          encryptedAccessToken: encryptedData,
          encryptionIV: iv,
          tokenType: tokenType || 'bearer',
          scopes: scope || '',
          externalUserId: String(githubUser.id),
          externalUsername: githubUser.login,
          externalAvatarUrl: githubUser.avatar_url,
          connectedAt: new Date(),
        });
      }

      const saved = await this.integrationRepository.save(integration);

      // Update onboarding status
      try {
        await this.onboardingService.updateStep(
          userId,
          workspaceId,
          'githubConnected',
          true,
        );
      } catch (error) {
        // Don't fail OAuth if onboarding update fails
        this.logger.warn(
          `Failed to update onboarding status: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Log audit event
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        saved.id,
        {
          action: 'integration.github.connected',
          provider: 'github',
          externalUsername: githubUser.login,
          result: 'success',
        },
      );

      // Delete CSRF state from Redis
      await this.redisService.del(stateKey);

      this.logger.log(
        `GitHub OAuth completed for user ${userId.substring(0, 8)}... (GitHub: ${githubUser.login})`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?github=connected`,
      };
    } catch (error) {
      // Delete CSRF state on error too
      await this.redisService.del(stateKey);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `GitHub OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?github=error&message=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unknown error',
        )}`,
      };
    }
  }

  /**
   * Get all integrations for a workspace
   * Returns integration records without decrypted tokens
   */
  async getIntegrations(workspaceId: string): Promise<IntegrationResponseDto[]> {
    const integrations = await this.integrationRepository.find({
      where: { workspaceId },
      order: { connectedAt: 'DESC' },
    });

    return integrations.map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      externalUsername: integration.externalUsername,
      externalAvatarUrl: integration.externalAvatarUrl,
      scopes: integration.scopes ? integration.scopes.split(',') : [],
      connectedAt: integration.connectedAt.toISOString(),
      lastUsedAt: integration.lastUsedAt
        ? integration.lastUsedAt.toISOString()
        : undefined,
    }));
  }

  /**
   * Get GitHub connection status for a workspace
   */
  async getGitHubStatus(workspaceId: string): Promise<GitHubStatusResponseDto> {
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      username: integration.externalUsername,
      avatarUrl: integration.externalAvatarUrl,
      scopes: integration.scopes ? integration.scopes.split(',') : [],
      connectedAt: integration.connectedAt.toISOString(),
    };
  }

  /**
   * Disconnect an integration (soft delete)
   * Clears encrypted token data but keeps record for audit trail
   */
  async disconnectIntegration(
    workspaceId: string,
    provider: string,
    userId: string,
  ): Promise<DisconnectResponseDto> {
    // Validate provider against enum to prevent arbitrary string injection
    if (!Object.values(IntegrationProvider).includes(provider as IntegrationProvider)) {
      throw new BadRequestException(`Invalid integration provider: ${provider}`);
    }
    const integrationProvider = provider as IntegrationProvider;

    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider: integrationProvider,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      throw new NotFoundException(
        `No active ${provider} integration found for this workspace`,
      );
    }

    // Soft delete: mark as disconnected and clear token data
    integration.status = IntegrationStatus.DISCONNECTED;
    integration.encryptedAccessToken = '';
    integration.encryptionIV = '';

    await this.integrationRepository.save(integration);

    // Log audit event
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.DELETE,
      'integration',
      integration.id,
      {
        action: `integration.${provider}.disconnected`,
        provider,
        result: 'success',
      },
    );

    this.logger.log(
      `Disconnected ${provider} integration for workspace ${workspaceId.substring(0, 8)}...`,
    );

    return {
      success: true,
      message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} integration disconnected`,
    };
  }

  /**
   * Generate Railway OAuth authorization URL
   * Story 6.5: Railway Deployment Integration
   */
  async generateRailwayAuthorizationUrl(
    userId: string,
    workspaceId: string,
  ): Promise<AuthorizationUrlResponseDto> {
    const state = uuidv4();

    // Store CSRF state in Redis with 10-minute TTL
    const stateKey = `${RAILWAY_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = JSON.stringify({ userId, workspaceId });
    await this.redisService.set(stateKey, stateValue, OAUTH_STATE_TTL);

    // Build Railway authorization URL
    const params = new URLSearchParams({
      client_id: this.railwayClientId,
      redirect_uri: this.railwayCallbackUrl,
      response_type: 'code',
      state,
    });
    const authorizationUrl = `https://railway.app/authorize?${params.toString()}`;

    this.logger.log(
      `Generated Railway OAuth URL for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
    );

    return { authorizationUrl };
  }

  /**
   * Handle Railway OAuth callback
   * Story 6.5: Railway Deployment Integration
   */
  async handleRailwayCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    // Validate CSRF state
    const stateKey = `${RAILWAY_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = await this.redisService.get(stateKey);

    if (!stateValue) {
      throw new ForbiddenException('Invalid or expired OAuth state');
    }

    const { userId, workspaceId } = JSON.parse(stateValue);

    try {
      // Exchange code for access token via Railway OAuth endpoint
      // Uses GraphQL variables to prevent injection (not string interpolation)
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://backboard.railway.app/graphql/v2',
          {
            query: `mutation oauthExchange($input: OAuthExchangeInput!) { authToken: oauthExchange(input: $input) }`,
            variables: {
              input: {
                code,
                clientId: this.railwayClientId,
                clientSecret: this.railwayClientSecret,
                redirectUri: this.railwayCallbackUrl,
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const accessToken =
        tokenResponse.data?.data?.authToken;

      if (!accessToken) {
        throw new Error('No access token received from Railway');
      }

      // Fetch Railway user info via GraphQL
      const userResponse = await firstValueFrom(
        this.httpService.post(
          'https://backboard.railway.app/graphql/v2',
          {
            query: `query { me { id email name avatar } }`,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const railwayUser = userResponse.data?.data?.me;

      // Encrypt access token with workspace-scoped key
      const { encryptedData, iv } =
        this.encryptionService.encryptWithWorkspaceKey(
          workspaceId,
          accessToken,
        );

      // Upsert integration record
      let integration = await this.integrationRepository.findOne({
        where: { workspaceId, provider: IntegrationProvider.RAILWAY },
      });

      if (integration) {
        // Update existing record
        integration.status = IntegrationStatus.ACTIVE;
        integration.encryptedAccessToken = encryptedData;
        integration.encryptionIV = iv;
        integration.tokenType = 'bearer';
        integration.externalUserId = String(railwayUser?.id || '');
        integration.externalUsername = railwayUser?.name || railwayUser?.email || '';
        integration.externalAvatarUrl = railwayUser?.avatar || '';
        integration.userId = userId;
        integration.connectedAt = new Date();
        integration.lastUsedAt = null as any;
      } else {
        // Create new record
        integration = this.integrationRepository.create({
          workspaceId,
          userId,
          provider: IntegrationProvider.RAILWAY,
          status: IntegrationStatus.ACTIVE,
          encryptedAccessToken: encryptedData,
          encryptionIV: iv,
          tokenType: 'bearer',
          externalUserId: String(railwayUser?.id || ''),
          externalUsername: railwayUser?.name || railwayUser?.email || '',
          externalAvatarUrl: railwayUser?.avatar || '',
          connectedAt: new Date(),
        });
      }

      const saved = await this.integrationRepository.save(integration);

      // Log audit event
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        saved.id,
        {
          action: 'integration.railway.connected',
          provider: 'railway',
          externalUsername: railwayUser?.name || railwayUser?.email || '',
          result: 'success',
        },
      );

      // Delete CSRF state from Redis
      await this.redisService.del(stateKey);

      this.logger.log(
        `Railway OAuth completed for user ${userId.substring(0, 8)}... (Railway: ${railwayUser?.name || railwayUser?.email || 'unknown'})`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?railway=connected`,
      };
    } catch (error) {
      // Delete CSRF state on error too
      await this.redisService.del(stateKey);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Railway OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?railway=error&message=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unknown error',
        )}`,
      };
    }
  }

  /**
   * Get Railway connection status
   * Story 6.5: Railway Deployment Integration
   */
  async getRailwayStatus(
    workspaceId: string,
  ): Promise<{ connected: boolean; username?: string; connectedAt?: string }> {
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider: IntegrationProvider.RAILWAY,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      username: integration.externalUsername,
      connectedAt: integration.connectedAt.toISOString(),
    };
  }

  /**
   * Generate Vercel OAuth authorization URL
   * Story 6.6: Vercel Deployment Integration
   */
  async generateVercelAuthorizationUrl(
    userId: string,
    workspaceId: string,
  ): Promise<AuthorizationUrlResponseDto> {
    const state = uuidv4();

    // Store CSRF state in Redis with 10-minute TTL
    const stateKey = `${VERCEL_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = JSON.stringify({ userId, workspaceId });
    await this.redisService.set(stateKey, stateValue, OAUTH_STATE_TTL);

    // Build Vercel authorization URL
    const params = new URLSearchParams({
      client_id: this.vercelClientId,
      redirect_uri: this.vercelCallbackUrl,
      state,
    });
    const authorizationUrl = `https://vercel.com/integrations/oauthdone?${params.toString()}`;

    this.logger.log(
      `Generated Vercel OAuth URL for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
    );

    return { authorizationUrl };
  }

  /**
   * Handle Vercel OAuth callback
   * Story 6.6: Vercel Deployment Integration
   */
  async handleVercelCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    // Validate CSRF state
    const stateKey = `${VERCEL_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = await this.redisService.get(stateKey);

    if (!stateValue) {
      throw new ForbiddenException('Invalid or expired OAuth state');
    }

    const { userId, workspaceId } = JSON.parse(stateValue);

    try {
      // Exchange code for access token via Vercel OAuth endpoint
      // Vercel uses application/x-www-form-urlencoded for token exchange
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.vercel.com/v2/oauth/access_token',
          new URLSearchParams({
            client_id: this.vercelClientId,
            client_secret: this.vercelClientSecret,
            code,
            redirect_uri: this.vercelCallbackUrl,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const accessToken =
        tokenResponse.data?.access_token;

      if (!accessToken) {
        throw new Error('No access token received from Vercel');
      }

      // Fetch Vercel user info via REST API
      const userResponse = await firstValueFrom(
        this.httpService.get('https://api.vercel.com/v2/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }),
      );

      const vercelUser = userResponse.data?.user;

      // Encrypt access token with workspace-scoped key
      const { encryptedData, iv } =
        this.encryptionService.encryptWithWorkspaceKey(
          workspaceId,
          accessToken,
        );

      // Upsert integration record
      let integration = await this.integrationRepository.findOne({
        where: { workspaceId, provider: IntegrationProvider.VERCEL },
      });

      if (integration) {
        // Update existing record
        integration.status = IntegrationStatus.ACTIVE;
        integration.encryptedAccessToken = encryptedData;
        integration.encryptionIV = iv;
        integration.tokenType = 'bearer';
        integration.externalUserId = String(vercelUser?.id || '');
        integration.externalUsername = vercelUser?.username || vercelUser?.name || '';
        integration.externalAvatarUrl = vercelUser?.avatar || '';
        integration.userId = userId;
        integration.connectedAt = new Date();
        integration.lastUsedAt = null as any;
      } else {
        // Create new record
        integration = this.integrationRepository.create({
          workspaceId,
          userId,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
          encryptedAccessToken: encryptedData,
          encryptionIV: iv,
          tokenType: 'bearer',
          externalUserId: String(vercelUser?.id || ''),
          externalUsername: vercelUser?.username || vercelUser?.name || '',
          externalAvatarUrl: vercelUser?.avatar || '',
          connectedAt: new Date(),
        });
      }

      const saved = await this.integrationRepository.save(integration);

      // Log audit event
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        saved.id,
        {
          action: 'integration.vercel.connected',
          provider: 'vercel',
          externalUsername: vercelUser?.username || vercelUser?.name || '',
          result: 'success',
        },
      );

      // Delete CSRF state from Redis
      await this.redisService.del(stateKey);

      this.logger.log(
        `Vercel OAuth completed for user ${userId.substring(0, 8)}... (Vercel: ${vercelUser?.username || vercelUser?.name || 'unknown'})`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?vercel=connected`,
      };
    } catch (error) {
      // Delete CSRF state on error too
      await this.redisService.del(stateKey);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Vercel OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?vercel=error&message=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unknown error',
        )}`,
      };
    }
  }

  /**
   * Get Vercel connection status
   * Story 6.6: Vercel Deployment Integration
   */
  async getVercelStatus(
    workspaceId: string,
  ): Promise<{ connected: boolean; username?: string; connectedAt?: string }> {
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      username: integration.externalUsername,
      connectedAt: integration.connectedAt.toISOString(),
    };
  }

  /**
   * Generate Supabase OAuth authorization URL
   * Story 6.7: Supabase Database Provisioning
   */
  async generateSupabaseAuthorizationUrl(
    userId: string,
    workspaceId: string,
  ): Promise<AuthorizationUrlResponseDto> {
    const state = uuidv4();

    // Store CSRF state in Redis with 10-minute TTL
    const stateKey = `${SUPABASE_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = JSON.stringify({ userId, workspaceId });
    await this.redisService.set(stateKey, stateValue, OAUTH_STATE_TTL);

    // Build Supabase authorization URL
    const params = new URLSearchParams({
      client_id: this.supabaseClientId,
      redirect_uri: this.supabaseCallbackUrl,
      response_type: 'code',
      state,
    });
    const authorizationUrl = `https://api.supabase.com/v1/oauth/authorize?${params.toString()}`;

    this.logger.log(
      `Generated Supabase OAuth URL for user ${userId.substring(0, 8)}... in workspace ${workspaceId.substring(0, 8)}...`,
    );

    return { authorizationUrl };
  }

  /**
   * Handle Supabase OAuth callback
   * Story 6.7: Supabase Database Provisioning
   */
  async handleSupabaseCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    // Validate CSRF state
    const stateKey = `${SUPABASE_OAUTH_STATE_PREFIX}${state}`;
    const stateValue = await this.redisService.get(stateKey);

    if (!stateValue) {
      throw new ForbiddenException('Invalid or expired OAuth state');
    }

    const { userId, workspaceId } = JSON.parse(stateValue);

    try {
      // Exchange code for access token via Supabase OAuth endpoint
      // Supabase uses application/x-www-form-urlencoded for token exchange
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.supabase.com/v1/oauth/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.supabaseCallbackUrl,
            client_id: this.supabaseClientId,
            client_secret: this.supabaseClientSecret,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const accessToken =
        tokenResponse.data?.access_token;

      if (!accessToken) {
        throw new Error('No access token received from Supabase');
      }

      // Encrypt access token with workspace-scoped key
      const { encryptedData, iv } =
        this.encryptionService.encryptWithWorkspaceKey(
          workspaceId,
          accessToken,
        );

      // Upsert integration record
      let integration = await this.integrationRepository.findOne({
        where: { workspaceId, provider: IntegrationProvider.SUPABASE },
      });

      if (integration) {
        // Update existing record
        integration.status = IntegrationStatus.ACTIVE;
        integration.encryptedAccessToken = encryptedData;
        integration.encryptionIV = iv;
        integration.tokenType = 'bearer';
        integration.scopes = '';
        integration.externalUserId = '';
        integration.externalUsername = '';
        integration.externalAvatarUrl = '';
        integration.userId = userId;
        integration.connectedAt = new Date();
        integration.lastUsedAt = null as any;
      } else {
        // Create new record
        integration = this.integrationRepository.create({
          workspaceId,
          userId,
          provider: IntegrationProvider.SUPABASE,
          status: IntegrationStatus.ACTIVE,
          encryptedAccessToken: encryptedData,
          encryptionIV: iv,
          tokenType: 'bearer',
          scopes: '',
          externalUserId: '',
          externalUsername: '',
          externalAvatarUrl: '',
          connectedAt: new Date(),
        });
      }

      const saved = await this.integrationRepository.save(integration);

      // Log audit event
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        saved.id,
        {
          action: 'integration.supabase.connected',
          provider: 'supabase',
          result: 'success',
        },
      );

      // Delete CSRF state from Redis
      await this.redisService.del(stateKey);

      this.logger.log(
        `Supabase OAuth completed for user ${userId.substring(0, 8)}...`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?supabase=connected`,
      };
    } catch (error) {
      // Delete CSRF state on error too
      await this.redisService.del(stateKey);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Supabase OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        redirectUrl: `${this.frontendUrl}/settings/integrations?supabase=error&message=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unknown error',
        )}`,
      };
    }
  }

  /**
   * Get Supabase connection status
   * Story 6.7: Supabase Database Provisioning
   */
  async getSupabaseStatus(
    workspaceId: string,
  ): Promise<{ connected: boolean; username?: string; connectedAt?: string }> {
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      username: integration.externalUsername,
      connectedAt: integration.connectedAt.toISOString(),
    };
  }

  /**
   * Get decrypted token for an active integration
   * Internal method - not exposed via controller
   */
  async getDecryptedToken(
    workspaceId: string,
    provider: IntegrationProvider,
  ): Promise<string> {
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        provider,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      throw new NotFoundException(
        `No active ${provider} integration found`,
      );
    }

    try {
      const decryptedToken = this.encryptionService.decryptWithWorkspaceKey(
        workspaceId,
        integration.encryptedAccessToken,
        integration.encryptionIV,
      );

      // Update lastUsedAt timestamp
      integration.lastUsedAt = new Date();
      await this.integrationRepository.save(integration);

      return decryptedToken;
    } catch (error) {
      this.logger.error(
        `Failed to decrypt ${provider} token for workspace ${workspaceId.substring(0, 8)}...`,
      );
      throw new BadRequestException('Failed to decrypt integration token');
    }
  }
}
