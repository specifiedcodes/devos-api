import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OidcConfigService } from './oidc-config.service';
import { OidcTokenService } from './oidc-token.service';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { AuthService } from '../../auth/auth.service';
import { RedisService } from '../../redis/redis.service';
import { JitProvisioningService } from '../jit/jit-provisioning.service';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';
import {
  OidcAuthorizationParams,
  OidcCallbackResult,
} from '../interfaces/oidc.interfaces';
import { SessionFederationService } from '../session/session-federation.service';
import { SsoProviderType } from '../../../database/entities/sso-federated-session.entity';

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly appUrl: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly oidcConfigService: OidcConfigService,
    private readonly oidcTokenService: OidcTokenService,
    private readonly oidcDiscoveryService: OidcDiscoveryService,
    private readonly ssoAuditService: SsoAuditService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly jitProvisioningService: JitProvisioningService,
    private readonly sessionFederationService: SessionFederationService,
  ) {
    this.appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3001');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Initiate OIDC login flow - generates authorization URL
   */
  async initiateLogin(
    workspaceId: string,
    configId: string,
  ): Promise<OidcAuthorizationParams> {
    const decryptedConfig = await this.oidcConfigService.getDecryptedConfig(workspaceId, configId);

    if (!decryptedConfig.isActive) {
      throw new BadRequestException('OIDC configuration is not active');
    }

    return this.buildAuthorizationRequest(workspaceId, configId, decryptedConfig, false);
  }

  /**
   * Handle OIDC callback (authorization code exchange)
   */
  async handleCallback(
    workspaceId: string,
    code: string,
    state: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<OidcCallbackResult> {
    // Validate state parameter (CSRF protection)
    const stateKey = `${OIDC_CONSTANTS.STATE_PREFIX}${state}`;
    const storedStateData = await this.redisService.get(stateKey);

    if (!storedStateData) {
      throw new UnauthorizedException('Invalid or expired state parameter');
    }

    // Delete state from Redis (one-time use)
    await this.redisService.del(stateKey);

    let stateData: {
      workspaceId: string;
      configId: string;
      nonce: string;
      codeVerifier?: string;
      isTest?: boolean;
    };

    try {
      stateData = JSON.parse(storedStateData);
    } catch {
      throw new UnauthorizedException('Invalid state data');
    }

    // Verify workspaceId matches
    if (stateData.workspaceId !== workspaceId) {
      throw new UnauthorizedException('Workspace ID mismatch in state parameter');
    }

    const configId = stateData.configId;

    try {
      // Get decrypted config
      const decryptedConfig = await this.oidcConfigService.getDecryptedConfig(
        workspaceId,
        configId,
      );

      if (!decryptedConfig.tokenEndpoint) {
        throw new InternalServerErrorException('OIDC token endpoint not configured');
      }

      const redirectUri = this.getRedirectUri(workspaceId);

      // Exchange code for tokens
      const tokenResponse = await this.oidcTokenService.exchangeCodeForTokens({
        tokenEndpoint: decryptedConfig.tokenEndpoint,
        code,
        redirectUri,
        clientId: decryptedConfig.clientId,
        clientSecret: decryptedConfig.decryptedClientSecret,
        codeVerifier: stateData.codeVerifier,
        tokenEndpointAuthMethod: decryptedConfig.tokenEndpointAuthMethod,
      });

      // Validate ID token
      if (!decryptedConfig.jwksUri || !decryptedConfig.issuer) {
        throw new InternalServerErrorException('OIDC JWKS URI or issuer not configured');
      }

      const idTokenClaims = await this.oidcTokenService.validateIdToken({
        idToken: tokenResponse.id_token,
        jwksUri: decryptedConfig.jwksUri,
        issuer: decryptedConfig.issuer,
        clientId: decryptedConfig.clientId,
        nonce: stateData.nonce,
      });

      // Extract user claims from ID token
      let userClaims: Record<string, unknown> = { ...idTokenClaims };

      // Fetch UserInfo if endpoint available
      if (decryptedConfig.userinfoEndpoint) {
        const userInfo = await this.oidcTokenService.fetchUserInfo(
          decryptedConfig.userinfoEndpoint,
          tokenResponse.access_token,
        );
        // Merge UserInfo (supplement ID token claims)
        userClaims = { ...userClaims, ...userInfo };
      }

      // Apply attribute mapping
      const mapping = decryptedConfig.attributeMapping || {
        email: 'email',
        firstName: 'given_name',
        lastName: 'family_name',
        groups: 'groups',
      };

      const email = (userClaims[mapping.email] as string) || (userClaims.email as string);
      if (!email) {
        await this.oidcConfigService.updateErrorStats(configId, 'Email claim missing from token and userinfo');
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.OIDC_LOGIN_FAILURE,
          oidcConfigId: configId,
          ipAddress,
          userAgent,
          details: { error: 'Email claim missing from token and userinfo' },
        });
        throw new BadRequestException('Email claim is missing from OIDC token and userinfo');
      }

      // Domain validation
      if (decryptedConfig.allowedDomains && decryptedConfig.allowedDomains.length > 0) {
        const emailDomain = email.split('@')[1]?.toLowerCase();
        const allowedLower = decryptedConfig.allowedDomains.map((d) => d.toLowerCase());
        if (!emailDomain || !allowedLower.includes(emailDomain)) {
          await this.oidcConfigService.updateErrorStats(configId, `Email domain ${emailDomain} not allowed`);
          void this.ssoAuditService.logEvent({
            workspaceId,
            eventType: SsoAuditEventType.OIDC_LOGIN_FAILURE,
            oidcConfigId: configId,
            ipAddress,
            userAgent,
            details: { error: 'Email domain not allowed', emailDomain },
          });
          throw new ForbiddenException('Email domain is not in the allowed domains list');
        }
      }

      // Centralized JIT Provisioning
      const provisioningResult = await this.jitProvisioningService.provisionUser(
        workspaceId,
        userClaims,
        'oidc',
        ipAddress,
        userAgent,
      );
      const user = { id: provisioningResult.user.id, email: provisioningResult.user.email };
      const isNewUser = provisioningResult.isNewUser;

      // Generate JWT tokens
      const authResponse = await this.authService.generateTokensForSsoUser(
        user as any,
        workspaceId,
        ipAddress,
        userAgent,
      );

      // Update config stats
      await this.oidcConfigService.updateLoginStats(configId);

      // Mark as tested if this was a test login
      if (stateData.isTest) {
        await this.oidcConfigService.markAsTested(configId);
      }

      // Log success
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.OIDC_LOGIN_SUCCESS,
        targetUserId: user.id,
        oidcConfigId: configId,
        ipAddress,
        userAgent,
        details: {
          isNewUser,
          email,
          issuer: idTokenClaims.iss,
          isTest: stateData.isTest || false,
        },
      });

      // Create federated session linking OIDC provider session with DevOS session
      let federatedSessionId: string | undefined;
      try {
        const sidClaim = (idTokenClaims as any).sid as string | undefined;
        const timeoutConfig = await this.sessionFederationService.getWorkspaceTimeoutConfig(workspaceId);
        const federatedSession = await this.sessionFederationService.createFederatedSession({
          userId: user.id,
          workspaceId,
          providerType: SsoProviderType.OIDC,
          providerConfigId: configId,
          idpSessionId: sidClaim,
          devosSessionId: authResponse.accessTokenJti || authResponse.tokens.access_token.substring(0, 36),
          accessTokenJti: authResponse.accessTokenJti,
          refreshTokenJti: authResponse.refreshTokenJti,
          sessionTimeoutMinutes: timeoutConfig.sessionTimeoutMinutes,
          idleTimeoutMinutes: timeoutConfig.idleTimeoutMinutes,
        });
        federatedSessionId = federatedSession.id;
      } catch (fedError) {
        this.logger.error('Failed to create federated session', fedError);
        // Non-blocking: OIDC login still succeeds
      }

      return {
        userId: user.id,
        email: user.email,
        isNewUser,
        workspaceId,
        accessToken: authResponse.tokens.access_token,
        refreshToken: authResponse.tokens.refresh_token,
        federatedSessionId,
      };
    } catch (error) {
      // Update error stats for all failures
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.oidcConfigService.updateErrorStats(configId, errorMessage).catch(() => {});

      // Log failure if not already logged above (email claim missing + domain validation)
      const alreadyLogged =
        (error instanceof BadRequestException && (error.message || '').includes('Email claim')) ||
        (error instanceof ForbiddenException && (error.message || '').includes('domain'));
      if (!alreadyLogged) {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.OIDC_LOGIN_FAILURE,
          oidcConfigId: configId,
          ipAddress,
          userAgent,
          details: { error: errorMessage },
        });
      }
      throw error;
    }
  }

  /**
   * Handle OIDC logout
   */
  async handleLogout(
    workspaceId: string,
  ): Promise<{ redirectUrl?: string }> {
    const activeConfigs = await this.oidcConfigService.findActiveConfigsForWorkspace(workspaceId);

    if (activeConfigs.length > 0 && activeConfigs[0].endSessionEndpoint) {
      return { redirectUrl: activeConfigs[0].endSessionEndpoint };
    }

    return { redirectUrl: `${this.frontendUrl}/auth/login` };
  }

  /**
   * Test OIDC connection
   */
  async testConnection(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<OidcAuthorizationParams> {
    const decryptedConfig = await this.oidcConfigService.getDecryptedConfig(workspaceId, configId);

    return this.buildAuthorizationRequest(workspaceId, configId, decryptedConfig, true);
  }

  /**
   * Get frontend redirect URL for successful SSO callback
   */
  getSuccessRedirectUrl(accessToken: string, refreshToken: string): string {
    return `${this.frontendUrl}/auth/sso/callback#token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`;
  }

  /**
   * Get frontend redirect URL for SSO error
   */
  getErrorRedirectUrl(errorCode: string): string {
    return `${this.frontendUrl}/auth/sso/error?code=${encodeURIComponent(errorCode)}`;
  }

  /**
   * Build authorization request and store state in Redis
   */
  private async buildAuthorizationRequest(
    workspaceId: string,
    configId: string,
    decryptedConfig: { authorizationEndpoint: string | null; clientId: string; scopes: string[]; usePkce: boolean },
    isTest: boolean,
  ): Promise<OidcAuthorizationParams> {
    if (!decryptedConfig.authorizationEndpoint) {
      throw new BadRequestException('OIDC authorization endpoint not configured');
    }

    // Generate security parameters
    const state = this.oidcTokenService.generateState();
    const nonce = this.oidcTokenService.generateNonce();

    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    let codeChallengeMethod: string | undefined;

    if (decryptedConfig.usePkce) {
      const pkce = this.oidcTokenService.generatePkceChallenge();
      codeVerifier = pkce.codeVerifier;
      codeChallenge = pkce.codeChallenge;
      codeChallengeMethod = pkce.codeChallengeMethod;
    }

    // Store state data in Redis
    const stateData = JSON.stringify({
      workspaceId,
      configId,
      nonce,
      codeVerifier,
      isTest,
    });
    await this.redisService.set(
      `${OIDC_CONSTANTS.STATE_PREFIX}${state}`,
      stateData,
      OIDC_CONSTANTS.STATE_TTL_SECONDS,
    );

    // Build authorization URL
    const redirectUri = this.getRedirectUri(workspaceId);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: decryptedConfig.clientId,
      redirect_uri: redirectUri,
      scope: decryptedConfig.scopes.join(' '),
      state,
      nonce,
    });

    if (codeChallenge && codeChallengeMethod) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', codeChallengeMethod);
    }

    const redirectUrl = `${decryptedConfig.authorizationEndpoint}?${params.toString()}`;

    return {
      redirectUrl,
      state,
      nonce,
      codeVerifier,
    };
  }

  private getRedirectUri(workspaceId: string): string {
    return `${this.appUrl}/api/auth/oidc/${workspaceId}/callback`;
  }
}
