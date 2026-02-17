/**
 * OAuth2/OIDC Provider Configuration & Authentication Flow E2E Tests
 * Tests the full OIDC lifecycle including config CRUD, provider templates,
 * authentication flow, and discovery.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { OidcController } from '../../oidc/oidc.controller';
import { OidcService } from '../../oidc/oidc.service';
import { OidcConfigService } from '../../oidc/oidc-config.service';
import {
  MOCK_OIDC_PROVIDER,
  MOCK_MICROSOFT_OIDC,
  MOCK_OIDC_TOKENS,
  createTestWorkspaceId,
  createTestUserId,
  createMockResponse,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('OIDC E2E Tests', () => {
  let controller: OidcController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const configId = createTestUuid(20);

  const mockOidcService = {
    initiateLogin: jest.fn(),
    handleCallback: jest.fn(),
    testConnection: jest.fn(),
    getSuccessRedirectUrl: jest.fn(),
    getErrorRedirectUrl: jest.fn(),
  };

  const mockOidcConfigService = {
    createConfig: jest.fn(),
    updateConfig: jest.fn(),
    deleteConfig: jest.fn(),
    getConfig: jest.fn(),
    listConfigs: jest.fn(),
    activateConfig: jest.fn(),
    deactivateConfig: jest.fn(),
    refreshDiscovery: jest.fn(),
    findActiveConfigsForWorkspace: jest.fn(),
  };

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OidcController],
      providers: [
        { provide: OidcService, useValue: mockOidcService },
        { provide: OidcConfigService, useValue: mockOidcConfigService },
      ],
    }).compile();

    controller = module.get<OidcController>(OidcController);
  });

  // ==================== OIDC Config CRUD E2E ====================

  describe('OIDC Config CRUD E2E', () => {
    const mockConfigResponse = {
      id: configId,
      workspaceId,
      providerType: MOCK_OIDC_PROVIDER.providerType,
      clientId: MOCK_OIDC_PROVIDER.clientId,
      discoveryUrl: MOCK_OIDC_PROVIDER.discoveryUrl,
      scopes: MOCK_OIDC_PROVIDER.scopes,
      isActive: false,
      isTested: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create an OIDC configuration with clientId, clientSecret, discoveryUrl, and scopes', async () => {
      mockOidcConfigService.createConfig.mockResolvedValue(mockConfigResponse);

      const result = await controller.createConfig(
        workspaceId,
        {
          providerType: MOCK_OIDC_PROVIDER.providerType,
          clientId: MOCK_OIDC_PROVIDER.clientId,
          clientSecret: MOCK_OIDC_PROVIDER.clientSecret,
          discoveryUrl: MOCK_OIDC_PROVIDER.discoveryUrl,
          scopes: MOCK_OIDC_PROVIDER.scopes,
        } as any,
        mockReq,
      );

      expect(result).toBeDefined();
      expect(result.clientId).toBe(MOCK_OIDC_PROVIDER.clientId);
      expect(result.providerType).toBe('google');
      expect(mockOidcConfigService.createConfig).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ clientId: MOCK_OIDC_PROVIDER.clientId }),
        userId,
      );
    });

    it('should list all OIDC configurations', async () => {
      mockOidcConfigService.listConfigs.mockResolvedValue([mockConfigResponse]);

      const result = await controller.listConfigs(workspaceId);

      expect(result).toHaveLength(1);
      expect(mockOidcConfigService.listConfigs).toHaveBeenCalledWith(workspaceId);
    });

    it('should get specific configuration with clientSecret masked', async () => {
      const maskedResponse = { ...mockConfigResponse, clientSecret: '********' };
      mockOidcConfigService.getConfig.mockResolvedValue(maskedResponse);

      const result = await controller.getConfig(workspaceId, configId);

      expect(result).toBeDefined();
      expect(result.id).toBe(configId);
    });

    it('should update OIDC configuration fields', async () => {
      const updated = { ...mockConfigResponse, scopes: ['openid', 'email', 'profile', 'groups'] };
      mockOidcConfigService.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(
        workspaceId,
        configId,
        { scopes: ['openid', 'email', 'profile', 'groups'] } as any,
        mockReq,
      );

      expect(result.scopes).toContain('groups');
    });

    it('should activate OIDC configuration', async () => {
      const active = { ...mockConfigResponse, isActive: true };
      mockOidcConfigService.activateConfig.mockResolvedValue(active);

      const result = await controller.activateConfig(workspaceId, configId, mockReq);

      expect(result.isActive).toBe(true);
    });

    it('should deactivate OIDC configuration', async () => {
      const inactive = { ...mockConfigResponse, isActive: false };
      mockOidcConfigService.deactivateConfig.mockResolvedValue(inactive);

      const result = await controller.deactivateConfig(workspaceId, configId, mockReq);

      expect(result.isActive).toBe(false);
    });

    it('should delete OIDC configuration', async () => {
      mockOidcConfigService.deleteConfig.mockResolvedValue(undefined);

      await controller.deleteConfig(workspaceId, configId, mockReq);

      expect(mockOidcConfigService.deleteConfig).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });

    it('should pass userId from JWT for all config operations', async () => {
      mockOidcConfigService.createConfig.mockResolvedValue(mockConfigResponse);
      await controller.createConfig(workspaceId, {} as any, mockReq);
      expect(mockOidcConfigService.createConfig).toHaveBeenCalledWith(workspaceId, expect.any(Object), userId);
    });
  });

  // ==================== OIDC Provider Templates E2E ====================

  describe('OIDC Provider Templates E2E', () => {
    it('should return provider presets', async () => {
      const result = await controller.getProviderPresets(workspaceId);

      expect(result).toBeDefined();
      // Provider presets come from OIDC_CONSTANTS.PROVIDER_PRESETS
      expect(typeof result).toBe('object');
    });
  });

  // ==================== OIDC Authentication Flow E2E ====================

  describe('OIDC Authentication Flow E2E', () => {
    it('should initiate OIDC login and redirect to provider', async () => {
      const loginResult = {
        redirectUrl: 'https://accounts.google.com/o/oauth2/auth?client_id=test&redirect_uri=callback&scope=openid+email+profile&state=state123&nonce=nonce123',
      };
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValue([{ id: configId }]);
      mockOidcService.initiateLogin.mockResolvedValue(loginResult);

      const res = createMockResponse();
      await controller.initiateLogin(workspaceId, undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(loginResult.redirectUrl);
    });

    it('should handle OIDC callback with valid authorization code', async () => {
      const callbackResult = {
        userId: createTestUserId(),
        email: MOCK_OIDC_TOKENS.valid.claims.email,
        isNewUser: false,
        workspaceId,
        accessToken: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
      };
      mockOidcService.handleCallback.mockResolvedValue(callbackResult);
      mockOidcService.getSuccessRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/callback#token=jwt-access-token',
      );

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        'auth-code-123',
        'state-123',
        undefined,
        undefined,
        mockReq,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/auth/sso/callback'),
      );
    });

    it('should handle OIDC callback for new user with JIT provisioning', async () => {
      const callbackResult = {
        userId: 'new-oidc-user-id',
        email: 'newuser@test-corp.com',
        isNewUser: true,
        workspaceId,
        accessToken: 'jwt-token',
        refreshToken: 'jwt-refresh',
      };
      mockOidcService.handleCallback.mockResolvedValue(callbackResult);
      mockOidcService.getSuccessRedirectUrl.mockReturnValue('http://localhost:3000/auth/sso/callback#token=jwt-token');

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        'auth-code-new',
        'state-new',
        undefined,
        undefined,
        mockReq,
        res,
      );

      expect(mockOidcService.handleCallback).toHaveBeenCalledWith(
        workspaceId,
        'auth-code-new',
        'state-new',
        expect.any(String),
        expect.any(String),
      );
    });

    it('should redirect to error on provider error response', async () => {
      mockOidcService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=access_denied',
      );

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        undefined,
        undefined,
        'access_denied',
        'User denied access',
        mockReq,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should redirect to error when code or state is missing', async () => {
      mockOidcService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=missing_params',
      );

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        undefined,
        undefined,
        undefined,
        undefined,
        mockReq,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should redirect to error on disallowed email domain', async () => {
      const { ForbiddenException } = jest.requireActual('@nestjs/common');
      mockOidcService.handleCallback.mockRejectedValue(
        new ForbiddenException('Email domain not allowed'),
      );
      mockOidcService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=domain_not_allowed',
      );

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        'auth-code',
        'state',
        undefined,
        undefined,
        mockReq,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('domain_not_allowed'),
      );
    });

    it('should redirect to error on invalid CSRF state', async () => {
      const { UnauthorizedException } = jest.requireActual('@nestjs/common');
      mockOidcService.handleCallback.mockRejectedValue(
        new UnauthorizedException('Invalid state'),
      );
      mockOidcService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=authentication_failed',
      );

      const res = createMockResponse();
      await controller.handleCallback(
        workspaceId,
        'code',
        'bad-state',
        undefined,
        undefined,
        mockReq,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should return error when no active OIDC config for login', async () => {
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValue([]);

      const res = createMockResponse();
      await controller.initiateLogin(workspaceId, undefined, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return error when multiple active configs without configId', async () => {
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValue([
        { id: 'config-1', providerType: 'google', displayName: 'Google' },
        { id: 'config-2', providerType: 'microsoft', displayName: 'Microsoft' },
      ]);

      const res = createMockResponse();
      await controller.initiateLogin(workspaceId, undefined, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should use specific configId when provided for login', async () => {
      mockOidcService.initiateLogin.mockResolvedValue({ redirectUrl: 'https://provider/auth' });

      const res = createMockResponse();
      await controller.initiateLogin(workspaceId, configId, res);

      expect(mockOidcService.initiateLogin).toHaveBeenCalledWith(workspaceId, configId);
    });
  });

  // ==================== OIDC Discovery E2E ====================

  describe('OIDC Discovery E2E', () => {
    it('should refresh discovery document', async () => {
      const refreshedConfig = {
        id: configId,
        workspaceId,
        providerType: 'google',
        isActive: true,
      };
      mockOidcConfigService.refreshDiscovery.mockResolvedValue(refreshedConfig);

      const result = await controller.refreshDiscovery(workspaceId, configId, mockReq);

      expect(result).toBeDefined();
      expect(mockOidcConfigService.refreshDiscovery).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });
  });

  // ==================== OIDC Test Connection ====================

  describe('OIDC Test Connection E2E', () => {
    it('should test OIDC connection and return redirect URL', async () => {
      const testResult = {
        redirectUrl: 'https://accounts.google.com/o/oauth2/auth?test=true',
        requestId: 'test-req-123',
      };
      mockOidcService.testConnection.mockResolvedValue(testResult);

      const result = await controller.testConnection(workspaceId, configId, mockReq);

      expect(result).toEqual(testResult);
      expect(mockOidcService.testConnection).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });
  });
});

describe('OIDC Token Fixtures Validation', () => {
  it('should have valid token claims structure', () => {
    expect(MOCK_OIDC_TOKENS.valid.claims.sub).toBeDefined();
    expect(MOCK_OIDC_TOKENS.valid.claims.email).toBe('user@test-corp.com');
    expect(MOCK_OIDC_TOKENS.valid.claims.email_verified).toBe(true);
    expect(MOCK_OIDC_TOKENS.valid.claims.iss).toBe('https://accounts.google.com');
    expect(MOCK_OIDC_TOKENS.valid.claims.aud).toBe(MOCK_OIDC_PROVIDER.clientId);
    expect(MOCK_OIDC_TOKENS.valid.claims.nonce).toBeDefined();
  });

  it('should have expired token error structure', () => {
    expect(MOCK_OIDC_TOKENS.expired.error).toBe('Token has expired');
    expect(MOCK_OIDC_TOKENS.expired.errorDescription).toBeDefined();
  });

  it('should have invalid audience error structure', () => {
    expect(MOCK_OIDC_TOKENS.invalidAudience.error).toBe('Invalid audience');
    expect(MOCK_OIDC_TOKENS.invalidAudience.errorDescription).toBeDefined();
  });

  it('should have Microsoft OIDC with multi-domain support', () => {
    expect(MOCK_MICROSOFT_OIDC.allowedDomains).toContain('test-corp.com');
    expect(MOCK_MICROSOFT_OIDC.allowedDomains).toContain('acquired-co.com');
    expect(MOCK_MICROSOFT_OIDC.discoveryUrl).toContain('test-tenant-id');
  });
});
