import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { OidcConfigService } from './oidc-config.service';
import { OidcProviderType } from '../../../database/entities/oidc-configuration.entity';

describe('OidcController', () => {
  let controller: OidcController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const configId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = 'user-123';

  const mockConfigResponse = {
    id: configId,
    workspaceId,
    providerType: 'google',
    displayName: 'Google Workspace',
    clientId: 'client-123',
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    issuer: 'https://accounts.google.com',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    endSessionEndpoint: null,
    scopes: ['openid', 'email', 'profile'],
    allowedDomains: null,
    usePkce: true,
    tokenEndpointAuthMethod: 'client_secret_post',
    attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name', groups: 'groups' },
    isActive: false,
    isTested: false,
    lastLoginAt: null,
    loginCount: 0,
    errorCount: 0,
    lastError: null,
    discoveryLastFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOidcService = {
    initiateLogin: jest.fn().mockResolvedValue({
      redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=test',
      state: 'test-state',
      nonce: 'test-nonce',
      codeVerifier: 'test-verifier',
    }),
    handleCallback: jest.fn().mockResolvedValue({
      userId: 'user-123',
      email: 'user@example.com',
      isNewUser: false,
      workspaceId,
      accessToken: 'jwt-access',
      refreshToken: 'jwt-refresh',
    }),
    testConnection: jest.fn().mockResolvedValue({
      redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state',
      state: 'test-state',
      nonce: 'test-nonce',
    }),
    getSuccessRedirectUrl: jest.fn().mockReturnValue('http://localhost:3000/auth/sso/callback#token=jwt-access&refresh=jwt-refresh'),
    getErrorRedirectUrl: jest.fn().mockReturnValue('http://localhost:3000/auth/sso/error?code=oidc_error'),
  };

  const mockOidcConfigService = {
    createConfig: jest.fn().mockResolvedValue(mockConfigResponse),
    listConfigs: jest.fn().mockResolvedValue([mockConfigResponse]),
    getConfig: jest.fn().mockResolvedValue(mockConfigResponse),
    updateConfig: jest.fn().mockResolvedValue(mockConfigResponse),
    deleteConfig: jest.fn().mockResolvedValue(undefined),
    activateConfig: jest.fn().mockResolvedValue({ ...mockConfigResponse, isActive: true }),
    deactivateConfig: jest.fn().mockResolvedValue({ ...mockConfigResponse, isActive: false }),
    refreshDiscovery: jest.fn().mockResolvedValue(mockConfigResponse),
    findActiveConfigsForWorkspace: jest.fn().mockResolvedValue([{ ...mockConfigResponse, id: configId, isActive: true, providerType: 'google', displayName: 'Google' }]),
  };

  const mockReq = (overrides = {}) => ({
    user: { id: userId },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  });

  const mockRes = () => {
    const res: any = {};
    res.redirect = jest.fn();
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

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

  describe('POST /config - createConfig', () => {
    const createDto = {
      providerType: OidcProviderType.GOOGLE,
      clientId: 'client-123',
      clientSecret: 'secret-456',
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    };

    it('should create OIDC configuration (201)', async () => {
      const result = await controller.createConfig(workspaceId, createDto, mockReq() as any);

      expect(result).toEqual(mockConfigResponse);
      expect(mockOidcConfigService.createConfig).toHaveBeenCalledWith(
        workspaceId,
        createDto,
        userId,
      );
    });

    it('should reject non-admin users (403)', async () => {
      mockOidcConfigService.createConfig.mockRejectedValueOnce(
        new ForbiddenException('Not admin'),
      );

      await expect(
        controller.createConfig(workspaceId, createDto, mockReq() as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /config - listConfigs', () => {
    it('should list all configs for workspace (200)', async () => {
      const result = await controller.listConfigs(workspaceId);

      expect(result).toHaveLength(1);
      expect(mockOidcConfigService.listConfigs).toHaveBeenCalledWith(workspaceId);
    });
  });

  describe('GET /config/:configId - getConfig', () => {
    it('should return specific config (200)', async () => {
      const result = await controller.getConfig(workspaceId, configId);

      expect(result.id).toBe(configId);
    });

    it('should return 404 for non-existent config', async () => {
      mockOidcConfigService.getConfig.mockRejectedValueOnce(
        new BadRequestException('Not found'),
      );

      await expect(
        controller.getConfig(workspaceId, 'nonexistent'),
      ).rejects.toThrow();
    });
  });

  describe('PUT /config/:configId - updateConfig', () => {
    it('should update config (200)', async () => {
      const updateDto = { displayName: 'Updated Name' };
      const result = await controller.updateConfig(workspaceId, configId, updateDto, mockReq() as any);

      expect(result).toBeDefined();
      expect(mockOidcConfigService.updateConfig).toHaveBeenCalledWith(
        workspaceId,
        configId,
        updateDto,
        userId,
      );
    });
  });

  describe('DELETE /config/:configId - deleteConfig', () => {
    it('should remove config (204)', async () => {
      await controller.deleteConfig(workspaceId, configId, mockReq() as any);

      expect(mockOidcConfigService.deleteConfig).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });
  });

  describe('POST /config/:configId/activate - activateConfig', () => {
    it('should activate tested config (200)', async () => {
      const result = await controller.activateConfig(workspaceId, configId, mockReq() as any);

      expect(result.isActive).toBe(true);
    });

    it('should reject untested config (400)', async () => {
      mockOidcConfigService.activateConfig.mockRejectedValueOnce(
        new BadRequestException('Must be tested'),
      );

      await expect(
        controller.activateConfig(workspaceId, configId, mockReq() as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /config/:configId/deactivate - deactivateConfig', () => {
    it('should deactivate config (200)', async () => {
      const result = await controller.deactivateConfig(workspaceId, configId, mockReq() as any);

      expect(result.isActive).toBe(false);
    });
  });

  describe('POST /config/:configId/refresh-discovery', () => {
    it('should re-fetch discovery (200)', async () => {
      const result = await controller.refreshDiscovery(workspaceId, configId, mockReq() as any);

      expect(result).toBeDefined();
      expect(mockOidcConfigService.refreshDiscovery).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });
  });

  describe('GET /login - initiateLogin', () => {
    it('should redirect to OIDC provider (302)', async () => {
      const res = mockRes();

      await controller.initiateLogin(workspaceId, configId, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com'),
      );
    });

    it('should reject request for inactive config (400)', async () => {
      const res = mockRes();
      mockOidcConfigService.findActiveConfigsForWorkspace.mockResolvedValueOnce([]);

      await controller.initiateLogin(workspaceId, undefined, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /callback - handleCallback', () => {
    it('should process valid authorization code', async () => {
      const res = mockRes();

      await controller.handleCallback(
        workspaceId,
        'auth-code',
        'test-state',
        undefined,
        undefined,
        mockReq() as any,
        res,
      );

      expect(mockOidcService.handleCallback).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalled();
    });

    it('should reject invalid state parameter', async () => {
      const res = mockRes();
      mockOidcService.handleCallback.mockRejectedValueOnce(
        new UnauthorizedException('Invalid state'),
      );

      await controller.handleCallback(
        workspaceId,
        'auth-code',
        'bad-state',
        undefined,
        undefined,
        mockReq() as any,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should handle provider error responses', async () => {
      const res = mockRes();

      await controller.handleCallback(
        workspaceId,
        undefined,
        undefined,
        'access_denied',
        'User denied access',
        mockReq() as any,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should handle missing params', async () => {
      const res = mockRes();

      await controller.handleCallback(
        workspaceId,
        undefined,
        undefined,
        undefined,
        undefined,
        mockReq() as any,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });

    it('should redirect to frontend with tokens on success', async () => {
      const res = mockRes();

      await controller.handleCallback(
        workspaceId,
        'auth-code',
        'test-state',
        undefined,
        undefined,
        mockReq() as any,
        res,
      );

      expect(mockOidcService.getSuccessRedirectUrl).toHaveBeenCalledWith(
        'jwt-access',
        'jwt-refresh',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('callback'),
      );
    });

    it('should redirect to frontend with error on failure', async () => {
      const res = mockRes();
      mockOidcService.handleCallback.mockRejectedValueOnce(
        new ForbiddenException('Domain not allowed'),
      );

      await controller.handleCallback(
        workspaceId,
        'auth-code',
        'test-state',
        undefined,
        undefined,
        mockReq() as any,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });
  });

  describe('POST /config/:configId/test - testConnection', () => {
    it('should return test redirect URL', async () => {
      const result = await controller.testConnection(workspaceId, configId, mockReq() as any);

      expect(result.redirectUrl).toContain('https://accounts.google.com');
      expect(mockOidcService.testConnection).toHaveBeenCalledWith(
        workspaceId,
        configId,
        userId,
      );
    });
  });

  describe('GET /provider-presets - getProviderPresets', () => {
    it('should return preset configurations', async () => {
      const result = await controller.getProviderPresets(workspaceId);

      expect(result).toHaveProperty('google');
      expect(result).toHaveProperty('microsoft');
      expect(result).toHaveProperty('okta');
      expect(result).toHaveProperty('auth0');
      expect(result).toHaveProperty('custom');
    });
  });
});
