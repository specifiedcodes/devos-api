import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { OidcService } from './oidc.service';
import { OidcConfigService } from './oidc-config.service';
import { OidcTokenService } from './oidc-token.service';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { SsoAuditService } from '../sso-audit.service';
import { AuthService } from '../../auth/auth.service';
import { RedisService } from '../../redis/redis.service';
import { JitProvisioningService } from '../jit/jit-provisioning.service';
import { SessionFederationService } from '../session/session-federation.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { OidcProviderType } from '../../../database/entities/oidc-configuration.entity';

describe('OidcService', () => {
  let service: OidcService;

  const workspaceId = 'ws-123';
  const configId = 'config-123';
  const actorId = 'user-123';

  const mockDecryptedConfig = {
    id: configId,
    workspaceId,
    providerType: OidcProviderType.GOOGLE,
    clientId: 'client-id-123',
    decryptedClientSecret: 'raw-secret',
    clientSecret: 'encrypted',
    clientSecretIv: 'iv',
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    issuer: 'https://accounts.google.com',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    endSessionEndpoint: null,
    scopes: ['openid', 'email', 'profile'],
    allowedDomains: null,
    usePkce: true,
    tokenEndpointAuthMethod: 'client_secret_post',
    attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name', groups: 'groups' },
    isActive: true,
    isTested: true,
    loginCount: 0,
    errorCount: 0,
    lastLoginAt: null,
    lastError: null,
    lastErrorAt: null,
    discoveryLastFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    displayName: 'Google Workspace',
    responseType: 'code',
  };

  const mockOidcConfigService = {
    getDecryptedConfig: jest.fn().mockResolvedValue(mockDecryptedConfig),
    findActiveConfigsForWorkspace: jest.fn(),
    updateLoginStats: jest.fn().mockResolvedValue(undefined),
    updateErrorStats: jest.fn().mockResolvedValue(undefined),
    markAsTested: jest.fn().mockResolvedValue(undefined),
  };

  const mockOidcTokenService = {
    generateState: jest.fn().mockReturnValue('test-state'),
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    generatePkceChallenge: jest.fn().mockReturnValue({
      codeVerifier: 'test-verifier',
      codeChallenge: 'test-challenge',
      codeChallengeMethod: 'S256',
    }),
    exchangeCodeForTokens: jest.fn().mockResolvedValue({
      access_token: 'access-token',
      id_token: 'id-token',
      token_type: 'Bearer',
    }),
    validateIdToken: jest.fn().mockResolvedValue({
      iss: 'https://accounts.google.com',
      sub: 'google-user-123',
      aud: 'client-id-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      nonce: 'test-nonce',
      email: 'user@example.com',
      given_name: 'John',
      family_name: 'Doe',
    }),
    fetchUserInfo: jest.fn().mockResolvedValue({
      sub: 'google-user-123',
      email: 'user@example.com',
      given_name: 'John',
      family_name: 'Doe',
    }),
  };

  const mockDiscoveryService = {};

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockAuthService = {
    generateTokensForSsoUser: jest.fn().mockResolvedValue({
      tokens: {
        access_token: 'jwt-access-token',
        refresh_token: 'jwt-refresh-token',
      },
    }),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string, def?: string) => {
      if (key === 'APP_URL') return 'http://localhost:3001';
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      return def;
    }),
  };

  const mockJitProvisioningService = {
    provisionUser: jest.fn().mockResolvedValue({
      user: { id: 'new-user-id', email: 'user@example.com' },
      isNewUser: true,
      profileUpdated: false,
      roleUpdated: false,
      provisioningDetails: {},
    }),
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    extractAttributes: jest.fn(),
    resolveRole: jest.fn(),
  };

  const mockSessionFederationService = {
    getWorkspaceTimeoutConfig: jest.fn().mockResolvedValue({
      sessionTimeoutMinutes: 1440,
      idleTimeoutMinutes: 60,
    }),
    createFederatedSession: jest.fn().mockResolvedValue({
      id: 'federated-session-id',
      userId: 'new-user-id',
      workspaceId,
      providerType: 'oidc',
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcService,
        { provide: OidcConfigService, useValue: mockOidcConfigService },
        { provide: OidcTokenService, useValue: mockOidcTokenService },
        { provide: OidcDiscoveryService, useValue: mockDiscoveryService },
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JitProvisioningService, useValue: mockJitProvisioningService },
        { provide: SessionFederationService, useValue: mockSessionFederationService },
      ],
    }).compile();

    service = module.get<OidcService>(OidcService);
  });

  describe('initiateLogin', () => {
    it('should generate state, nonce, and PKCE challenge', async () => {
      const result = await service.initiateLogin(workspaceId, configId);

      expect(result.state).toBe('test-state');
      expect(result.nonce).toBe('test-nonce');
      expect(result.codeVerifier).toBe('test-verifier');
    });

    it('should store state data in Redis with TTL', async () => {
      await service.initiateLogin(workspaceId, configId);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'oidc:state:test-state',
        expect.stringContaining(workspaceId),
        600,
      );
    });

    it('should build correct authorization URL with all params', async () => {
      const result = await service.initiateLogin(workspaceId, configId);

      expect(result.redirectUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(result.redirectUrl).toContain('response_type=code');
      expect(result.redirectUrl).toContain('client_id=client-id-123');
      expect(result.redirectUrl).toContain('state=test-state');
      expect(result.redirectUrl).toContain('nonce=test-nonce');
      expect(result.redirectUrl).toContain('code_challenge=test-challenge');
      expect(result.redirectUrl).toContain('code_challenge_method=S256');
    });

    it('should reject inactive configurations', async () => {
      mockOidcConfigService.getDecryptedConfig.mockResolvedValueOnce({
        ...mockDecryptedConfig,
        isActive: false,
      });

      await expect(
        service.initiateLogin(workspaceId, configId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    const stateData = {
      workspaceId,
      configId,
      nonce: 'test-nonce',
      codeVerifier: 'test-verifier',
      isTest: false,
    };

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(stateData));
    });

    it('should validate state parameter against Redis', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockRedisService.get).toHaveBeenCalledWith('oidc:state:test-state');
      expect(mockRedisService.del).toHaveBeenCalledWith('oidc:state:test-state');
    });

    it('should reject expired/invalid state (CSRF protection)', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(workspaceId, 'auth-code', 'invalid-state'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should exchange code for tokens', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockOidcTokenService.exchangeCodeForTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code',
          codeVerifier: 'test-verifier',
        }),
      );
    });

    it('should validate ID token signature and claims', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockOidcTokenService.validateIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 'test-nonce',
          issuer: 'https://accounts.google.com',
          clientId: 'client-id-123',
        }),
      );
    });

    it('should fetch UserInfo when endpoint available', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockOidcTokenService.fetchUserInfo).toHaveBeenCalledWith(
        'https://openidconnect.googleapis.com/v1/userinfo',
        'access-token',
      );
    });

    it('should call jitProvisioningService.provisionUser with merged userClaims', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockJitProvisioningService.provisionUser).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ email: 'user@example.com' }),
        'oidc',
        undefined,
        undefined,
      );
    });

    it('should pass oidc as provider type', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockJitProvisioningService.provisionUser).toHaveBeenCalledWith(
        workspaceId,
        expect.any(Object),
        'oidc',
        undefined,
        undefined,
      );
    });

    it('should apply attribute mapping to extract user info', async () => {
      const result = await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(result.email).toBe('user@example.com');
    });

    it('should validate email domain against allowed domains', async () => {
      mockOidcConfigService.getDecryptedConfig.mockResolvedValueOnce({
        ...mockDecryptedConfig,
        allowedDomains: ['acme.com'],
      });

      await expect(
        service.handleCallback(workspaceId, 'auth-code', 'test-state'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject email from non-allowed domain', async () => {
      mockOidcConfigService.getDecryptedConfig.mockResolvedValueOnce({
        ...mockDecryptedConfig,
        allowedDomains: ['corporate.com'],
      });

      await expect(
        service.handleCallback(workspaceId, 'auth-code', 'test-state'),
      ).rejects.toThrow('domain');
    });

    it('should create new user on first OIDC login (JIT provisioning)', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'new-user-id', email: 'user@example.com' },
        isNewUser: true,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });

      const result = await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(result.isNewUser).toBe(true);
      expect(mockJitProvisioningService.provisionUser).toHaveBeenCalled();
    });

    it('should update existing user on subsequent OIDC logins', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'existing-user-id', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });

      const result = await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(result.isNewUser).toBe(false);
      expect(result.userId).toBe('existing-user-id');
    });

    it('should still return correct OidcCallbackResult shape', async () => {
      const result = await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('isNewUser');
      expect(result).toHaveProperty('workspaceId');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should generate valid JWT tokens', async () => {
      const result = await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(result.accessToken).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('jwt-refresh-token');
      expect(mockAuthService.generateTokensForSsoUser).toHaveBeenCalled();
    });

    it('should increment login_count on OIDC config', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockOidcConfigService.updateLoginStats).toHaveBeenCalledWith(configId);
    });

    it('should log oidc_login_success audit event', async () => {
      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.OIDC_LOGIN_SUCCESS,
          oidcConfigId: configId,
        }),
      );
    });

    it('should log oidc_login_failure on error and update error stats', async () => {
      mockOidcTokenService.exchangeCodeForTokens.mockRejectedValueOnce(
        new Error('Token exchange failed'),
      );

      await expect(
        service.handleCallback(workspaceId, 'auth-code', 'test-state'),
      ).rejects.toThrow();

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.OIDC_LOGIN_FAILURE,
        }),
      );
      expect(mockOidcConfigService.updateErrorStats).toHaveBeenCalledWith(
        configId,
        'Token exchange failed',
      );
    });

    it('should mark config as tested on test login success', async () => {
      const testStateData = { ...stateData, isTest: true };
      mockRedisService.get.mockResolvedValue(JSON.stringify(testStateData));

      await service.handleCallback(workspaceId, 'auth-code', 'test-state');

      expect(mockOidcConfigService.markAsTested).toHaveBeenCalledWith(configId);
    });

    it('should handle ForbiddenException from provisioning service', async () => {
      mockJitProvisioningService.provisionUser.mockRejectedValue(
        new ForbiddenException('JIT provisioning is disabled'),
      );

      await expect(
        service.handleCallback(workspaceId, 'auth-code', 'test-state'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleLogout', () => {
    it('should return end_session_endpoint when available', async () => {
      const configWithLogout = { ...mockDecryptedConfig, endSessionEndpoint: 'https://accounts.google.com/logout' };
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValue([configWithLogout]);

      const result = await service.handleLogout(workspaceId);

      expect(result.redirectUrl).toBe('https://accounts.google.com/logout');
    });

    it('should return frontend login URL when no end_session_endpoint', async () => {
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValue([mockDecryptedConfig]);

      const result = await service.handleLogout(workspaceId);

      expect(result.redirectUrl).toContain('/auth/login');
    });
  });

  describe('testConnection', () => {
    it('should build authorization request with isTest=true', async () => {
      const result = await service.testConnection(workspaceId, configId, actorId);

      expect(result.redirectUrl).toContain('https://accounts.google.com');
      // Verify state data was stored with isTest flag
      const storeCall = mockRedisService.set.mock.calls[0];
      const storedData = JSON.parse(storeCall[1]);
      expect(storedData.isTest).toBe(true);
    });
  });

  describe('getSuccessRedirectUrl', () => {
    it('should return URL with fragment-based tokens', () => {
      const url = service.getSuccessRedirectUrl('access-123', 'refresh-456');

      expect(url).toContain('#token=access-123');
      expect(url).toContain('&refresh=refresh-456');
      expect(url).toContain('http://localhost:3000/auth/sso/callback');
    });
  });

  describe('getErrorRedirectUrl', () => {
    it('should return URL with error code', () => {
      const url = service.getErrorRedirectUrl('oidc_error');

      expect(url).toContain('?code=oidc_error');
      expect(url).toContain('http://localhost:3000/auth/sso/error');
    });
  });
});
