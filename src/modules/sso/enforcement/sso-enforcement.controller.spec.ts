import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SsoEnforcementController } from './sso-enforcement.controller';
import { SsoEnforcementService } from './sso-enforcement.service';
import { DomainVerificationService } from '../domain/domain-verification.service';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';

describe('SsoEnforcementController', () => {
  let controller: SsoEnforcementController;
  let enforcementService: jest.Mocked<SsoEnforcementService>;
  let domainService: jest.Mocked<DomainVerificationService>;
  let memberRepo: { findOne: jest.Mock };

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  const mockReq = (uid: string = userId) => ({
    user: { id: uid, sub: uid },
  } as any);

  const mockEnforcementStatus = {
    workspaceId,
    enforced: false,
    passwordLoginBlocked: false,
    registrationBlocked: false,
    inGracePeriod: false,
    gracePeriodEnd: null,
    gracePeriodRemainingHours: null,
    enforcementMessage: 'Your organization requires SSO login.',
    activeProviderCount: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SsoEnforcementController],
      providers: [
        {
          provide: SsoEnforcementService,
          useValue: {
            getEnforcementStatus: jest.fn().mockResolvedValue(mockEnforcementStatus),
            getPolicy: jest.fn().mockResolvedValue(null),
            enableEnforcement: jest.fn().mockResolvedValue({}),
            disableEnforcement: jest.fn().mockResolvedValue({}),
            updateEnforcement: jest.fn().mockResolvedValue({}),
            getBypassList: jest.fn().mockResolvedValue([]),
            addBypassEmail: jest.fn().mockResolvedValue(['test@acme.com']),
            removeBypassEmail: jest.fn().mockResolvedValue([]),
            checkLoginEnforcement: jest.fn(),
          },
        },
        {
          provide: DomainVerificationService,
          useValue: {
            lookupDomain: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SsoEnforcementController>(SsoEnforcementController);
    enforcementService = module.get(SsoEnforcementService) as jest.Mocked<SsoEnforcementService>;
    domainService = module.get(DomainVerificationService) as jest.Mocked<DomainVerificationService>;
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
  });

  describe('GET enforcement status', () => {
    it('should return correct status for admin', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);

      const result = await controller.getEnforcementStatus(workspaceId, mockReq());

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.enforced).toBe(false);
    });

    it('should reject non-admin users', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER } as any);

      await expect(
        controller.getEnforcementStatus(workspaceId, mockReq()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject when user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.getEnforcementStatus(workspaceId, mockReq()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST enable enforcement', () => {
    it('should create policy with grace period', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.OWNER } as any);
      enforcementService.getEnforcementStatus.mockResolvedValue({
        ...mockEnforcementStatus,
        enforced: true,
        inGracePeriod: true,
      });

      const result = await controller.enableEnforcement(
        workspaceId,
        { gracePeriodHours: 48 },
        mockReq(),
      );

      expect(enforcementService.enableEnforcement).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          actorId: userId,
          gracePeriodHours: 48,
        }),
      );
      expect(result.enforced).toBe(true);
    });

    it('should reject when no SSO provider configured', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.enableEnforcement.mockRejectedValue(
        new BadRequestException('At least one active SSO provider must be configured'),
      );

      await expect(
        controller.enableEnforcement(workspaceId, {}, mockReq()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-admin users', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.VIEWER } as any);

      await expect(
        controller.enableEnforcement(workspaceId, {}, mockReq()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST disable enforcement', () => {
    it('should reset enforcement', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.getEnforcementStatus.mockResolvedValue({
        ...mockEnforcementStatus,
        enforced: false,
      });

      const result = await controller.disableEnforcement(workspaceId, mockReq());

      expect(enforcementService.disableEnforcement).toHaveBeenCalledWith({
        workspaceId,
        actorId: userId,
      });
      expect(result.enforced).toBe(false);
    });

    it('should reject non-admin users', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER } as any);

      await expect(
        controller.disableEnforcement(workspaceId, mockReq()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate NotFoundException when no policy exists', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.disableEnforcement.mockRejectedValue(
        new NotFoundException('No enforcement policy found'),
      );

      await expect(
        controller.disableEnforcement(workspaceId, mockReq()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT update enforcement', () => {
    it('should apply partial changes', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);

      await controller.updateEnforcement(
        workspaceId,
        { ownerBypassEnabled: false },
        mockReq(),
      );

      expect(enforcementService.updateEnforcement).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          ownerBypassEnabled: false,
        }),
      );
    });

    it('should reject non-admin users', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.VIEWER } as any);

      await expect(
        controller.updateEnforcement(workspaceId, {}, mockReq()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate validation errors for bypass email limit', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.updateEnforcement.mockRejectedValue(
        new BadRequestException('Maximum 50 bypass emails allowed'),
      );

      await expect(
        controller.updateEnforcement(
          workspaceId,
          { bypassEmails: Array.from({ length: 51 }, (_, i) => `user${i}@acme.com`) },
          mockReq(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET bypass list', () => {
    it('should return emails', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.getBypassList.mockResolvedValue(['a@acme.com', 'b@acme.com']);

      const result = await controller.getBypassList(workspaceId, mockReq());

      expect(result.emails).toEqual(['a@acme.com', 'b@acme.com']);
    });
  });

  describe('POST add bypass email', () => {
    it('should succeed', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.addBypassEmail.mockResolvedValue(['new@acme.com']);

      const result = await controller.addBypassEmail(
        workspaceId,
        { email: 'new@acme.com' },
        mockReq(),
      );

      expect(result.emails).toEqual(['new@acme.com']);
    });

    it('should reject when at max limit', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.addBypassEmail.mockRejectedValue(
        new BadRequestException('Maximum 50 bypass emails allowed'),
      );

      await expect(
        controller.addBypassEmail(workspaceId, { email: 'overflow@acme.com' }, mockReq()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('DELETE bypass email', () => {
    it('should remove email', async () => {
      memberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      enforcementService.removeBypassEmail.mockResolvedValue([]);

      const result = await controller.removeBypassEmail(
        workspaceId,
        'remove@acme.com',
        mockReq(),
      );

      expect(result.emails).toEqual([]);
    });
  });

  describe('POST enforcement check (public)', () => {
    it('should return not_enforced for non-SSO domain', async () => {
      domainService.lookupDomain.mockResolvedValue(null);

      const result = await controller.checkEnforcement({
        email: 'user@unknown.com',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('not_enforced');
    });

    it('should return blocked for enforced workspace', async () => {
      domainService.lookupDomain.mockResolvedValue({
        domain: 'acme.com',
        providerType: 'saml',
        providerId: 'saml-1',
        workspaceId,
      });
      enforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: false,
        reason: 'blocked',
        enforcementMessage: 'SSO required.',
        redirectToSso: true,
      });

      const result = await controller.checkEnforcement({
        email: 'user@acme.com',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('blocked');
    });

    it('should return allowed during grace period', async () => {
      domainService.lookupDomain.mockResolvedValue({
        domain: 'acme.com',
        providerType: 'saml',
        providerId: 'saml-1',
        workspaceId,
      });
      enforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: true,
        reason: 'grace_period',
      });

      const result = await controller.checkEnforcement({
        email: 'user@acme.com',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('grace_period');
    });

    it('should use workspaceId when provided', async () => {
      enforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: true,
        reason: 'not_enforced',
      });

      const result = await controller.checkEnforcement({
        email: 'user@acme.com',
        workspaceId,
      });

      expect(result.allowed).toBe(true);
      expect(domainService.lookupDomain).not.toHaveBeenCalled();
    });

    it('should handle invalid email gracefully', async () => {
      const result = await controller.checkEnforcement({
        email: 'invalid',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('not_enforced');
    });
  });
});
