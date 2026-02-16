import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OidcConfigService } from './oidc-config.service';
import { OidcConfiguration, OidcProviderType } from '../../../database/entities/oidc-configuration.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { SsoAuditService } from '../sso-audit.service';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

describe('OidcConfigService', () => {
  let service: OidcConfigService;

  const mockOidcConfigRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockWorkspaceMemberRepo = {
    findOne: jest.fn(),
  };

  const mockEncryptionService = {
    encryptWithWorkspaceKey: jest.fn(),
    decryptWithWorkspaceKey: jest.fn(),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockDiscoveryService = {
    fetchDiscoveryDocument: jest.fn(),
  };

  const mockDiscovery = {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    end_session_endpoint: 'https://accounts.google.com/logout',
  };

  const workspaceId = 'ws-123';
  const actorId = 'user-123';
  const configId = 'config-123';

  const mockConfig: Partial<OidcConfiguration> = {
    id: configId,
    workspaceId,
    providerType: OidcProviderType.GOOGLE,
    displayName: 'Test Google',
    clientId: 'client-id-123',
    clientSecret: 'encrypted-secret',
    clientSecretIv: 'iv-123',
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
    isActive: false,
    isTested: false,
    lastLoginAt: null,
    loginCount: 0,
    errorCount: 0,
    lastError: null,
    lastErrorAt: null,
    discoveryLastFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcConfigService,
        { provide: getRepositoryToken(OidcConfiguration), useValue: mockOidcConfigRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepo },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: OidcDiscoveryService, useValue: mockDiscoveryService },
      ],
    }).compile();

    service = module.get<OidcConfigService>(OidcConfigService);
  });

  describe('createConfig', () => {
    const createDto = {
      providerType: OidcProviderType.GOOGLE,
      clientId: 'client-id-123',
      clientSecret: 'raw-secret',
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    };

    it('should encrypt client secret and save to database', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted-secret',
        iv: 'iv-123',
      });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.create.mockReturnValue(mockConfig);
      mockOidcConfigRepo.save.mockResolvedValue(mockConfig);

      const result = await service.createConfig(workspaceId, createDto, actorId);

      expect(mockEncryptionService.encryptWithWorkspaceKey).toHaveBeenCalledWith(
        workspaceId,
        'raw-secret',
      );
      expect(result.id).toBe(configId);
      expect(result).not.toHaveProperty('clientSecret', 'raw-secret');
    });

    it('should fetch and cache OIDC discovery endpoints', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv',
      });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.create.mockReturnValue(mockConfig);
      mockOidcConfigRepo.save.mockResolvedValue(mockConfig);

      await service.createConfig(workspaceId, createDto, actorId);

      expect(mockDiscoveryService.fetchDiscoveryDocument).toHaveBeenCalledWith(createDto.discoveryUrl);
      expect(mockOidcConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          issuer: mockDiscovery.issuer,
          authorizationEndpoint: mockDiscovery.authorization_endpoint,
          tokenEndpoint: mockDiscovery.token_endpoint,
        }),
      );
    });

    it('should apply provider preset scopes', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv',
      });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.create.mockReturnValue(mockConfig);
      mockOidcConfigRepo.save.mockResolvedValue(mockConfig);

      await service.createConfig(workspaceId, createDto, actorId);

      expect(mockOidcConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['openid', 'email', 'profile'],
        }),
      );
    });

    it('should reject non-admin users', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        service.createConfig(workspaceId, createDto, actorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.OWNER });
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv',
      });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.create.mockReturnValue(mockConfig);
      mockOidcConfigRepo.save.mockResolvedValue(mockConfig);

      await service.createConfig(workspaceId, createDto, actorId);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.OIDC_CONFIG_CREATED,
          oidcConfigId: configId,
        }),
      );
    });
  });

  describe('updateConfig', () => {
    it('should deactivate when clientSecret changes', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      const existingConfig = { ...mockConfig, isActive: true, isTested: true };
      mockOidcConfigRepo.findOne.mockResolvedValue(existingConfig);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'new-encrypted',
        iv: 'new-iv',
      });
      mockOidcConfigRepo.save.mockResolvedValue({ ...existingConfig, isActive: false, isTested: false });

      const result = await service.updateConfig(workspaceId, configId, { clientSecret: 'new-secret' }, actorId);

      expect(result.isActive).toBe(false);
      expect(result.isTested).toBe(false);
    });

    it('should re-fetch discovery when discoveryUrl changes', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockOidcConfigRepo.findOne.mockResolvedValue({ ...mockConfig });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.save.mockResolvedValue(mockConfig);

      await service.updateConfig(
        workspaceId,
        configId,
        { discoveryUrl: 'https://new-provider.com/.well-known/openid-configuration' },
        actorId,
      );

      expect(mockDiscoveryService.fetchDiscoveryDocument).toHaveBeenCalledWith(
        'https://new-provider.com/.well-known/openid-configuration',
      );
    });
  });

  describe('deleteConfig', () => {
    it('should remove config and log audit event', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockOidcConfigRepo.findOne.mockResolvedValue(mockConfig);
      mockOidcConfigRepo.remove.mockResolvedValue(mockConfig);

      await service.deleteConfig(workspaceId, configId, actorId);

      expect(mockOidcConfigRepo.remove).toHaveBeenCalledWith(mockConfig);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.OIDC_CONFIG_DELETED,
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('should return response without clientSecret', async () => {
      mockOidcConfigRepo.findOne.mockResolvedValue(mockConfig);

      const result = await service.getConfig(workspaceId, configId);

      expect(result.id).toBe(configId);
      expect(result.clientId).toBe('client-id-123');
      // The response DTO should not contain the raw encrypted clientSecret
      expect(result).not.toHaveProperty('clientSecret');
      expect(result).not.toHaveProperty('clientSecretIv');
    });

    it('should throw NotFoundException for non-existent config', async () => {
      mockOidcConfigRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getConfig(workspaceId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activateConfig', () => {
    it('should require isTested=true', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockOidcConfigRepo.findOne.mockResolvedValue({ ...mockConfig, isTested: false });

      await expect(
        service.activateConfig(workspaceId, configId, actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should activate a tested config', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      const testedConfig = { ...mockConfig, isTested: true };
      mockOidcConfigRepo.findOne.mockResolvedValue(testedConfig);
      mockOidcConfigRepo.save.mockResolvedValue({ ...testedConfig, isActive: true });

      const result = await service.activateConfig(workspaceId, configId, actorId);

      expect(result.isActive).toBe(true);
    });
  });

  describe('refreshDiscovery', () => {
    it('should update cached endpoints', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      mockOidcConfigRepo.findOne.mockResolvedValue({ ...mockConfig });
      mockDiscoveryService.fetchDiscoveryDocument.mockResolvedValue(mockDiscovery);
      mockOidcConfigRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.refreshDiscovery(workspaceId, configId, actorId);

      expect(mockDiscoveryService.fetchDiscoveryDocument).toHaveBeenCalledWith(
        mockConfig.discoveryUrl,
        true,
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.OIDC_DISCOVERY_FETCHED,
        }),
      );
    });
  });

  describe('findActiveConfigsForWorkspace', () => {
    it('should return only active configs', async () => {
      const activeConfig = { ...mockConfig, isActive: true };
      mockOidcConfigRepo.find.mockResolvedValue([activeConfig]);

      const result = await service.findActiveConfigsForWorkspace(workspaceId);

      expect(result).toHaveLength(1);
      expect(mockOidcConfigRepo.find).toHaveBeenCalledWith({
        where: { workspaceId, isActive: true },
      });
    });
  });

  describe('listConfigs', () => {
    it('should list all configs for workspace', async () => {
      mockOidcConfigRepo.find.mockResolvedValue([mockConfig]);

      const result = await service.listConfigs(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(configId);
    });
  });

  describe('updateLoginStats', () => {
    it('should use atomic increment', async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockOidcConfigRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.updateLoginStats(configId);

      expect(mockQb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          loginCount: expect.any(Function),
        }),
      );
    });
  });

  describe('markAsTested', () => {
    it('should update isTested to true', async () => {
      mockOidcConfigRepo.update.mockResolvedValue({ affected: 1 });

      await service.markAsTested(configId);

      expect(mockOidcConfigRepo.update).toHaveBeenCalledWith(configId, { isTested: true });
    });
  });
});
