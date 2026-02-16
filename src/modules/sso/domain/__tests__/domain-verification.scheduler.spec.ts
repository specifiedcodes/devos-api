import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainVerificationScheduler } from '../domain-verification.scheduler';
import { DomainVerificationService } from '../domain-verification.service';
import { SsoDomain, DomainStatus, DomainVerificationMethod } from '../../../../database/entities/sso-domain.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../../redis/redis.service';
import { DOMAIN_CONSTANTS } from '../../constants/domain.constants';

describe('DomainVerificationScheduler', () => {
  let scheduler: DomainVerificationScheduler;

  const mockQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockSsoDomainRepository = {
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockDomainVerificationService = {
    checkDnsVerification: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockRedisService = {
    del: jest.fn(),
  };

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const mockDomainId = '550e8400-e29b-41d4-a716-446655440002';

  const createMockDomain = (overrides: Partial<SsoDomain> = {}): SsoDomain => ({
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
    createdBy: '550e8400-e29b-41d4-a716-446655440001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainVerificationScheduler,
        {
          provide: getRepositoryToken(SsoDomain),
          useValue: mockSsoDomainRepository,
        },
        {
          provide: DomainVerificationService,
          useValue: mockDomainVerificationService,
        },
        {
          provide: SsoAuditService,
          useValue: mockSsoAuditService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    scheduler = module.get<DomainVerificationScheduler>(DomainVerificationScheduler);
  });

  describe('checkPendingVerifications', () => {
    it('should query only pending non-expired domains', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([]);

      await scheduler.checkPendingVerifications();

      expect(mockSsoDomainRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: DomainStatus.PENDING,
          }),
        }),
      );
    });

    it('should call checkDnsVerification for each pending domain', async () => {
      const domain1 = createMockDomain({ id: 'domain-1', domain: 'acme.com' });
      const domain2 = createMockDomain({ id: 'domain-2', domain: 'corp.com' });
      mockSsoDomainRepository.find.mockResolvedValue([domain1, domain2]);
      mockDomainVerificationService.checkDnsVerification.mockResolvedValue({ verified: false });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.checkPendingVerifications();

      expect(mockDomainVerificationService.checkDnsVerification).toHaveBeenCalledTimes(2);
    });

    it('should update domain to verified when DNS check succeeds', async () => {
      const domain = createMockDomain();
      mockSsoDomainRepository.find.mockResolvedValue([domain]);
      mockDomainVerificationService.checkDnsVerification.mockResolvedValue({ verified: true });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.checkPendingVerifications();

      expect(mockSsoDomainRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DomainStatus.VERIFIED,
          verifiedAt: expect.any(Date),
        }),
      );
    });

    it('should not update domain when DNS check fails', async () => {
      const domain = createMockDomain();
      mockSsoDomainRepository.find.mockResolvedValue([domain]);
      mockDomainVerificationService.checkDnsVerification.mockResolvedValue({ verified: false, error: 'No TXT records' });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.checkPendingVerifications();

      expect(mockSsoDomainRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DomainStatus.PENDING,
          lastCheckError: 'No TXT records',
        }),
      );
    });

    it('should handle empty pending list gracefully', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([]);

      await scheduler.checkPendingVerifications();

      expect(mockDomainVerificationService.checkDnsVerification).not.toHaveBeenCalled();
    });

    it('should increment checkCount for each checked domain', async () => {
      const domain = createMockDomain({ checkCount: 3 });
      mockSsoDomainRepository.find.mockResolvedValue([domain]);
      mockDomainVerificationService.checkDnsVerification.mockResolvedValue({ verified: false });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.checkPendingVerifications();

      expect(mockSsoDomainRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          checkCount: 4,
        }),
      );
    });

    it('should log domain_verified audit event on successful verification', async () => {
      const domain = createMockDomain();
      mockSsoDomainRepository.find.mockResolvedValue([domain]);
      mockDomainVerificationService.checkDnsVerification.mockResolvedValue({ verified: true });
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.checkPendingVerifications();

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_VERIFIED,
        }),
      );
    });
  });

  describe('expireStaleDomains', () => {
    it('should mark pending domains past expiresAt as expired via batch update', async () => {
      const staleDomain = createMockDomain({
        status: DomainStatus.PENDING,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
      });
      mockSsoDomainRepository.find.mockResolvedValue([staleDomain]);

      await scheduler.expireStaleDomains();

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ status: DomainStatus.EXPIRED });
      expect(mockQueryBuilder.whereInIds).toHaveBeenCalledWith([staleDomain.id]);
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should not affect verified domains', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([]);

      await scheduler.expireStaleDomains();

      // The query should have status: PENDING filter
      expect(mockSsoDomainRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: DomainStatus.PENDING,
          }),
        }),
      );
    });

    it('should log audit events for each expired domain', async () => {
      const staleDomain = createMockDomain({
        status: DomainStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSsoDomainRepository.find.mockResolvedValue([staleDomain]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));

      await scheduler.expireStaleDomains();

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_EXPIRED,
          details: expect.objectContaining({ reason: 'pending_timeout' }),
        }),
      );
    });
  });

  describe('checkVerifiedExpiry', () => {
    it('should mark verified domains past expiresAt as expired via batch update', async () => {
      const expiredDomain = createMockDomain({
        status: DomainStatus.VERIFIED,
        verifiedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSsoDomainRepository.find.mockResolvedValue([expiredDomain]);
      mockRedisService.del.mockResolvedValue(undefined);

      await scheduler.checkVerifiedExpiry();

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ status: DomainStatus.EXPIRED });
      expect(mockQueryBuilder.whereInIds).toHaveBeenCalledWith([expiredDomain.id]);
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should invalidate Redis cache for expired domains', async () => {
      const expiredDomain = createMockDomain({
        status: DomainStatus.VERIFIED,
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSsoDomainRepository.find.mockResolvedValue([expiredDomain]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));
      mockRedisService.del.mockResolvedValue(undefined);

      await scheduler.checkVerifiedExpiry();

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}acme.com`,
      );
    });

    it('should not affect pending domains', async () => {
      mockSsoDomainRepository.find.mockResolvedValue([]);

      await scheduler.checkVerifiedExpiry();

      expect(mockSsoDomainRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: DomainStatus.VERIFIED,
          }),
        }),
      );
    });

    it('should log audit events with reverification_timeout reason', async () => {
      const expiredDomain = createMockDomain({
        status: DomainStatus.VERIFIED,
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSsoDomainRepository.find.mockResolvedValue([expiredDomain]);
      mockSsoDomainRepository.save.mockImplementation((d) => Promise.resolve(d));
      mockRedisService.del.mockResolvedValue(undefined);

      await scheduler.checkVerifiedExpiry();

      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.DOMAIN_EXPIRED,
          details: expect.objectContaining({ reason: 'reverification_timeout' }),
        }),
      );
    });
  });
});
