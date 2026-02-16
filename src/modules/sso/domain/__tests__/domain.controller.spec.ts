import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { DomainController } from '../domain.controller';
import { DomainVerificationService } from '../domain-verification.service';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoDomain, DomainStatus, DomainVerificationMethod } from '../../../../database/entities/sso-domain.entity';
import { DOMAIN_CONSTANTS } from '../../constants/domain.constants';

describe('DomainController', () => {
  let controller: DomainController;

  const mockDomainService = {
    registerDomain: jest.fn(),
    verifyDomain: jest.fn(),
    listDomains: jest.fn(),
    getDomain: jest.fn(),
    removeDomain: jest.fn(),
    linkProvider: jest.fn(),
    lookupDomain: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';
  const mockDomainId = '550e8400-e29b-41d4-a716-446655440002';
  const mockSamlConfigId = '550e8400-e29b-41d4-a716-446655440003';

  const mockDomain: SsoDomain = {
    id: mockDomainId,
    workspaceId: mockWorkspaceId,
    domain: 'acme.com',
    verificationMethod: DomainVerificationMethod.DNS,
    verificationToken: 'a'.repeat(64),
    status: DomainStatus.PENDING,
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastCheckAt: null,
    lastCheckError: null,
    checkCount: 0,
    samlConfigId: null,
    oidcConfigId: null,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReq = {
    user: { id: mockUserId, sub: mockUserId },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainController],
      providers: [
        {
          provide: DomainVerificationService,
          useValue: mockDomainService,
        },
        {
          provide: SsoAuditService,
          useValue: mockSsoAuditService,
        },
      ],
    }).compile();

    controller = module.get<DomainController>(DomainController);
  });

  describe('POST / (registerDomain)', () => {
    it('should create domain and return DomainResponseDto with dnsInstruction', async () => {
      mockDomainService.registerDomain.mockResolvedValue(mockDomain);

      const result = await controller.registerDomain(
        mockWorkspaceId,
        { domain: 'acme.com' },
        mockReq,
      );

      expect(result.id).toBe(mockDomainId);
      expect(result.domain).toBe('acme.com');
      expect(result.status).toBe('pending');
      expect(result.dnsInstruction).toContain('devos-verification=');
      expect(result.dnsInstruction).toContain(mockDomain.verificationToken);
      expect(mockDomainService.registerDomain).toHaveBeenCalledWith(
        mockWorkspaceId,
        'acme.com',
        mockUserId,
      );
    });

    it('should return 409 for already-claimed domain', async () => {
      mockDomainService.registerDomain.mockRejectedValue(
        new ConflictException('Domain already registered'),
      );

      await expect(
        controller.registerDomain(mockWorkspaceId, { domain: 'acme.com' }, mockReq),
      ).rejects.toThrow(ConflictException);
    });

    it('should return 422 when workspace domain limit exceeded', async () => {
      mockDomainService.registerDomain.mockRejectedValue(
        new UnprocessableEntityException('Workspace has reached maximum domains'),
      );

      await expect(
        controller.registerDomain(mockWorkspaceId, { domain: 'acme.com' }, mockReq),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should return 400 for blocked domain', async () => {
      mockDomainService.registerDomain.mockRejectedValue(
        new BadRequestException('Domain is a blocked public email provider'),
      );

      await expect(
        controller.registerDomain(mockWorkspaceId, { domain: 'gmail.com' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /:domainId/verify', () => {
    it('should trigger verification and return updated domain', async () => {
      const verifiedDomain = {
        ...mockDomain,
        status: DomainStatus.VERIFIED,
        verifiedAt: new Date(),
      };
      mockDomainService.verifyDomain.mockResolvedValue(verifiedDomain);

      const result = await controller.verifyDomain(mockDomainId, mockWorkspaceId, mockReq);

      expect(result.status).toBe('verified');
      expect(mockDomainService.verifyDomain).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDomainId,
        mockUserId,
      );
    });

    it('should return 404 for non-existent domain', async () => {
      mockDomainService.verifyDomain.mockRejectedValue(
        new NotFoundException('Domain not found'),
      );

      await expect(
        controller.verifyDomain(mockDomainId, mockWorkspaceId, mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET / (listDomains)', () => {
    it('should return list of domains for workspace', async () => {
      mockDomainService.listDomains.mockResolvedValue([mockDomain]);

      const result = await controller.listDomains(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('acme.com');
    });

    it('should filter by status when query parameter provided', async () => {
      mockDomainService.listDomains.mockResolvedValue([]);

      await controller.listDomains(mockWorkspaceId, DomainStatus.VERIFIED);

      expect(mockDomainService.listDomains).toHaveBeenCalledWith(
        mockWorkspaceId,
        DomainStatus.VERIFIED,
      );
    });
  });

  describe('GET /:domainId', () => {
    it('should return single domain', async () => {
      mockDomainService.getDomain.mockResolvedValue(mockDomain);

      const result = await controller.getDomain(mockDomainId, mockWorkspaceId);

      expect(result.id).toBe(mockDomainId);
    });

    it('should return 404 for domain not owned by workspace', async () => {
      mockDomainService.getDomain.mockRejectedValue(
        new NotFoundException('Domain not found'),
      );

      await expect(
        controller.getDomain(mockDomainId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT /:domainId/provider', () => {
    it('should link provider and return updated domain', async () => {
      const linkedDomain = {
        ...mockDomain,
        status: DomainStatus.VERIFIED,
        samlConfigId: mockSamlConfigId,
      };
      mockDomainService.linkProvider.mockResolvedValue(linkedDomain);

      const result = await controller.linkProvider(
        mockDomainId,
        mockWorkspaceId,
        { samlConfigId: mockSamlConfigId },
        mockReq,
      );

      expect(result.samlConfigId).toBe(mockSamlConfigId);
      expect(mockDomainService.linkProvider).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDomainId,
        mockSamlConfigId,
        null,
        mockUserId,
      );
    });

    it('should return 422 when domain not verified', async () => {
      mockDomainService.linkProvider.mockRejectedValue(
        new UnprocessableEntityException('Domain must be verified'),
      );

      await expect(
        controller.linkProvider(
          mockDomainId,
          mockWorkspaceId,
          { samlConfigId: mockSamlConfigId },
          mockReq,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('DELETE /:domainId', () => {
    it('should remove domain', async () => {
      mockDomainService.removeDomain.mockResolvedValue(undefined);

      await controller.removeDomain(mockDomainId, mockWorkspaceId, mockReq);

      expect(mockDomainService.removeDomain).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDomainId,
        mockUserId,
      );
    });

    it('should return 404 for non-existent domain', async () => {
      mockDomainService.removeDomain.mockRejectedValue(
        new NotFoundException('Domain not found'),
      );

      await expect(
        controller.removeDomain(mockDomainId, mockWorkspaceId, mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /lookup/:email', () => {
    it('should return provider info for verified domain', async () => {
      mockDomainService.lookupDomain.mockResolvedValue({
        domain: 'acme.com',
        providerType: 'saml',
        providerId: mockSamlConfigId,
        providerName: 'Okta',
        workspaceId: mockWorkspaceId,
      });

      const result = await controller.lookupByEmail('user@acme.com');

      expect(result.found).toBe(true);
      expect(result.domain).toBe('acme.com');
      expect(result.providerType).toBe('saml');
    });

    it('should return { found: false } for unknown domain', async () => {
      mockDomainService.lookupDomain.mockResolvedValue(null);

      const result = await controller.lookupByEmail('user@unknown.com');

      expect(result.found).toBe(false);
    });

    it('should handle invalid email format gracefully', async () => {
      const result = await controller.lookupByEmail('not-an-email');

      expect(result.found).toBe(false);
      expect(mockDomainService.lookupDomain).not.toHaveBeenCalled();
    });
  });
});
