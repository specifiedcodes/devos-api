import { Test, TestingModule } from '@nestjs/testing';
import { SamlController } from './saml.controller';
import { SamlService } from './saml.service';
import { SamlConfigService } from './saml-config.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

describe('SamlController', () => {
  let controller: SamlController;

  const mockSamlService = {
    generateSpMetadata: jest.fn(),
    initiateLogin: jest.fn(),
    handleCallback: jest.fn(),
    handleLogout: jest.fn(),
    testConnection: jest.fn(),
    getSuccessRedirectUrl: jest.fn(),
    getErrorRedirectUrl: jest.fn(),
  };

  const mockSamlConfigService = {
    createConfig: jest.fn(),
    updateConfig: jest.fn(),
    deleteConfig: jest.fn(),
    getConfig: jest.fn(),
    listConfigs: jest.fn(),
    activateConfig: jest.fn(),
    deactivateConfig: jest.fn(),
    findActiveConfigsForWorkspace: jest.fn(),
  };

  const mockSsoAuditService = {
    listEvents: jest.fn(),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockConfigId = '550e8400-e29b-41d4-a716-446655440002';

  const mockReq = {
    user: { id: 'user-123', sub: 'user-123' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'Mozilla/5.0' },
  };

  const mockRes = {
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SamlController],
      providers: [
        { provide: SamlService, useValue: mockSamlService },
        { provide: SamlConfigService, useValue: mockSamlConfigService },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
      ],
    }).compile();

    controller = module.get<SamlController>(SamlController);
  });

  describe('createConfig', () => {
    it('should create SAML configuration (201)', async () => {
      const dto = {
        providerName: 'Okta' as const,
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      };
      const expectedResponse = {
        id: mockConfigId,
        providerName: 'Okta',
        entityId: 'https://idp.example.com',
      };
      mockSamlConfigService.createConfig.mockResolvedValue(expectedResponse);

      const result = await controller.createConfig(mockWorkspaceId, dto, mockReq as any);

      expect(result).toEqual(expectedResponse);
      expect(mockSamlConfigService.createConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        dto,
        'user-123',
      );
    });
  });

  describe('listConfigs', () => {
    it('should list all configs for workspace (200)', async () => {
      const configs = [
        { id: 'config-1', providerName: 'Okta' },
        { id: 'config-2', providerName: 'Azure AD' },
      ];
      mockSamlConfigService.listConfigs.mockResolvedValue(configs);

      const result = await controller.listConfigs(mockWorkspaceId);

      expect(result).toEqual(configs);
      expect(mockSamlConfigService.listConfigs).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('getConfig', () => {
    it('should return specific config (200)', async () => {
      const config = { id: mockConfigId, providerName: 'Okta' };
      mockSamlConfigService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(mockWorkspaceId, mockConfigId);

      expect(result).toEqual(config);
    });
  });

  describe('updateConfig', () => {
    it('should update config (200)', async () => {
      const dto = { displayName: 'Updated Name' };
      const updated = { id: mockConfigId, displayName: 'Updated Name' };
      mockSamlConfigService.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(
        mockWorkspaceId,
        mockConfigId,
        dto,
        mockReq as any,
      );

      expect(result).toEqual(updated);
      expect(mockSamlConfigService.updateConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockConfigId,
        dto,
        'user-123',
      );
    });
  });

  describe('deleteConfig', () => {
    it('should remove config (204)', async () => {
      mockSamlConfigService.deleteConfig.mockResolvedValue(undefined);

      await controller.deleteConfig(mockWorkspaceId, mockConfigId, mockReq as any);

      expect(mockSamlConfigService.deleteConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockConfigId,
        'user-123',
      );
    });
  });

  describe('activateConfig', () => {
    it('should activate tested config (200)', async () => {
      const activated = { id: mockConfigId, isActive: true };
      mockSamlConfigService.activateConfig.mockResolvedValue(activated);

      const result = await controller.activateConfig(
        mockWorkspaceId,
        mockConfigId,
        mockReq as any,
      );

      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivateConfig', () => {
    it('should deactivate config (200)', async () => {
      const deactivated = { id: mockConfigId, isActive: false };
      mockSamlConfigService.deactivateConfig.mockResolvedValue(deactivated);

      const result = await controller.deactivateConfig(
        mockWorkspaceId,
        mockConfigId,
        mockReq as any,
      );

      expect(result.isActive).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return SP metadata without auth (200)', async () => {
      const metadata = {
        entityId: 'https://devos.com/saml/workspace-123',
        acsUrl: 'https://devos.com/api/auth/saml/workspace-123/callback',
        sloUrl: 'https://devos.com/api/auth/saml/workspace-123/logout',
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        metadataXml: '<EntityDescriptor>...</EntityDescriptor>',
      };
      mockSamlConfigService.listConfigs.mockResolvedValue([{ id: mockConfigId }]);
      mockSamlService.generateSpMetadata.mockResolvedValue(metadata);

      await controller.getMetadata(mockWorkspaceId, undefined, undefined, mockRes as any);

      expect(mockRes.json).toHaveBeenCalledWith(metadata);
    });

    it('should return valid XML when format=xml', async () => {
      const metadata = {
        metadataXml: '<?xml version="1.0"?><EntityDescriptor>...</EntityDescriptor>',
      };
      mockSamlConfigService.listConfigs.mockResolvedValue([{ id: mockConfigId }]);
      mockSamlService.generateSpMetadata.mockResolvedValue(metadata);

      await controller.getMetadata(mockWorkspaceId, 'xml', undefined, mockRes as any);

      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      expect(mockRes.send).toHaveBeenCalledWith(metadata.metadataXml);
    });

    it('should return 404 when no configs exist', async () => {
      mockSamlConfigService.listConfigs.mockResolvedValue([]);

      await controller.getMetadata(mockWorkspaceId, undefined, undefined, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('initiateLogin', () => {
    it('should redirect to IdP SSO URL (302)', async () => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([
        { id: mockConfigId },
      ]);
      mockSamlService.initiateLogin.mockResolvedValue({
        redirectUrl: 'https://idp.example.com/sso?SAMLRequest=encoded',
        requestId: '_req123',
      });

      await controller.initiateLogin(mockWorkspaceId, undefined, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://idp.example.com/sso?SAMLRequest=encoded',
      );
    });

    it('should reject when no active config exists (400)', async () => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([]);

      await controller.initiateLogin(mockWorkspaceId, undefined, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject when multiple configs and no configId (400)', async () => {
      mockSamlConfigService.findActiveConfigsForWorkspace.mockResolvedValue([
        { id: 'config-1', providerName: 'Okta', displayName: 'Okta' },
        { id: 'config-2', providerName: 'Azure AD', displayName: 'Azure' },
      ]);

      await controller.initiateLogin(mockWorkspaceId, undefined, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('handleCallback', () => {
    it('should redirect to frontend with tokens on success', async () => {
      mockSamlService.handleCallback.mockResolvedValue({
        userId: 'user-123',
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      });
      mockSamlService.getSuccessRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/callback?token=jwt-access&refresh=jwt-refresh',
      );

      await controller.handleCallback(
        mockWorkspaceId,
        { SAMLResponse: 'base64response' },
        mockReq as any,
        mockRes as any,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/sso/callback?token=jwt-access&refresh=jwt-refresh',
      );
    });

    it('should redirect to frontend with generic error code on failure', async () => {
      mockSamlService.handleCallback.mockRejectedValue(new Error('internal details'));
      mockSamlService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=saml_error',
      );

      await controller.handleCallback(
        mockWorkspaceId,
        { SAMLResponse: 'invalid' },
        mockReq as any,
        mockRes as any,
      );

      // Should use generic error code, not leak internal error message
      expect(mockSamlService.getErrorRedirectUrl).toHaveBeenCalledWith('saml_error');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/sso/error?code=saml_error',
      );
    });

    it('should redirect to error when SAMLResponse is missing', async () => {
      mockSamlService.getErrorRedirectUrl.mockReturnValue(
        'http://localhost:3000/auth/sso/error?code=missing_saml_response',
      );

      await controller.handleCallback(
        mockWorkspaceId,
        {},
        mockReq as any,
        mockRes as any,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error'),
      );
    });
  });

  describe('handleLogout', () => {
    it('should redirect on logout', async () => {
      mockSamlService.handleLogout.mockResolvedValue({
        redirectUrl: 'http://localhost:3000/auth/login',
      });

      await controller.handleLogout(
        mockWorkspaceId,
        { SAMLRequest: '<LogoutRequest/>' },
        mockRes as any,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost:3000/auth/login');
    });
  });

  describe('testConnection', () => {
    it('should return test redirect URL', async () => {
      const testResult = {
        redirectUrl: 'https://idp.example.com/sso?SAMLRequest=test',
        requestId: '_test123',
        relayState: 'test',
      };
      mockSamlService.testConnection.mockResolvedValue(testResult);

      const result = await controller.testConnection(
        mockWorkspaceId,
        mockConfigId,
        mockReq as any,
      );

      expect(result).toEqual(testResult);
    });
  });

  describe('listAuditEvents', () => {
    it('should return paginated audit events (200)', async () => {
      const events = {
        events: [{ id: 'event-1', eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS }],
        total: 1,
        page: 1,
        limit: 50,
      };
      mockSsoAuditService.listEvents.mockResolvedValue(events);

      const result = await controller.listAuditEvents(mockWorkspaceId);

      expect(result).toEqual(events);
      expect(mockSsoAuditService.listEvents).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({}),
      );
    });

    it('should pass filters to audit service', async () => {
      mockSsoAuditService.listEvents.mockResolvedValue({ events: [], total: 0, page: 1, limit: 50 });

      await controller.listAuditEvents(
        mockWorkspaceId,
        SsoAuditEventType.SAML_LOGIN_SUCCESS,
        'actor-123',
        '2026-01-01',
        '2026-02-01',
        '2',
        '25',
      );

      expect(mockSsoAuditService.listEvents).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({
          eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
          actorId: 'actor-123',
          page: 2,
          limit: 25,
        }),
      );
    });
  });
});
