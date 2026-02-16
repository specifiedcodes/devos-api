import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SsoEnforcementGuard } from './sso-enforcement.guard';
import { SsoEnforcementService } from './sso-enforcement.service';
import { DomainVerificationService } from '../domain/domain-verification.service';

describe('SsoEnforcementGuard', () => {
  let guard: SsoEnforcementGuard;
  let enforcementService: jest.Mocked<SsoEnforcementService>;
  let domainService: jest.Mocked<DomainVerificationService>;

  const workspaceId = '11111111-1111-1111-1111-111111111111';

  function createMockContext(body: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ body }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoEnforcementGuard,
        {
          provide: SsoEnforcementService,
          useValue: {
            checkLoginEnforcement: jest.fn(),
          },
        },
        {
          provide: DomainVerificationService,
          useValue: {
            lookupDomain: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SsoEnforcementGuard>(SsoEnforcementGuard);
    enforcementService = module.get(SsoEnforcementService) as jest.Mocked<SsoEnforcementService>;
    domainService = module.get(DomainVerificationService) as jest.Mocked<DomainVerificationService>;
  });

  it('should allow login when email has no SSO domain', async () => {
    const context = createMockContext({ email: 'user@nodomain.com' });
    domainService.lookupDomain.mockResolvedValue(null);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow login when workspace has no enforcement', async () => {
    const context = createMockContext({ email: 'user@acme.com' });
    domainService.lookupDomain.mockResolvedValue({
      domain: 'acme.com',
      providerType: 'saml',
      providerId: 'saml-1',
      workspaceId,
    });
    enforcementService.checkLoginEnforcement.mockResolvedValue({
      allowed: true,
      reason: 'not_enforced',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow login when user is bypassed (owner)', async () => {
    const context = createMockContext({ email: 'owner@acme.com' });
    domainService.lookupDomain.mockResolvedValue({
      domain: 'acme.com',
      providerType: 'saml',
      providerId: 'saml-1',
      workspaceId,
    });
    enforcementService.checkLoginEnforcement.mockResolvedValue({
      allowed: true,
      reason: 'bypass_owner',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow login when user is bypassed (email list)', async () => {
    const context = createMockContext({ email: 'bypass@acme.com' });
    domainService.lookupDomain.mockResolvedValue({
      domain: 'acme.com',
      providerType: 'saml',
      providerId: 'saml-1',
      workspaceId,
    });
    enforcementService.checkLoginEnforcement.mockResolvedValue({
      allowed: true,
      reason: 'bypass_email',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow login during grace period', async () => {
    const context = createMockContext({ email: 'user@acme.com' });
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

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should block login with ForbiddenException when enforcement is active', async () => {
    const context = createMockContext({ email: 'user@acme.com' });
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
      ssoProviderHint: 'Okta',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should include enforcement message and SSO redirect hint in error response', async () => {
    const context = createMockContext({ email: 'user@acme.com' });
    domainService.lookupDomain.mockResolvedValue({
      domain: 'acme.com',
      providerType: 'saml',
      providerId: 'saml-1',
      workspaceId,
    });
    enforcementService.checkLoginEnforcement.mockResolvedValue({
      allowed: false,
      reason: 'blocked',
      enforcementMessage: 'SSO required for your org.',
      redirectToSso: true,
      ssoProviderHint: 'Okta',
    });

    try {
      await guard.canActivate(context);
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as any;
      expect(response.message).toBe('SSO required for your org.');
      expect(response.redirectToSso).toBe(true);
      expect(response.ssoProviderHint).toBe('Okta');
    }
  });

  it('should allow login when email is missing (defers to validation)', async () => {
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(domainService.lookupDomain).not.toHaveBeenCalled();
  });

  it('should allow login when email format is invalid (defers to validation)', async () => {
    const context = createMockContext({ email: 'invalid-email' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(domainService.lookupDomain).not.toHaveBeenCalled();
  });
});
