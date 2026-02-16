import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainVerificationService } from '../domain-verification.service';
import { SsoDomain, DomainStatus, DomainVerificationMethod } from '../../../../database/entities/sso-domain.entity';
import { SamlConfiguration } from '../../../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../../../database/entities/oidc-configuration.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../../redis/redis.service';
import { DOMAIN_CONSTANTS } from '../../constants/domain.constants';
import * as dns from 'dns';

// Mock dns.promises.resolveTxt
jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(),
  },
}));

const mockResolveTxt = dns.promises.resolveTxt as jest.MockedFunction<typeof dns.promises.resolveTxt>;

describe('DomainVerificationService', () => {
  let service: DomainVerificationService;

  const mockSsoDomainRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  const mockSamlConfigRepository = {
    findOne: jest.fn(),
  };

  const mockOidcConfigRepository = {
    findOne: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb({ remove: jest.fn() })),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';
  const mockDomainId = '550e8400-e29b-41d4-a716-446655440002';
  const mockSamlConfigId = '550e8400-e29b-41d4-a716-446655440003';
  const mockOidcConfigId = '550e8400-e29b-41d4-a716-446655440004';

  const mockDomain: Partial<SsoDomain> = {
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainVerificationService,
        {
          provide: getRepositoryToken(SsoDomain),
          useValue: mockSsoDomainRepository,
        },
        {
          provide: getRepositoryToken(SamlConfiguration),
          useValue: mockSamlConfigRepository,
        },
        {
          provide: getRepositoryToken(OidcConfiguration),
          useValue: mockOidcConfigRepository,
        },
        {
          provide: SsoAuditService,
          useValue: mockSsoAuditService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DomainVerificationService>(DomainVerificationService);
  });

  describe('normalizeDomain', () => {
    it('should convert domain to lowercase', () => {
      expect(service.normalizeDomain('ACME.COM')).toBe('acme.com');
    });

    it('should trim whitespace', () => {
      expect(service.normalizeDomain('  acme.com  ')).toBe('acme.com');
    });

    it('should remove trailing dot', () => {
      expect(service.normalizeDomain('acme.com.')).toBe('acme.com');
    });

    it('should remove protocol prefix', () => {
      expect(service.normalizeDomain('https://acme.com')).toBe('acme.com');
      expect(service.normalizeDomain('http://acme.com')).toBe('acme.com');
    });
  });

  describe('registerDomain', () => {
    it('should create domain with pending status and verification token', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockSsoDomainRepository.create.mockReturnValue({ ...mockDomain });
      mockSsoDomainRepository.save.mockResolvedValue({ ...mockDomain });

      const result = await service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId);

      expect(mockSsoDomainRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          domain: 'acme.com',
          status: DomainStatus.PENDING,
          createdBy: mockUserId,
        }),
      );
      expect(mockSsoDomainRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should normalize domain to lowercase', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockSsoDomainRepository.create.mockReturnValue({ ...mockDomain });
      mockSsoDomainRepository.save.mockResolvedValue({ ...mockDomain });

      await service.registerDomain(mockWorkspaceId, 'ACME.COM', mockUserId);

      expect(mockSsoDomainRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'acme.com' }),
      );
    });

    it('should generate a 64-char hex verification token', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockSsoDomainRepository.create.mockImplementation((data) => data);
      mockSsoDomainRepository.save.mockImplementation((data) => Promise.resolve({ id: mockDomainId, ...data }));

      const result = await service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId);

      expect(mockSsoDomainRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
    });

    it('should set 7-day expiry', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockSsoDomainRepository.create.mockImplementation((data) => data);
      mockSsoDomainRepository.save.mockImplementation((data) => Promise.resolve({ id: mockDomainId, ...data }));

      await service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId);

      const createCall = mockSsoDomainRepository.create.mock.calls[0][0];
      const expiresAt = createCall.expiresAt as Date;
      const now = new Date();
      const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7.1);
    });

    it('should reject blocked domains with 400', async () => {
      await expect(
        service.registerDomain(mockWorkspaceId, 'gmail.com', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject yahoo.com as blocked domain', async () => {
      await expect(
        service.registerDomain(mockWorkspaceId, 'yahoo.com', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject domain already claimed by another workspace with 409', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue({
        ...mockDomain,
        workspaceId: 'other-workspace-id',
        status: DomainStatus.PENDING,
      });

      await expect(
        service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow re-registration of expired domain', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue({
        ...mockDomain,
        status: DomainStatus.EXPIRED,
      });
      mockSsoDomainRepository.create.mockReturnValue({ ...mockDomain });
      mockSsoDomainRepository.save.mockResolvedValue({ ...mockDomain });

      const result = await service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId);

      // Expired domain removal happens inside a transaction for atomicity
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject when workspace has reached MAX_DOMAINS_PER_WORKSPACE with 422', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(DOMAIN_CONSTANTS.MAX_DOMAINS_PER_WORKSPACE);

      await expect(
        service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should log domain_registered audit event', async () => {
      mockSsoDomainRepository.count.mockResolvedValue(0);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockSsoDomainRepository.create.mockReturnValue({ ...mockDomain });
      mockSsoDomainRepository.save.mockResolvedValue({ ...mockDomain });

      await service.registerDomain(mockWorkspaceId, 'acme.com', mockUserId);

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_REGISTERED,
          workspaceId: mockWorkspaceId,
          actorId: mockUserId,
        }),
      );
    });
  });

  describe('verifyDomain', () => {
    it('should call checkDnsVerification and update status to verified on success', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      mockResolveTxt.mockResolvedValue([[`devos-verification=${'a'.repeat(64)}`]]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      const result = await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(result.status).toBe(DomainStatus.VERIFIED);
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('should set expiresAt to 12 months on successful verification', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      mockResolveTxt.mockResolvedValue([[`devos-verification=${'a'.repeat(64)}`]]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      const result = await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      const now = new Date();
      const diffMonths = (result.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
      expect(diffMonths).toBeGreaterThan(11);
      expect(diffMonths).toBeLessThan(13);
    });

    it('should increment checkCount and set lastCheckAt on each call', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING, checkCount: 5 };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      mockResolveTxt.mockResolvedValue([['unrelated-record']]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      const result = await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(result.checkCount).toBe(6);
      expect(result.lastCheckAt).toBeInstanceOf(Date);
    });

    it('should set lastCheckError on DNS lookup failure', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      const dnsError = new Error('DNS failed') as NodeJS.ErrnoException;
      dnsError.code = 'ENOTFOUND';
      mockResolveTxt.mockRejectedValue(dnsError);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      const result = await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(result.lastCheckError).toContain('No TXT records found');
    });

    it('should return 404 for non-existent domain', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log domain_verified audit event on success', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      mockResolveTxt.mockResolvedValue([[`devos-verification=${'a'.repeat(64)}`]]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_VERIFIED,
        }),
      );
    });

    it('should log domain_verification_failed audit event on failure', async () => {
      const pendingDomain = { ...mockDomain, status: DomainStatus.PENDING };
      mockSsoDomainRepository.findOne.mockResolvedValue(pendingDomain);
      mockResolveTxt.mockResolvedValue([['wrong-record']]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await service.verifyDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_VERIFICATION_FAILED,
        }),
      );
    });
  });

  describe('listDomains', () => {
    it('should return all domains for workspace', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([mockDomain]);

      const result = await service.listDomains(mockWorkspaceId);

      expect(mockSsoDomainRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by status when provided', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([]);

      await service.listDomains(mockWorkspaceId, DomainStatus.VERIFIED);

      expect(mockSsoDomainRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId, status: DomainStatus.VERIFIED },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('getDomain', () => {
    it('should return domain when owned by workspace', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue(mockDomain);

      const result = await service.getDomain(mockWorkspaceId, mockDomainId);

      expect(result).toEqual(mockDomain);
    });

    it('should return 404 when domain belongs to different workspace', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDomain('other-workspace-id', mockDomainId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeDomain', () => {
    it('should delete domain and invalidate cache', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...mockDomain });
      mockSsoDomainRepository.remove.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      await service.removeDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(mockSsoDomainRepository.remove).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalledWith(`${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}acme.com`);
    });

    it('should log domain_removed audit event', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...mockDomain });
      mockSsoDomainRepository.remove.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      await service.removeDomain(mockWorkspaceId, mockDomainId, mockUserId);

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_REMOVED,
        }),
      );
    });
  });

  describe('linkProvider', () => {
    const verifiedDomain = {
      ...mockDomain,
      status: DomainStatus.VERIFIED,
      verifiedAt: new Date(),
    };

    it('should set samlConfigId and clear oidcConfigId for SAML provider', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });
      mockSamlConfigRepository.findOne.mockResolvedValue({ id: mockSamlConfigId, workspaceId: mockWorkspaceId });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));
      mockRedisService.del.mockResolvedValue(undefined);

      const result = await service.linkProvider(mockWorkspaceId, mockDomainId, mockSamlConfigId, null, mockUserId);

      expect(result.samlConfigId).toBe(mockSamlConfigId);
      expect(result.oidcConfigId).toBeNull();
    });

    it('should set oidcConfigId and clear samlConfigId for OIDC provider', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });
      mockOidcConfigRepository.findOne.mockResolvedValue({ id: mockOidcConfigId, workspaceId: mockWorkspaceId });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));
      mockRedisService.del.mockResolvedValue(undefined);

      const result = await service.linkProvider(mockWorkspaceId, mockDomainId, null, mockOidcConfigId, mockUserId);

      expect(result.oidcConfigId).toBe(mockOidcConfigId);
      expect(result.samlConfigId).toBeNull();
    });

    it('should reject when domain is not verified with 422', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...mockDomain, status: DomainStatus.PENDING });

      await expect(
        service.linkProvider(mockWorkspaceId, mockDomainId, mockSamlConfigId, null, mockUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should reject when neither provider is specified with 400', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });

      await expect(
        service.linkProvider(mockWorkspaceId, mockDomainId, null, null, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when both providers are specified with 400', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });

      await expect(
        service.linkProvider(mockWorkspaceId, mockDomainId, mockSamlConfigId, mockOidcConfigId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when provider config does not belong to workspace with 400', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });
      mockSamlConfigRepository.findOne.mockResolvedValue(null); // Not found = doesn't belong

      await expect(
        service.linkProvider(mockWorkspaceId, mockDomainId, mockSamlConfigId, null, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log domain_provider_linked audit event', async () => {
      mockSsoDomainRepository.findOne.mockResolvedValue({ ...verifiedDomain });
      mockSamlConfigRepository.findOne.mockResolvedValue({ id: mockSamlConfigId, workspaceId: mockWorkspaceId });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));
      mockRedisService.del.mockResolvedValue(undefined);

      await service.linkProvider(mockWorkspaceId, mockDomainId, mockSamlConfigId, null, mockUserId);

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_PROVIDER_LINKED,
        }),
      );
    });
  });

  describe('lookupDomain', () => {
    const verifiedDomainWithSaml = {
      ...mockDomain,
      status: DomainStatus.VERIFIED,
      samlConfigId: mockSamlConfigId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };

    it('should return provider info for verified domain with linked provider', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSsoDomainRepository.findOne.mockResolvedValue(verifiedDomainWithSaml);
      mockSamlConfigRepository.findOne.mockResolvedValue({ id: mockSamlConfigId, providerName: 'Okta' });
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.lookupDomain('acme.com');

      expect(result).toBeDefined();
      expect(result!.providerType).toBe('saml');
      expect(result!.providerId).toBe(mockSamlConfigId);
    });

    it('should return null for unverified domain', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSsoDomainRepository.findOne.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.lookupDomain('unknown.com');

      expect(result).toBeNull();
    });

    it('should return null for domain with no linked provider', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSsoDomainRepository.findOne.mockResolvedValue({
        ...mockDomain,
        status: DomainStatus.VERIFIED,
        samlConfigId: null,
        oidcConfigId: null,
      });
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.lookupDomain('acme.com');

      expect(result).toBeNull();
    });

    it('should use Redis cache on subsequent calls', async () => {
      const cachedResult = JSON.stringify({
        domain: 'acme.com',
        providerType: 'saml',
        providerId: mockSamlConfigId,
        workspaceId: mockWorkspaceId,
      });
      mockRedisService.get.mockResolvedValue(cachedResult);

      const result = await service.lookupDomain('acme.com');

      expect(result).toBeDefined();
      expect(result!.providerType).toBe('saml');
      expect(mockSsoDomainRepository.findOne).not.toHaveBeenCalled();
    });

    it('should handle expired domains (returns null)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSsoDomainRepository.findOne.mockResolvedValue({
        ...verifiedDomainWithSaml,
        expiresAt: new Date(Date.now() - 1000), // expired
      });
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.lookupDomain('acme.com');

      expect(result).toBeNull();
    });

    it('should return OIDC provider info when oidcConfigId is linked', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSsoDomainRepository.findOne.mockResolvedValue({
        ...mockDomain,
        status: DomainStatus.VERIFIED,
        samlConfigId: null,
        oidcConfigId: mockOidcConfigId,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
      mockOidcConfigRepository.findOne.mockResolvedValue({
        id: mockOidcConfigId,
        displayName: 'Google',
        providerType: 'google',
      });
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.lookupDomain('acme.com');

      expect(result).toBeDefined();
      expect(result!.providerType).toBe('oidc');
      expect(result!.providerId).toBe(mockOidcConfigId);
    });
  });

  describe('checkDnsVerification', () => {
    const token = 'a'.repeat(64);

    it('should return { verified: true } when TXT record contains token', async () => {
      mockResolveTxt.mockResolvedValue([[`devos-verification=${token}`]]);

      const result = await service.checkDnsVerification('acme.com', token);

      expect(result.verified).toBe(true);
    });

    it('should return { verified: false } when TXT record does not contain token', async () => {
      mockResolveTxt.mockResolvedValue([['some-other-record'], ['v=spf1 include:something']]);

      const result = await service.checkDnsVerification('acme.com', token);

      expect(result.verified).toBe(false);
    });

    it('should handle ENOTFOUND DNS error gracefully', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND') as NodeJS.ErrnoException;
      dnsError.code = 'ENOTFOUND';
      mockResolveTxt.mockRejectedValue(dnsError);

      const result = await service.checkDnsVerification('nonexistent.com', token);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('No TXT records found');
    });

    it('should handle ENODATA DNS error gracefully', async () => {
      const dnsError = new Error('queryTxt ENODATA') as NodeJS.ErrnoException;
      dnsError.code = 'ENODATA';
      mockResolveTxt.mockRejectedValue(dnsError);

      const result = await service.checkDnsVerification('acme.com', token);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('No TXT records found');
    });

    it('should handle generic DNS errors', async () => {
      const dnsError = new Error('Network timeout') as NodeJS.ErrnoException;
      dnsError.code = 'ETIMEOUT';
      mockResolveTxt.mockRejectedValue(dnsError);

      const result = await service.checkDnsVerification('acme.com', token);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('DNS lookup failed');
    });

    it('should handle multi-part TXT records (joined strings)', async () => {
      // TXT records can be split into multiple strings when > 255 chars
      mockResolveTxt.mockResolvedValue([['devos-verification=', token]]);

      const result = await service.checkDnsVerification('acme.com', token);

      expect(result.verified).toBe(true);
    });
  });
});
