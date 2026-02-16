import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SamlConfigService } from './saml-config.service';
import { SamlConfiguration } from '../../../database/entities/saml-configuration.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

describe('SamlConfigService', () => {
  let service: SamlConfigService;

  const mockQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };

  const mockSamlConfigRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockWorkspaceMemberRepository = {
    findOne: jest.fn(),
  };

  const mockEncryptionService = {
    encryptWithWorkspaceKey: jest.fn(),
    decryptWithWorkspaceKey: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockActorId = '550e8400-e29b-41d4-a716-446655440001';
  const mockConfigId = '550e8400-e29b-41d4-a716-446655440002';

  const mockAdminMember = {
    userId: mockActorId,
    workspaceId: mockWorkspaceId,
    role: WorkspaceRole.ADMIN,
  };

  const mockSamlConfig: Partial<SamlConfiguration> = {
    id: mockConfigId,
    workspaceId: mockWorkspaceId,
    providerName: 'Okta',
    displayName: 'Test Okta',
    entityId: 'https://idp.example.com',
    ssoUrl: 'https://idp.example.com/sso',
    sloUrl: null,
    certificate: 'encrypted-cert-data',
    certificateIv: 'test-iv',
    certificateFingerprint: 'abc123',
    certificateExpiresAt: new Date('2027-01-01'),
    attributeMapping: { email: 'email', firstName: 'firstName', lastName: 'lastName', groups: 'groups' },
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    wantAssertionsSigned: true,
    wantResponseSigned: true,
    allowUnencryptedAssertion: false,
    isActive: false,
    isTested: false,
    lastLoginAt: null,
    loginCount: 0,
    errorCount: 0,
    lastError: null,
    lastErrorAt: null,
    metadataUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlConfigService,
        {
          provide: getRepositoryToken(SamlConfiguration),
          useValue: mockSamlConfigRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockWorkspaceMemberRepository,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: SsoAuditService,
          useValue: mockSsoAuditService,
        },
      ],
    }).compile();

    service = module.get<SamlConfigService>(SamlConfigService);
  });

  describe('createConfig', () => {
    it('should encrypt certificate and save to database', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted-cert',
        iv: 'test-iv',
      });
      mockSamlConfigRepository.create.mockReturnValue(mockSamlConfig);
      mockSamlConfigRepository.save.mockResolvedValue(mockSamlConfig);

      // Mock parseCertificate
      jest.spyOn(service, 'parseCertificate').mockReturnValue({
        fingerprint: 'abc123def456',
        expiresAt: new Date('2027-01-01'),
        subject: 'CN=test',
        issuer: 'CN=test',
        serialNumber: '123',
      });

      const result = await service.createConfig(
        mockWorkspaceId,
        {
          providerName: 'Okta',
          entityId: 'https://idp.example.com',
          ssoUrl: 'https://idp.example.com/sso',
          certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        },
        mockActorId,
      );

      expect(mockEncryptionService.encryptWithWorkspaceKey).toHaveBeenCalled();
      expect(mockSamlConfigRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(mockConfigId);
      expect(result.providerName).toBe('Okta');
    });

    it('should extract and store certificate fingerprint and expiry', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted-cert',
        iv: 'test-iv',
      });

      const certInfo = {
        fingerprint: 'sha256-fingerprint',
        expiresAt: new Date('2027-06-15'),
        subject: 'CN=test',
        issuer: 'CN=test-ca',
        serialNumber: '456',
      };
      jest.spyOn(service, 'parseCertificate').mockReturnValue(certInfo);

      mockSamlConfigRepository.create.mockImplementation((data: any) => ({
        ...mockSamlConfig,
        ...data,
      }));
      mockSamlConfigRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      await service.createConfig(
        mockWorkspaceId,
        {
          providerName: 'Okta',
          entityId: 'https://idp.example.com',
          ssoUrl: 'https://idp.example.com/sso',
          certificate: 'test-cert',
        },
        mockActorId,
      );

      expect(mockSamlConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          certificateFingerprint: 'sha256-fingerprint',
          certificateExpiresAt: certInfo.expiresAt,
        }),
      );
    });

    it('should reject invalid PEM certificates', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);

      jest.spyOn(service, 'parseCertificate').mockImplementation(() => {
        throw new BadRequestException('Invalid certificate');
      });

      await expect(
        service.createConfig(
          mockWorkspaceId,
          {
            providerName: 'Okta',
            entityId: 'https://idp.example.com',
            ssoUrl: 'https://idp.example.com/sso',
            certificate: 'not-a-valid-cert',
          },
          mockActorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event on creation', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv',
      });
      jest.spyOn(service, 'parseCertificate').mockReturnValue({
        fingerprint: 'fp', expiresAt: new Date('2027-01-01'),
        subject: 'CN=test', issuer: 'CN=test', serialNumber: '1',
      });
      mockSamlConfigRepository.create.mockReturnValue(mockSamlConfig);
      mockSamlConfigRepository.save.mockResolvedValue(mockSamlConfig);

      await service.createConfig(
        mockWorkspaceId,
        {
          providerName: 'Okta',
          entityId: 'https://idp.example.com',
          ssoUrl: 'https://idp.example.com/sso',
          certificate: 'test-cert',
        },
        mockActorId,
      );

      // Wait for fire-and-forget promise
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SAML_CONFIG_CREATED,
          actorId: mockActorId,
        }),
      );
    });

    it('should reject non-admin users', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({
        ...mockAdminMember,
        role: WorkspaceRole.DEVELOPER,
      });

      await expect(
        service.createConfig(
          mockWorkspaceId,
          {
            providerName: 'Okta',
            entityId: 'https://idp.example.com',
            ssoUrl: 'https://idp.example.com/sso',
            certificate: 'test-cert',
          },
          mockActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateConfig', () => {
    it('should deactivate config when certificate changes', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue({
        ...mockSamlConfig,
        isActive: true,
        isTested: true,
      });
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'new-encrypted',
        iv: 'new-iv',
      });
      jest.spyOn(service, 'parseCertificate').mockReturnValue({
        fingerprint: 'new-fp', expiresAt: new Date('2028-01-01'),
        subject: 'CN=new', issuer: 'CN=new', serialNumber: '2',
      });
      mockSamlConfigRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.updateConfig(
        mockWorkspaceId,
        mockConfigId,
        { certificate: 'new-cert' },
        mockActorId,
      );

      expect(result.isActive).toBe(false);
      expect(result.isTested).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    it('should remove config and log audit event', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue(mockSamlConfig);
      mockSamlConfigRepository.remove.mockResolvedValue(mockSamlConfig);

      await service.deleteConfig(mockWorkspaceId, mockConfigId, mockActorId);

      expect(mockSamlConfigRepository.remove).toHaveBeenCalledWith(mockSamlConfig);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SAML_CONFIG_DELETED,
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('should return response without raw certificate', async () => {
      mockSamlConfigRepository.findOne.mockResolvedValue(mockSamlConfig);

      const result = await service.getConfig(mockWorkspaceId, mockConfigId);

      expect(result.certificateFingerprint).toBe('abc123');
      expect((result as any).certificate).toBeUndefined();
      expect((result as any).certificateIv).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent config', async () => {
      mockSamlConfigRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getConfig(mockWorkspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listConfigs', () => {
    it('should return all configs for workspace', async () => {
      mockSamlConfigRepository.find.mockResolvedValue([mockSamlConfig, { ...mockSamlConfig, id: 'config-2' }]);

      const result = await service.listConfigs(mockWorkspaceId);

      expect(result).toHaveLength(2);
      expect(mockSamlConfigRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('activateConfig', () => {
    it('should require isTested=true before activation', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue({
        ...mockSamlConfig,
        isTested: false,
      });

      await expect(
        service.activateConfig(mockWorkspaceId, mockConfigId, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with specific message if not tested', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue({
        ...mockSamlConfig,
        isTested: false,
      });

      await expect(
        service.activateConfig(mockWorkspaceId, mockConfigId, mockActorId),
      ).rejects.toThrow('Configuration must be tested before activation');
    });

    it('should activate tested config', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue({
        ...mockSamlConfig,
        isTested: true,
      });
      mockSamlConfigRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.activateConfig(mockWorkspaceId, mockConfigId, mockActorId);

      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivateConfig', () => {
    it('should set isActive=false', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(mockAdminMember);
      mockSamlConfigRepository.findOne.mockResolvedValue({
        ...mockSamlConfig,
        isActive: true,
      });
      mockSamlConfigRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.deactivateConfig(mockWorkspaceId, mockConfigId, mockActorId);

      expect(result.isActive).toBe(false);
    });
  });

  describe('getDecryptedConfig', () => {
    it('should decrypt the certificate', async () => {
      mockSamlConfigRepository.findOne.mockResolvedValue(mockSamlConfig);
      mockEncryptionService.decryptWithWorkspaceKey.mockReturnValue('decrypted-cert-pem');

      const result = await service.getDecryptedConfig(mockWorkspaceId, mockConfigId);

      expect(result.decryptedCertificate).toBe('decrypted-cert-pem');
      expect(mockEncryptionService.decryptWithWorkspaceKey).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockSamlConfig.certificate,
        mockSamlConfig.certificateIv,
      );
    });
  });

  describe('parseCertificate', () => {
    it('should reject malformed PEM input', () => {
      expect(() => service.parseCertificate('not-a-certificate')).toThrow(BadRequestException);
    });
  });

  describe('findActiveConfigByEntityId', () => {
    it('should find active config by entity ID', async () => {
      mockSamlConfigRepository.findOne.mockResolvedValue(mockSamlConfig);

      const result = await service.findActiveConfigByEntityId('https://idp.example.com');

      expect(result).toEqual(mockSamlConfig);
      expect(mockSamlConfigRepository.findOne).toHaveBeenCalledWith({
        where: { entityId: 'https://idp.example.com', isActive: true },
      });
    });
  });
});
