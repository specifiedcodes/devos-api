/**
 * SSO Enforcement Policies E2E Tests
 * Tests SSO enforcement, grace periods, bypass exceptions, and cross-service enforcement.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SsoEnforcementController } from '../../enforcement/sso-enforcement.controller';
import { SsoEnforcementService } from '../../enforcement/sso-enforcement.service';
import { SsoEnforcementGuard } from '../../enforcement/sso-enforcement.guard';
import { SsoEnforcementScheduler } from '../../enforcement/sso-enforcement.scheduler';
import { DomainVerificationService } from '../../domain/domain-verification.service';
import { WorkspaceMember } from '../../../../database/entities/workspace-member.entity';
import {
  MOCK_ENFORCEMENT_CONFIG,
  createTestWorkspaceId,
  createTestUserId,
  createMockWorkspaceMemberRepository,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('SSO Enforcement E2E Tests', () => {
  let controller: SsoEnforcementController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();

  const mockEnforcementService = {
    enableEnforcement: jest.fn(),
    disableEnforcement: jest.fn(),
    updateEnforcement: jest.fn(),
    getEnforcementStatus: jest.fn(),
    getPolicy: jest.fn(),
    checkLoginEnforcement: jest.fn(),
    getBypassList: jest.fn(),
    addBypassEmail: jest.fn(),
    removeBypassEmail: jest.fn(),
  };

  const mockDomainService = {
    lookupDomain: jest.fn(),
  };

  const mockMemberRepo = createMockWorkspaceMemberRepository('admin');

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  const mockEnforcementStatus = {
    workspaceId,
    enforced: true,
    passwordLoginBlocked: true,
    registrationBlocked: false,
    inGracePeriod: false,
    gracePeriodEnd: null,
    gracePeriodRemainingHours: null,
    enforcementMessage: 'SSO login is required',
    activeProviderCount: 1,
  };

  const mockPolicy = {
    bypassEmails: ['emergency@test-corp.com'],
    ownerBypassEnabled: true,
    bypassServiceAccounts: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SsoEnforcementController],
      providers: [
        { provide: SsoEnforcementService, useValue: mockEnforcementService },
        { provide: DomainVerificationService, useValue: mockDomainService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
      ],
    }).compile();

    controller = module.get<SsoEnforcementController>(SsoEnforcementController);
  });

  // ==================== Enforcement Configuration E2E ====================

  describe('Enforcement Configuration E2E', () => {
    it('should get enforcement status for workspace', async () => {
      mockEnforcementService.getEnforcementStatus.mockResolvedValue(mockEnforcementStatus);
      mockEnforcementService.getPolicy.mockResolvedValue(mockPolicy);

      const result = await controller.getEnforcementStatus(workspaceId, mockReq);

      expect(result).toBeDefined();
      expect(result.enforced).toBe(true);
      expect(result.workspaceId).toBe(workspaceId);
    });

    it('should enable enforcement with grace period', async () => {
      mockEnforcementService.enableEnforcement.mockResolvedValue(undefined);
      mockEnforcementService.getEnforcementStatus.mockResolvedValue({
        ...mockEnforcementStatus,
        inGracePeriod: true,
        gracePeriodRemainingHours: 72,
      });
      mockEnforcementService.getPolicy.mockResolvedValue(mockPolicy);

      const result = await controller.enableEnforcement(
        workspaceId,
        {
          gracePeriodHours: MOCK_ENFORCEMENT_CONFIG.gracePeriodHours,
          bypassEmails: MOCK_ENFORCEMENT_CONFIG.bypassEmails,
        } as any,
        mockReq,
      );

      expect(result.inGracePeriod).toBe(true);
      expect(mockEnforcementService.enableEnforcement).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          actorId: userId,
          gracePeriodHours: 72,
        }),
      );
    });

    it('should disable enforcement', async () => {
      mockEnforcementService.disableEnforcement.mockResolvedValue(undefined);
      mockEnforcementService.getEnforcementStatus.mockResolvedValue({
        ...mockEnforcementStatus,
        enforced: false,
        passwordLoginBlocked: false,
      });
      mockEnforcementService.getPolicy.mockResolvedValue(null);

      const result = await controller.disableEnforcement(workspaceId, mockReq);

      expect(result.enforced).toBe(false);
    });

    it('should update enforcement settings', async () => {
      mockEnforcementService.updateEnforcement.mockResolvedValue(undefined);
      mockEnforcementService.getEnforcementStatus.mockResolvedValue(mockEnforcementStatus);
      mockEnforcementService.getPolicy.mockResolvedValue({
        ...mockPolicy,
        enforcementMessage: 'Updated message',
      });

      const result = await controller.updateEnforcement(
        workspaceId,
        { enforcementMessage: 'Updated message' } as any,
        mockReq,
      );

      expect(result).toBeDefined();
    });
  });

  // ==================== Enforcement Check E2E ====================

  describe('Enforcement Check E2E', () => {
    it('should block password login for enforced workspace', async () => {
      mockEnforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: false,
        reason: 'sso_required',
        enforcementMessage: 'SSO login is required',
        redirectToSso: true,
        ssoProviderHint: 'saml',
      });
      mockDomainService.lookupDomain.mockResolvedValue({
        workspaceId,
        domain: 'test-corp.com',
      });

      const result = await controller.checkEnforcement({
        email: 'user@test-corp.com',
      } as any);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('sso_required');
      expect(result.redirectToSso).toBe(true);
    });

    it('should allow SSO login for enforced workspace', async () => {
      mockEnforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: true,
        reason: 'sso_login',
      });
      mockDomainService.lookupDomain.mockResolvedValue({ workspaceId });

      const result = await controller.checkEnforcement({
        email: 'user@test-corp.com',
      } as any);

      expect(result.allowed).toBe(true);
    });

    it('should allow login for non-enforced domain', async () => {
      mockDomainService.lookupDomain.mockResolvedValue(null);

      const result = await controller.checkEnforcement({
        email: 'user@notenforced.com',
      } as any);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('not_enforced');
    });

    it('should handle invalid email format', async () => {
      const result = await controller.checkEnforcement({
        email: 'invalid',
      } as any);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('not_enforced');
    });

    it('should use workspaceId directly if provided', async () => {
      mockEnforcementService.checkLoginEnforcement.mockResolvedValue({
        allowed: false,
        reason: 'sso_required',
      });

      await controller.checkEnforcement({
        email: 'user@test-corp.com',
        workspaceId,
      } as any);

      expect(mockEnforcementService.checkLoginEnforcement).toHaveBeenCalledWith(
        'user@test-corp.com',
        workspaceId,
      );
    });
  });

  // ==================== Grace Period E2E ====================

  describe('Grace Period E2E', () => {
    it('should show grace period info when enforcement is in grace', async () => {
      mockEnforcementService.getEnforcementStatus.mockResolvedValue({
        ...mockEnforcementStatus,
        enforced: true,
        passwordLoginBlocked: false,
        inGracePeriod: true,
        gracePeriodEnd: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        gracePeriodRemainingHours: 72,
      });
      mockEnforcementService.getPolicy.mockResolvedValue(mockPolicy);

      const result = await controller.getEnforcementStatus(workspaceId, mockReq);

      expect(result.inGracePeriod).toBe(true);
      expect(result.gracePeriodRemainingHours).toBe(72);
    });

    it('should verify enforcement scheduler exists', () => {
      expect(SsoEnforcementScheduler).toBeDefined();
    });
  });

  // ==================== Bypass List E2E ====================

  describe('Bypass List E2E', () => {
    it('should get bypass email list', async () => {
      mockEnforcementService.getBypassList.mockResolvedValue(['emergency@test-corp.com']);

      const result = await controller.getBypassList(workspaceId, mockReq);

      expect(result.emails).toContain('emergency@test-corp.com');
    });

    it('should add email to bypass list', async () => {
      mockEnforcementService.addBypassEmail.mockResolvedValue([
        'emergency@test-corp.com',
        'contractor@test-corp.com',
      ]);

      const result = await controller.addBypassEmail(
        workspaceId,
        { email: 'contractor@test-corp.com' } as any,
        mockReq,
      );

      expect(result.emails).toHaveLength(2);
      expect(result.emails).toContain('contractor@test-corp.com');
    });

    it('should remove email from bypass list', async () => {
      mockEnforcementService.removeBypassEmail.mockResolvedValue([]);

      const result = await controller.removeBypassEmail(
        workspaceId,
        'emergency@test-corp.com',
        mockReq,
      );

      expect(result.emails).toHaveLength(0);
    });

    it('should reject invalid email format on remove', async () => {
      await expect(
        controller.removeBypassEmail(workspaceId, 'not-an-email', mockReq),
      ).rejects.toThrow();
    });

    it('should handle URL-encoded email on remove', async () => {
      mockEnforcementService.removeBypassEmail.mockResolvedValue([]);

      const result = await controller.removeBypassEmail(
        workspaceId,
        'user%40test-corp.com',
        mockReq,
      );

      expect(mockEnforcementService.removeBypassEmail).toHaveBeenCalledWith(
        workspaceId,
        'user@test-corp.com',
        userId,
      );
    });
  });

  // ==================== Cross-Service Enforcement E2E ====================

  describe('Cross-Service Enforcement E2E', () => {
    it('should verify SsoEnforcementGuard exists', () => {
      expect(SsoEnforcementGuard).toBeDefined();
    });

    it('should verify enforcement status response includes all fields', async () => {
      mockEnforcementService.getEnforcementStatus.mockResolvedValue(mockEnforcementStatus);
      mockEnforcementService.getPolicy.mockResolvedValue(mockPolicy);

      const result = await controller.getEnforcementStatus(workspaceId, mockReq);

      expect(result).toHaveProperty('workspaceId');
      expect(result).toHaveProperty('enforced');
      expect(result).toHaveProperty('passwordLoginBlocked');
      expect(result).toHaveProperty('inGracePeriod');
      expect(result).toHaveProperty('activeProviderCount');
      expect(result).toHaveProperty('bypassEmails');
      expect(result).toHaveProperty('ownerBypassEnabled');
    });
  });
});
