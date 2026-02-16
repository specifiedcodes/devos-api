import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SamlService } from './saml.service';
import { SamlConfigService } from './saml-config.service';
import { SamlValidationService } from './saml-validation.service';
import { SsoAuditService } from '../sso-audit.service';
import { AuthService } from '../../auth/auth.service';
import { RedisService } from '../../redis/redis.service';
import { JitProvisioningService } from '../jit/jit-provisioning.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

// Mock @node-saml/node-saml
jest.mock('@node-saml/node-saml', () => ({
  SAML: jest.fn().mockImplementation(() => ({
    getAuthorizeUrlAsync: jest.fn().mockResolvedValue('https://idp.example.com/sso?SAMLRequest=encoded'),
    validatePostResponseAsync: jest.fn(),
  })),
}));

describe('SamlService', () => {
  let service: SamlService;

  const mockSamlConfigService = {
    getConfig: jest.fn(),
    getDecryptedConfig: jest.fn(),
    listConfigs: jest.fn(),
    findActiveConfigsForWorkspace: jest.fn(),
    updateLoginStats: jest.fn().mockResolvedValue(undefined),
    updateErrorStats: jest.fn().mockResolvedValue(undefined),
    markAsTested: jest.fn().mockResolvedValue(undefined),
  };

  const mockSamlValidationService = {
    validateSamlResponse: jest.fn(),
    extractAttributes: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockAuthService = {
    generateTokensForSsoUser: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        APP_URL: 'http://localhost:3001',
        FRONTEND_URL: 'http://localhost:3000',
        SAML_SP_ENTITY_ID_PREFIX: 'https://devos.com/saml',
      };
      return config[key] || defaultValue;
    }),
  };

  const mockJitProvisioningService = {
    provisionUser: jest.fn(),
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    extractAttributes: jest.fn(),
    resolveRole: jest.fn(),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockConfigId = '550e8400-e29b-41d4-a716-446655440002';
  const mockActorId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlService,
        { provide: SamlConfigService, useValue: mockSamlConfigService },
        { provide: SamlValidationService, useValue: mockSamlValidationService },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JitProvisioningService, useValue: mockJitProvisioningService },
      ],
    }).compile();

    service = module.get<SamlService>(SamlService);
  });

  describe('generateSpMetadata', () => {
    it('should return correct entity ID, ACS URL, and SLO URL', async () => {
      mockSamlConfigService.getConfig.mockResolvedValue({
        id: mockConfigId,
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        wantAssertionsSigned: true,
      });

      const result = await service.generateSpMetadata(mockWorkspaceId, mockConfigId);

      expect(result.entityId).toBe(`https://devos.com/saml/${mockWorkspaceId}`);
      expect(result.acsUrl).toBe(`http://localhost:3001/api/auth/saml/${mockWorkspaceId}/callback`);
      expect(result.sloUrl).toBe(`http://localhost:3001/api/auth/saml/${mockWorkspaceId}/logout`);
      expect(result.nameIdFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    });

    it('should include correct XML structure', async () => {
      mockSamlConfigService.getConfig.mockResolvedValue({
        id: mockConfigId,
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        wantAssertionsSigned: true,
      });

      const result = await service.generateSpMetadata(mockWorkspaceId, mockConfigId);

      expect(result.metadataXml).toContain('EntityDescriptor');
      expect(result.metadataXml).toContain('SPSSODescriptor');
      expect(result.metadataXml).toContain('AssertionConsumerService');
      expect(result.metadataXml).toContain('SingleLogoutService');
      expect(result.metadataXml).toContain(mockWorkspaceId);
    });
  });

  describe('initiateLogin', () => {
    it('should generate AuthnRequest and store relay state in Redis', async () => {
      mockSamlConfigService.getDecryptedConfig.mockResolvedValue({
        id: mockConfigId,
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        decryptedCertificate: 'cert-pem',
        isActive: true,
        wantAssertionsSigned: true,
        wantResponseSigned: true,
      });

      const result = await service.initiateLogin(mockWorkspaceId, mockConfigId);

      expect(result.redirectUrl).toContain('https://idp.example.com');
      expect(result.requestId).toBeDefined();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('saml:relay:'),
        expect.stringContaining(mockWorkspaceId),
        300,
      );
    });

    it('should reject inactive configurations', async () => {
      mockSamlConfigService.getDecryptedConfig.mockResolvedValue({
        id: mockConfigId,
        isActive: false,
      });

      await expect(
        service.initiateLogin(mockWorkspaceId, mockConfigId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    const mockActiveConfig = {
      id: mockConfigId,
      workspaceId: mockWorkspaceId,
      entityId: 'https://idp.example.com',
      ssoUrl: 'https://idp.example.com/sso',
      sloUrl: null,
      certificate: 'encrypted',
      certificateIv: 'iv',
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      wantAssertionsSigned: true,
      wantResponseSigned: true,
      authnContext: null,
      attributeMapping: { email: 'email', firstName: 'firstName', lastName: 'lastName', groups: 'groups' },
    };

    beforeEach(() => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([mockActiveConfig]);
      mockSamlConfigService.getDecryptedConfig.mockResolvedValue({
        ...mockActiveConfig,
        decryptedCertificate: 'decrypted-cert',
      });
      mockSamlValidationService.validateSamlResponse.mockResolvedValue({
        nameId: 'user@example.com',
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        sessionIndex: '_session123',
        attributes: { email: 'user@example.com', firstName: 'John', lastName: 'Doe' },
        issuer: 'https://idp.example.com',
      });
      mockSamlValidationService.extractAttributes.mockReturnValue({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should call jitProvisioningService.provisionUser with correct arguments', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: true,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      await service.handleCallback(
        mockWorkspaceId,
        'base64SAMLResponse',
        undefined,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(mockJitProvisioningService.provisionUser).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({ email: 'user@example.com' }),
        'saml',
        '127.0.0.1',
        'Mozilla/5.0',
      );
    });

    it('should create new user on first SSO login (JIT provisioning)', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: true,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      const result = await service.handleCallback(
        mockWorkspaceId,
        'base64SAMLResponse',
        undefined,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.isNewUser).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.accessToken).toBe('jwt-access');
      expect(result.refreshToken).toBe('jwt-refresh');
    });

    it('should update existing user on subsequent SSO logins', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      const result = await service.handleCallback(
        mockWorkspaceId,
        'base64SAMLResponse',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.userId).toBe('user-123');
    });

    it('should still return correct SamlCallbackResult shape', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      const result = await service.handleCallback(mockWorkspaceId, 'base64SAMLResponse');

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('isNewUser');
      expect(result).toHaveProperty('workspaceId');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('samlSessionIndex');
    });

    it('should generate valid JWT tokens after successful SAML auth', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      const result = await service.handleCallback(mockWorkspaceId, 'base64SAMLResponse');

      expect(mockAuthService.generateTokensForSsoUser).toHaveBeenCalled();
      expect(result.accessToken).toBe('jwt-access');
      expect(result.refreshToken).toBe('jwt-refresh');
    });

    it('should increment login_count on SAML config', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      await service.handleCallback(mockWorkspaceId, 'base64SAMLResponse');

      expect(mockSamlConfigService.updateLoginStats).toHaveBeenCalledWith(mockConfigId);
    });

    it('should log saml_login_success audit event', async () => {
      mockJitProvisioningService.provisionUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
        isNewUser: false,
        profileUpdated: false,
        roleUpdated: false,
        provisioningDetails: {},
      });
      mockAuthService.generateTokensForSsoUser.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01' },
        tokens: { access_token: 'jwt-access', refresh_token: 'jwt-refresh', expires_in: 86400 },
      });

      await service.handleCallback(mockWorkspaceId, 'base64SAMLResponse');

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
          workspaceId: mockWorkspaceId,
        }),
      );
    });

    it('should reject when no active SAML configs found', async () => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([]);

      await expect(
        service.handleCallback(mockWorkspaceId, 'base64SAMLResponse'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle missing email attribute', async () => {
      mockSamlValidationService.extractAttributes.mockReturnValue({
        email: '',
      });
      mockSamlValidationService.validateSamlResponse.mockResolvedValue({
        nameId: '',
        attributes: { email: '' },
        issuer: 'https://idp.example.com',
      });

      await expect(
        service.handleCallback(mockWorkspaceId, 'base64SAMLResponse'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle ForbiddenException from provisioning service', async () => {
      const { ForbiddenException } = require('@nestjs/common');
      mockJitProvisioningService.provisionUser.mockRejectedValue(
        new ForbiddenException('JIT provisioning is disabled'),
      );

      await expect(
        service.handleCallback(mockWorkspaceId, 'base64SAMLResponse'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleLogout', () => {
    it('should handle IdP-initiated LogoutRequest', async () => {
      const result = await service.handleLogout(mockWorkspaceId, undefined, '<samlp:LogoutRequest>...</samlp:LogoutRequest>');

      expect(result.redirectUrl).toContain('http://localhost:3000');
    });

    it('should generate SP-initiated LogoutRequest', async () => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([
        { sloUrl: 'https://idp.example.com/slo' },
      ]);

      const result = await service.handleLogout(mockWorkspaceId);

      expect(result.redirectUrl).toBe('https://idp.example.com/slo');
    });
  });

  describe('testConnection', () => {
    it('should store test relay state in Redis', async () => {
      mockSamlConfigService.getDecryptedConfig.mockResolvedValue({
        id: mockConfigId,
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        decryptedCertificate: 'cert-pem',
        wantAssertionsSigned: true,
        wantResponseSigned: true,
      });

      const result = await service.testConnection(mockWorkspaceId, mockConfigId, mockActorId);

      expect(result.redirectUrl).toBeDefined();
      expect(result.relayState).toBe('test');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('saml:relay:'),
        expect.stringContaining('"isTest":true'),
        300,
      );
    });
  });

  describe('getSuccessRedirectUrl', () => {
    it('should return correct frontend URL with tokens using fragment', () => {
      const url = service.getSuccessRedirectUrl('access-token', 'refresh-token');
      expect(url).toBe('http://localhost:3000/auth/sso/callback#token=access-token&refresh=refresh-token');
    });
  });

  describe('getErrorRedirectUrl', () => {
    it('should return correct frontend error URL', () => {
      const url = service.getErrorRedirectUrl('invalid_response');
      expect(url).toBe('http://localhost:3000/auth/sso/error?code=invalid_response');
    });
  });
});
