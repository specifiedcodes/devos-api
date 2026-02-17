/**
 * Domain Verification Lifecycle E2E Tests
 * Tests domain registration, verification, auto-routing, lifecycle, and provider linking.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DomainController } from '../../domain/domain.controller';
import { DomainVerificationService } from '../../domain/domain-verification.service';
import { SsoAuditService } from '../../sso-audit.service';
import {
  MOCK_DOMAIN,
  MOCK_SECONDARY_DOMAIN,
  createTestWorkspaceId,
  createTestUserId,
  createMockAuditService,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('Domain Verification E2E Tests', () => {
  let controller: DomainController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const domainId = createTestUuid(30);

  const mockDomainService = {
    registerDomain: jest.fn(),
    verifyDomain: jest.fn(),
    listDomains: jest.fn(),
    getDomain: jest.fn(),
    lookupDomain: jest.fn(),
    linkProvider: jest.fn(),
    removeDomain: jest.fn(),
  };

  const mockAuditService = createMockAuditService();

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  const createDomainEntity = (overrides: any = {}) => ({
    id: domainId,
    workspaceId,
    domain: MOCK_DOMAIN.domain,
    verificationMethod: 'dns',
    verificationToken: MOCK_DOMAIN.verificationToken,
    status: 'pending',
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastCheckAt: null,
    lastCheckError: null,
    checkCount: 0,
    samlConfigId: null,
    oidcConfigId: null,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainController],
      providers: [
        { provide: DomainVerificationService, useValue: mockDomainService },
        { provide: SsoAuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<DomainController>(DomainController);
  });

  // ==================== Domain Registration E2E ====================

  describe('Domain Registration E2E', () => {
    it('should register a domain and return verification token', async () => {
      const entity = createDomainEntity();
      mockDomainService.registerDomain.mockResolvedValue(entity);

      const result = await controller.registerDomain(
        workspaceId,
        { domain: MOCK_DOMAIN.domain } as any,
        mockReq,
      );

      expect(result).toBeDefined();
      expect(result.domain).toBe(MOCK_DOMAIN.domain);
      expect(result.verificationToken).toBeDefined();
      expect(mockDomainService.registerDomain).toHaveBeenCalledWith(
        workspaceId,
        MOCK_DOMAIN.domain,
        userId,
      );
    });

    it('should create domain with pending status', async () => {
      const entity = createDomainEntity({ status: 'pending' });
      mockDomainService.registerDomain.mockResolvedValue(entity);

      const result = await controller.registerDomain(
        workspaceId,
        { domain: MOCK_DOMAIN.domain } as any,
        mockReq,
      );

      expect(result.status).toBe('pending');
    });

    it('should support DNS verification method', async () => {
      const entity = createDomainEntity({ verificationMethod: 'dns' });
      mockDomainService.registerDomain.mockResolvedValue(entity);

      const result = await controller.registerDomain(
        workspaceId,
        { domain: MOCK_DOMAIN.domain } as any,
        mockReq,
      );

      expect(result.verificationMethod).toBe('dns');
    });

    it('should include DNS instruction for pending domains', async () => {
      const entity = createDomainEntity({ status: 'pending' });
      mockDomainService.registerDomain.mockResolvedValue(entity);

      const result = await controller.registerDomain(
        workspaceId,
        { domain: MOCK_DOMAIN.domain } as any,
        mockReq,
      );

      expect(result.dnsInstruction).toBeDefined();
      expect(result.dnsInstruction).toContain('TXT record');
    });
  });

  // ==================== Domain Verification E2E ====================

  describe('Domain Verification E2E', () => {
    it('should verify domain via DNS and transition to verified status', async () => {
      const verified = createDomainEntity({ status: 'verified', verifiedAt: new Date() });
      mockDomainService.verifyDomain.mockResolvedValue(verified);

      const result = await controller.verifyDomain(domainId, workspaceId, mockReq);

      expect(result.status).toBe('verified');
      expect(result.verifiedAt).toBeDefined();
      expect(mockDomainService.verifyDomain).toHaveBeenCalledWith(
        workspaceId,
        domainId,
        userId,
      );
    });

    it('should keep domain pending on failed DNS verification', async () => {
      const pending = createDomainEntity({
        status: 'pending',
        lastCheckAt: new Date(),
        lastCheckError: 'TXT record not found',
        checkCount: 1,
      });
      mockDomainService.verifyDomain.mockResolvedValue(pending);

      const result = await controller.verifyDomain(domainId, workspaceId, mockReq);

      expect(result.status).toBe('pending');
      expect(result.lastCheckError).toBe('TXT record not found');
    });

    it('should list all workspace domains with verification status', async () => {
      const domains = [
        createDomainEntity({ domain: 'test-corp.com', status: 'verified' }),
        createDomainEntity({
          id: createTestUuid(31),
          domain: 'other.com',
          status: 'pending',
        }),
      ];
      mockDomainService.listDomains.mockResolvedValue(domains);

      const result = await controller.listDomains(workspaceId);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('verified');
      expect(result[1].status).toBe('pending');
    });

    it('should filter domains by status', async () => {
      mockDomainService.listDomains.mockResolvedValue([
        createDomainEntity({ status: 'verified' }),
      ]);

      const result = await controller.listDomains(workspaceId, 'verified' as any);

      expect(mockDomainService.listDomains).toHaveBeenCalledWith(workspaceId, 'verified');
    });

    it('should redact verification token for verified domains', async () => {
      const verified = createDomainEntity({ status: 'verified', verifiedAt: new Date() });
      mockDomainService.getDomain.mockResolvedValue(verified);

      const result = await controller.getDomain(domainId, workspaceId);

      expect(result.verificationToken).toBe('***REDACTED***');
    });
  });

  // ==================== Domain Auto-Routing E2E ====================

  describe('Domain Auto-Routing E2E', () => {
    it('should return SSO provider info for verified domain lookup', async () => {
      mockDomainService.lookupDomain.mockResolvedValue({
        domain: 'test-corp.com',
        providerType: 'saml',
        providerId: createTestUuid(10),
        providerName: 'TestCorp Okta',
        workspaceId,
      });

      const result = await controller.lookupByEmail('user@test-corp.com');

      expect(result.found).toBe(true);
      expect(result.domain).toBe('test-corp.com');
      expect(result.providerType).toBe('saml');
    });

    it('should return empty for unverified domains', async () => {
      mockDomainService.lookupDomain.mockResolvedValue(null);

      const result = await controller.lookupByEmail('user@unverified.com');

      expect(result.found).toBe(false);
    });

    it('should return empty for unregistered domains', async () => {
      mockDomainService.lookupDomain.mockResolvedValue(null);

      const result = await controller.lookupByEmail('user@unknown.com');

      expect(result.found).toBe(false);
    });

    it('should handle invalid email format gracefully', async () => {
      const result = await controller.lookupByEmail('invalid-email');

      expect(result.found).toBe(false);
    });

    it('should route to OIDC provider for OIDC-linked domain', async () => {
      mockDomainService.lookupDomain.mockResolvedValue({
        domain: 'acquired-co.com',
        providerType: 'oidc',
        providerId: createTestUuid(20),
        providerName: 'Google Workspace',
        workspaceId,
      });

      const result = await controller.lookupByEmail('user@acquired-co.com');

      expect(result.found).toBe(true);
      expect(result.providerType).toBe('oidc');
    });
  });

  // ==================== Domain Lifecycle E2E ====================

  describe('Domain Lifecycle E2E', () => {
    it('should remove a domain', async () => {
      mockDomainService.removeDomain.mockResolvedValue(undefined);

      await controller.removeDomain(domainId, workspaceId, mockReq);

      expect(mockDomainService.removeDomain).toHaveBeenCalledWith(
        workspaceId,
        domainId,
        userId,
      );
    });

    it('should get a single domain by ID', async () => {
      const entity = createDomainEntity();
      mockDomainService.getDomain.mockResolvedValue(entity);

      const result = await controller.getDomain(domainId, workspaceId);

      expect(result).toBeDefined();
      expect(result.id).toBe(domainId);
    });
  });

  // ==================== Domain-Provider Linking E2E ====================

  describe('Domain-Provider Linking E2E', () => {
    it('should link a verified domain to a SAML provider', async () => {
      const samlConfigId = createTestUuid(10);
      const linked = createDomainEntity({
        status: 'verified',
        verifiedAt: new Date(),
        samlConfigId,
      });
      mockDomainService.linkProvider.mockResolvedValue(linked);

      const result = await controller.linkProvider(
        domainId,
        workspaceId,
        { samlConfigId } as any,
        mockReq,
      );

      expect(result.samlConfigId).toBe(samlConfigId);
      expect(mockDomainService.linkProvider).toHaveBeenCalledWith(
        workspaceId,
        domainId,
        samlConfigId,
        null,
        userId,
      );
    });

    it('should link a verified domain to an OIDC provider', async () => {
      const oidcConfigId = createTestUuid(20);
      const linked = createDomainEntity({
        status: 'verified',
        verifiedAt: new Date(),
        oidcConfigId,
      });
      mockDomainService.linkProvider.mockResolvedValue(linked);

      const result = await controller.linkProvider(
        domainId,
        workspaceId,
        { oidcConfigId } as any,
        mockReq,
      );

      expect(result.oidcConfigId).toBe(oidcConfigId);
    });

    it('should pass correct provider IDs for linking', async () => {
      const samlConfigId = createTestUuid(10);
      const oidcConfigId = createTestUuid(20);
      const linked = createDomainEntity({ status: 'verified' });
      mockDomainService.linkProvider.mockResolvedValue(linked);

      await controller.linkProvider(
        domainId,
        workspaceId,
        { samlConfigId, oidcConfigId } as any,
        mockReq,
      );

      expect(mockDomainService.linkProvider).toHaveBeenCalledWith(
        workspaceId,
        domainId,
        samlConfigId,
        oidcConfigId,
        userId,
      );
    });
  });
});
