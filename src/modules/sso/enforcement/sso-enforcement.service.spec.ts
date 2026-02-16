import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SsoEnforcementService } from './sso-enforcement.service';
import { SsoEnforcementPolicy } from '../../../database/entities/sso-enforcement-policy.entity';
import { SamlConfiguration } from '../../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../../database/entities/oidc-configuration.entity';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../sso-audit.service';
import { RedisService } from '../../redis/redis.service';
import { DomainVerificationService } from '../domain/domain-verification.service';
import { SSO_ENFORCEMENT_CONSTANTS } from '../constants/enforcement.constants';

describe('SsoEnforcementService', () => {
  let service: SsoEnforcementService;
  let enforcementRepo: jest.Mocked<Repository<SsoEnforcementPolicy>>;
  let samlConfigRepo: jest.Mocked<Repository<SamlConfiguration>>;
  let oidcConfigRepo: jest.Mocked<Repository<OidcConfiguration>>;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let redisService: jest.Mocked<RedisService>;
  let auditService: jest.Mocked<SsoAuditService>;
  let domainService: jest.Mocked<DomainVerificationService>;

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const actorId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';

  const mockPolicy: Partial<SsoEnforcementPolicy> = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    workspaceId,
    enforced: true,
    gracePeriodHours: 72,
    gracePeriodStart: new Date('2026-01-01T00:00:00Z'),
    gracePeriodEnd: new Date('2026-01-04T00:00:00Z'),
    bypassEmails: ['bypass@acme.com'],
    bypassServiceAccounts: true,
    ownerBypassEnabled: true,
    passwordLoginBlocked: false,
    registrationBlocked: true,
    enforcementMessage: 'Please use SSO.',
    enforcedAt: new Date('2026-01-01T00:00:00Z'),
    enforcedBy: actorId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoEnforcementService,
        {
          provide: getRepositoryToken(SsoEnforcementPolicy),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SamlConfiguration),
          useValue: { count: jest.fn() },
        },
        {
          provide: getRepositoryToken(OidcConfiguration),
          useValue: { count: jest.fn() },
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            scanKeys: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SsoAuditService,
          useValue: { logEvent: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: DomainVerificationService,
          useValue: {
            lookupDomain: jest.fn(),
            listDomains: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SsoEnforcementService>(SsoEnforcementService);
    enforcementRepo = module.get(getRepositoryToken(SsoEnforcementPolicy));
    samlConfigRepo = module.get(getRepositoryToken(SamlConfiguration));
    oidcConfigRepo = module.get(getRepositoryToken(OidcConfiguration));
    workspaceRepo = module.get(getRepositoryToken(Workspace));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    auditService = module.get(SsoAuditService) as jest.Mocked<SsoAuditService>;
    domainService = module.get(DomainVerificationService) as jest.Mocked<DomainVerificationService>;
  });

  describe('getEnforcementStatus', () => {
    it('should return non-enforced status for workspace without policy', async () => {
      redisService.get.mockResolvedValue(null);
      enforcementRepo.findOne.mockResolvedValue(null);
      samlConfigRepo.count.mockResolvedValue(0);
      oidcConfigRepo.count.mockResolvedValue(0);

      const result = await service.getEnforcementStatus(workspaceId);

      expect(result.enforced).toBe(false);
      expect(result.passwordLoginBlocked).toBe(false);
      expect(result.registrationBlocked).toBe(false);
      expect(result.inGracePeriod).toBe(false);
      expect(result.activeProviderCount).toBe(0);
    });

    it('should return enforced status with correct fields', async () => {
      redisService.get.mockResolvedValue(null);
      const futureEnd = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: futureEnd,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      const result = await service.getEnforcementStatus(workspaceId);

      expect(result.enforced).toBe(true);
      expect(result.inGracePeriod).toBe(true);
      expect(result.gracePeriodRemainingHours).toBeGreaterThan(0);
      expect(result.activeProviderCount).toBe(1);
    });

    it('should calculate grace period remaining correctly', async () => {
      redisService.get.mockResolvedValue(null);
      const futureEnd = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: futureEnd,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      const result = await service.getEnforcementStatus(workspaceId);

      expect(result.gracePeriodRemainingHours).toBe(48);
    });

    it('should use Redis cache on cache hit', async () => {
      const cachedStatus = {
        workspaceId,
        enforced: true,
        passwordLoginBlocked: true,
        registrationBlocked: true,
        inGracePeriod: false,
        gracePeriodEnd: null,
        gracePeriodRemainingHours: null,
        enforcementMessage: 'Use SSO.',
        activeProviderCount: 2,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedStatus));

      const result = await service.getEnforcementStatus(workspaceId);

      expect(result).toEqual(cachedStatus);
      expect(enforcementRepo.findOne).not.toHaveBeenCalled();
    });

    it('should fall back to PostgreSQL on cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      enforcementRepo.findOne.mockResolvedValue(null);
      samlConfigRepo.count.mockResolvedValue(0);
      oidcConfigRepo.count.mockResolvedValue(0);

      await service.getEnforcementStatus(workspaceId);

      expect(enforcementRepo.findOne).toHaveBeenCalledWith({ where: { workspaceId } });
    });

    it('should determine passwordLoginBlocked correctly when grace period expired', async () => {
      redisService.get.mockResolvedValue(null);
      const pastEnd = new Date(Date.now() - 1000); // already past
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: pastEnd,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      const result = await service.getEnforcementStatus(workspaceId);

      expect(result.passwordLoginBlocked).toBe(true);
      expect(result.inGracePeriod).toBe(false);
    });
  });

  describe('checkLoginEnforcement', () => {
    it('should allow login when not enforced', async () => {
      redisService.get.mockResolvedValue(null);
      enforcementRepo.findOne.mockResolvedValue(null);
      samlConfigRepo.count.mockResolvedValue(0);
      oidcConfigRepo.count.mockResolvedValue(0);

      const result = await service.checkLoginEnforcement('user@acme.com', workspaceId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('not_enforced');
    });

    it('should allow workspace owner when ownerBypassEnabled', async () => {
      redisService.get.mockResolvedValue(null);
      const futureEnd = new Date(Date.now() - 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: futureEnd,
        ownerBypassEnabled: true,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        workspaceId,
        user: { email: 'owner@acme.com' },
      } as any);

      const result = await service.checkLoginEnforcement('owner@acme.com', workspaceId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('bypass_owner');
    });

    it('should block workspace owner when ownerBypassEnabled is false', async () => {
      redisService.get.mockResolvedValue(null);
      const pastEnd = new Date(Date.now() - 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: pastEnd,
        ownerBypassEnabled: false,
        bypassEmails: [],
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        workspaceId,
        user: { email: 'owner@acme.com' },
      } as any);

      domainService.lookupDomain.mockResolvedValue(null);

      const result = await service.checkLoginEnforcement('owner@acme.com', workspaceId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('blocked');
    });

    it('should allow bypassed email', async () => {
      redisService.get.mockResolvedValue(null);
      const pastEnd = new Date(Date.now() - 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: pastEnd,
        bypassEmails: ['bypass@acme.com'],
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        workspaceId,
        user: { email: 'differentowner@acme.com' },
      } as any);

      const result = await service.checkLoginEnforcement('bypass@acme.com', workspaceId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('bypass_email');
    });

    it('should allow during grace period', async () => {
      redisService.get.mockResolvedValue(null);
      const futureEnd = new Date(Date.now() + 48 * 60 * 60 * 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: futureEnd,
        bypassEmails: [],
        ownerBypassEnabled: false,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);

      const result = await service.checkLoginEnforcement('user@acme.com', workspaceId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('grace_period');
    });

    it('should block after grace period expires', async () => {
      redisService.get.mockResolvedValue(null);
      const pastEnd = new Date(Date.now() - 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: pastEnd,
        bypassEmails: [],
        ownerBypassEnabled: false,
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        user: { email: 'differentowner@acme.com' },
      } as any);

      domainService.lookupDomain.mockResolvedValue(null);

      const result = await service.checkLoginEnforcement('user@acme.com', workspaceId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('blocked');
      expect(result.redirectToSso).toBe(true);
    });

    it('should return enforcement message and SSO redirect hint', async () => {
      redisService.get.mockResolvedValue(null);
      const pastEnd = new Date(Date.now() - 1000);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        gracePeriodEnd: pastEnd,
        bypassEmails: [],
        ownerBypassEnabled: false,
        enforcementMessage: 'Custom enforcement message',
      } as SsoEnforcementPolicy);
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        user: { email: 'differentowner@acme.com' },
      } as any);

      domainService.lookupDomain.mockResolvedValue({
        domain: 'acme.com',
        providerType: 'saml',
        providerId: 'saml-id',
        providerName: 'Okta',
        workspaceId,
      });

      const result = await service.checkLoginEnforcement('user@acme.com', workspaceId);

      expect(result.allowed).toBe(false);
      expect(result.enforcementMessage).toBe('Custom enforcement message');
      expect(result.ssoProviderHint).toBe('Okta');
    });
  });

  describe('enableEnforcement', () => {
    it('should reject when no active SSO provider exists', async () => {
      samlConfigRepo.count.mockResolvedValue(0);
      oidcConfigRepo.count.mockResolvedValue(0);

      await expect(
        service.enableEnforcement({ workspaceId, actorId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when no verified domain exists', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([]);

      await expect(
        service.enableEnforcement({ workspaceId, actorId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create policy with correct grace period calculation', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([{ id: 'domain-1' } as any]);
      enforcementRepo.findOne.mockResolvedValue(null);
      enforcementRepo.create.mockReturnValue({} as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.enableEnforcement({
        workspaceId,
        actorId,
        gracePeriodHours: 48,
      });

      expect(result.enforced).toBe(true);
      expect(result.gracePeriodHours).toBe(48);
      expect(result.passwordLoginBlocked).toBe(false);
      expect(result.registrationBlocked).toBe(true);
    });

    it('should immediately block with 0 grace period', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([{ id: 'domain-1' } as any]);
      enforcementRepo.findOne.mockResolvedValue(null);
      enforcementRepo.create.mockReturnValue({} as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.enableEnforcement({
        workspaceId,
        actorId,
        gracePeriodHours: 0,
      });

      expect(result.passwordLoginBlocked).toBe(true);
      expect(result.gracePeriodEnd).toBeNull();
    });

    it('should leave password login open during non-zero grace period', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([{ id: 'domain-1' } as any]);
      enforcementRepo.findOne.mockResolvedValue(null);
      enforcementRepo.create.mockReturnValue({} as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.enableEnforcement({
        workspaceId,
        actorId,
        gracePeriodHours: 72,
      });

      expect(result.passwordLoginBlocked).toBe(false);
      expect(result.gracePeriodEnd).not.toBeNull();
    });

    it('should log audit event', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([{ id: 'domain-1' } as any]);
      enforcementRepo.findOne.mockResolvedValue(null);
      enforcementRepo.create.mockReturnValue({} as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      await service.enableEnforcement({ workspaceId, actorId });

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          eventType: 'enforcement_enabled',
          actorId,
        }),
      );
    });

    it('should invalidate Redis cache', async () => {
      samlConfigRepo.count.mockResolvedValue(1);
      oidcConfigRepo.count.mockResolvedValue(0);
      domainService.listDomains.mockResolvedValue([{ id: 'domain-1' } as any]);
      enforcementRepo.findOne.mockResolvedValue(null);
      enforcementRepo.create.mockReturnValue({} as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      await service.enableEnforcement({ workspaceId, actorId });

      expect(redisService.del).toHaveBeenCalledWith(
        `${SSO_ENFORCEMENT_CONSTANTS.REDIS_ENFORCEMENT_PREFIX}${workspaceId}`,
      );
    });
  });

  describe('disableEnforcement', () => {
    it('should reset all enforcement fields', async () => {
      enforcementRepo.findOne.mockResolvedValue({ ...mockPolicy } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.disableEnforcement({ workspaceId, actorId });

      expect(result.enforced).toBe(false);
      expect(result.passwordLoginBlocked).toBe(false);
      expect(result.registrationBlocked).toBe(false);
      expect(result.gracePeriodStart).toBeNull();
      expect(result.gracePeriodEnd).toBeNull();
    });

    it('should throw NotFoundException when no policy exists', async () => {
      enforcementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.disableEnforcement({ workspaceId, actorId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit event', async () => {
      enforcementRepo.findOne.mockResolvedValue({ ...mockPolicy } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      await service.disableEnforcement({ workspaceId, actorId });

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'enforcement_disabled',
        }),
      );
    });
  });

  describe('updateEnforcement', () => {
    it('should apply partial updates', async () => {
      enforcementRepo.findOne.mockResolvedValue({ ...mockPolicy } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.updateEnforcement({
        workspaceId,
        actorId,
        ownerBypassEnabled: false,
      });

      expect(result.ownerBypassEnabled).toBe(false);
    });

    it('should reject bypass list exceeding 50 emails', async () => {
      enforcementRepo.findOne.mockResolvedValue({ ...mockPolicy } as SsoEnforcementPolicy);

      const tooManyEmails = Array.from({ length: 51 }, (_, i) => `user${i}@acme.com`);

      await expect(
        service.updateEnforcement({
          workspaceId,
          actorId,
          bypassEmails: tooManyEmails,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when no policy exists', async () => {
      enforcementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateEnforcement({
          workspaceId,
          actorId,
          ownerBypassEnabled: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processGracePeriodExpiry', () => {
    it('should transition policies to fully enforced via batch update', async () => {
      const expiredPolicies = [
        { ...mockPolicy, id: 'policy-1', passwordLoginBlocked: false } as SsoEnforcementPolicy,
      ];
      enforcementRepo.find.mockResolvedValue(expiredPolicies);
      enforcementRepo.update.mockResolvedValue({ affected: 1 } as any);
      redisService.del.mockResolvedValue();

      const count = await service.processGracePeriodExpiry();

      expect(count).toBe(1);
      expect(enforcementRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.anything() }),
        { passwordLoginBlocked: true },
      );
    });

    it('should return 0 when no policies need transitioning', async () => {
      enforcementRepo.find.mockResolvedValue([]);

      const count = await service.processGracePeriodExpiry();

      expect(count).toBe(0);
      expect(enforcementRepo.update).not.toHaveBeenCalled();
    });

    it('should invalidate cache for each transitioned workspace', async () => {
      const expiredPolicies = [
        { ...mockPolicy, id: 'policy-1', workspaceId: 'ws-1' } as SsoEnforcementPolicy,
        { ...mockPolicy, id: 'policy-2', workspaceId: 'ws-2' } as SsoEnforcementPolicy,
      ];
      enforcementRepo.find.mockResolvedValue(expiredPolicies);
      enforcementRepo.update.mockResolvedValue({ affected: 2 } as any);
      redisService.del.mockResolvedValue();

      await service.processGracePeriodExpiry();

      // Each workspace gets enforcement key deleted + scanKeys call for bypass keys
      expect(redisService.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('addBypassEmail', () => {
    it('should add email to bypass list', async () => {
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: [],
      } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.addBypassEmail(workspaceId, 'new@acme.com', actorId);

      expect(result).toContain('new@acme.com');
    });

    it('should prevent duplicates', async () => {
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: ['existing@acme.com'],
      } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.addBypassEmail(workspaceId, 'existing@acme.com', actorId);

      expect(result.filter(e => e === 'existing@acme.com')).toHaveLength(1);
    });

    it('should enforce max bypass limit', async () => {
      const maxEmails = Array.from({ length: 50 }, (_, i) => `user${i}@acme.com`);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: maxEmails,
      } as SsoEnforcementPolicy);

      await expect(
        service.addBypassEmail(workspaceId, 'overflow@acme.com', actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when no policy exists', async () => {
      enforcementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addBypassEmail(workspaceId, 'test@acme.com', actorId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeBypassEmail', () => {
    it('should remove email from bypass list', async () => {
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: ['keep@acme.com', 'remove@acme.com'],
      } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      const result = await service.removeBypassEmail(workspaceId, 'remove@acme.com', actorId);

      expect(result).toEqual(['keep@acme.com']);
    });

    it('should log audit event', async () => {
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: ['remove@acme.com'],
      } as SsoEnforcementPolicy);
      enforcementRepo.save.mockImplementation(async (p) => p as SsoEnforcementPolicy);
      redisService.del.mockResolvedValue();

      await service.removeBypassEmail(workspaceId, 'remove@acme.com', actorId);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'enforcement_bypass_removed',
        }),
      );
    });
  });

  describe('isUserBypassed', () => {
    it('should return true from cache when cached as true', async () => {
      redisService.get.mockResolvedValue('true');

      const result = await service.isUserBypassed(workspaceId, 'user@acme.com');

      expect(result).toBe(true);
      expect(enforcementRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return false from cache when cached as false', async () => {
      redisService.get.mockResolvedValue('false');

      const result = await service.isUserBypassed(workspaceId, 'user@acme.com');

      expect(result).toBe(false);
    });

    it('should check owner, email list on cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: ['bypassed@acme.com'],
        ownerBypassEnabled: true,
      } as SsoEnforcementPolicy);

      workspaceRepo.findOne.mockResolvedValue({ id: workspaceId, ownerUserId: ownerId } as Workspace);
      memberRepo.findOne.mockResolvedValue({
        userId: ownerId,
        user: { email: 'owner@acme.com' },
      } as any);

      const result = await service.isUserBypassed(workspaceId, 'bypassed@acme.com');

      expect(result).toBe(true);
    });

    it('should return true when enforcement not active', async () => {
      redisService.get.mockResolvedValue(null);
      enforcementRepo.findOne.mockResolvedValue(null);

      const result = await service.isUserBypassed(workspaceId, 'user@acme.com');

      expect(result).toBe(true);
    });
  });

  describe('getBypassList', () => {
    it('should return empty array when no policy exists', async () => {
      enforcementRepo.findOne.mockResolvedValue(null);

      const result = await service.getBypassList(workspaceId);

      expect(result).toEqual([]);
    });

    it('should return bypass emails from policy', async () => {
      enforcementRepo.findOne.mockResolvedValue({
        ...mockPolicy,
        bypassEmails: ['a@acme.com', 'b@acme.com'],
      } as SsoEnforcementPolicy);

      const result = await service.getBypassList(workspaceId);

      expect(result).toEqual(['a@acme.com', 'b@acme.com']);
    });
  });
});
