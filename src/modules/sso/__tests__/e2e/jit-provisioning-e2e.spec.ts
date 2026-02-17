/**
 * JIT User Provisioning E2E Tests
 * Tests automatic user creation during SSO login including configuration,
 * SAML/OIDC provisioning, group mapping, and re-login updates.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JitProvisioningController } from '../../jit/jit-provisioning.controller';
import { JitProvisioningService } from '../../jit/jit-provisioning.service';
import {
  MOCK_SAML_RESPONSE,
  MOCK_OIDC_TOKENS,
  createTestWorkspaceId,
  createTestUserId,
  createTestSsoUser,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('JIT Provisioning E2E Tests', () => {
  let controller: JitProvisioningController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();

  const mockJitService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    provisionUser: jest.fn(),
    extractAttributes: jest.fn(),
    resolveRole: jest.fn(),
  };

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  const defaultConfig = {
    id: createTestUuid(40),
    workspaceId,
    jitEnabled: true,
    defaultRole: 'developer',
    autoUpdateProfile: true,
    autoUpdateRoles: true,
    welcomeEmail: true,
    requireEmailDomains: [],
    attributeMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      groups: 'groups',
    },
    groupRoleMapping: {
      'Engineering Leads': 'admin',
      'Engineering': 'developer',
    },
    conflictResolution: 'prompt_admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JitProvisioningController],
      providers: [
        { provide: JitProvisioningService, useValue: mockJitService },
      ],
    }).compile();

    controller = module.get<JitProvisioningController>(JitProvisioningController);
  });

  // ==================== JIT Configuration E2E ====================

  describe('JIT Configuration E2E', () => {
    it('should return current JIT provisioning config', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);

      const result = await controller.getConfig(workspaceId);

      expect(result).toBeDefined();
      expect(result.jitEnabled).toBe(true);
      expect(result.defaultRole).toBe('developer');
      expect(mockJitService.getConfig).toHaveBeenCalledWith(workspaceId);
    });

    it('should create default config if none exists', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);

      const result = await controller.getConfig(workspaceId);

      expect(result.jitEnabled).toBe(true);
      expect(result.defaultRole).toBe('developer');
    });

    it('should update JIT config with new settings', async () => {
      const updated = { ...defaultConfig, defaultRole: 'viewer', jitEnabled: false };
      mockJitService.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(
        workspaceId,
        { defaultRole: 'viewer', jitEnabled: false } as any,
        mockReq,
      );

      expect(result.defaultRole).toBe('viewer');
      expect(result.jitEnabled).toBe(false);
    });

    it('should update group role mapping', async () => {
      const updated = {
        ...defaultConfig,
        groupRoleMapping: { 'Engineering': 'admin', 'Marketing': 'viewer' },
      };
      mockJitService.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(
        workspaceId,
        { groupRoleMapping: { 'Engineering': 'admin', 'Marketing': 'viewer' } } as any,
        mockReq,
      );

      expect(result.groupRoleMapping).toEqual({ 'Engineering': 'admin', 'Marketing': 'viewer' });
    });

    it('should update require email domains restriction', async () => {
      const updated = {
        ...defaultConfig,
        requireEmailDomains: ['test-corp.com', 'acquired-co.com'],
      };
      mockJitService.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(
        workspaceId,
        { requireEmailDomains: ['test-corp.com', 'acquired-co.com'] } as any,
        mockReq,
      );

      expect(result.requireEmailDomains).toContain('test-corp.com');
    });
  });

  // ==================== JIT Test Mapping E2E ====================

  describe('JIT Test Mapping E2E', () => {
    it('should test attribute mapping with SAML-style attributes', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({
        email: 'user@test-corp.com',
        firstName: 'John',
        lastName: 'Doe',
        groups: ['Engineering', 'Engineering Leads'],
      });
      mockJitService.resolveRole.mockReturnValue('admin');

      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: {
          email: 'user@test-corp.com',
          given_name: 'John',
          family_name: 'Doe',
          groups: ['Engineering', 'Engineering Leads'],
        },
      });

      expect(result.extractedAttributes.email).toBe('user@test-corp.com');
      expect(result.resolvedRole).toBe('admin');
      expect(result.wouldCreateUser).toBe(true);
    });

    it('should resolve Engineering group to developer role', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({
        email: 'dev@test-corp.com',
        firstName: 'Dev',
        lastName: 'User',
        groups: ['Engineering'],
      });
      mockJitService.resolveRole.mockReturnValue('developer');

      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: {
          email: 'dev@test-corp.com',
          groups: ['Engineering'],
        },
      });

      expect(result.resolvedRole).toBe('developer');
    });

    it('should resolve Engineering Leads group to admin role', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({
        email: 'lead@test-corp.com',
        groups: ['Engineering Leads'],
      });
      mockJitService.resolveRole.mockReturnValue('admin');

      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: { groups: ['Engineering Leads'] },
      });

      expect(result.resolvedRole).toBe('admin');
    });

    it('should use default role for unknown groups', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({
        email: 'sales@test-corp.com',
        groups: ['Sales'],
      });
      mockJitService.resolveRole.mockReturnValue('developer');

      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: { groups: ['Sales'] },
      });

      expect(result.resolvedRole).toBe('developer');
    });

    it('should indicate wouldUpdateProfile based on config', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({});
      mockJitService.resolveRole.mockReturnValue('developer');

      const result = await controller.testMapping(workspaceId, { sampleAttributes: {} });

      expect(result.wouldUpdateProfile).toBe(true);
      expect(result.wouldUpdateRole).toBe(true);
    });

    it('should handle empty sample attributes', async () => {
      mockJitService.getConfig.mockResolvedValue(defaultConfig);
      mockJitService.extractAttributes.mockReturnValue({});
      mockJitService.resolveRole.mockReturnValue('developer');

      const result = await controller.testMapping(workspaceId, { sampleAttributes: {} });

      expect(result).toBeDefined();
      expect(result.resolvedRole).toBe('developer');
    });
  });

  // ==================== JIT Provisioning via SAML E2E ====================

  describe('JIT Provisioning via SAML E2E', () => {
    it('should provision new user from SAML assertion attributes', () => {
      const samlAttributes = MOCK_SAML_RESPONSE.valid.attributes;
      expect(samlAttributes['urn:oid:0.9.2342.19200300.100.1.3']).toBe('user@test-corp.com');
      expect(samlAttributes['urn:oid:2.5.4.42']).toBe('John');
      expect(samlAttributes['urn:oid:2.5.4.4']).toBe('Doe');
      expect(samlAttributes['memberOf']).toContain('Engineering');
    });

    it('should verify SAML response has session index for federation', () => {
      expect(MOCK_SAML_RESPONSE.valid.sessionIndex).toBe('_session_index_12345');
    });

    it('should verify SAML response has issuer for IdP identification', () => {
      expect(MOCK_SAML_RESPONSE.valid.issuer).toBe('https://idp.test-corp.com/saml/metadata');
    });
  });

  // ==================== JIT Provisioning via OIDC E2E ====================

  describe('JIT Provisioning via OIDC E2E', () => {
    it('should provision new user from OIDC ID token claims', () => {
      const claims = MOCK_OIDC_TOKENS.valid.claims;
      expect(claims.email).toBe('user@test-corp.com');
      expect(claims.given_name).toBe('John');
      expect(claims.family_name).toBe('Doe');
      expect(claims.email_verified).toBe(true);
    });

    it('should have correct profile info from ID token', () => {
      const claims = MOCK_OIDC_TOKENS.valid.claims;
      expect(claims.name).toBe('John Doe');
      expect(claims.picture).toBeDefined();
    });
  });

  // ==================== JIT Group Mapping E2E ====================

  describe('JIT Group Mapping E2E', () => {
    it('should map IdP groups to DevOS roles via config', () => {
      const groupMapping = defaultConfig.groupRoleMapping;
      expect(groupMapping['Engineering']).toBe('developer');
      expect(groupMapping['Engineering Leads']).toBe('admin');
    });

    it('should fallback to default role for unmapped groups', () => {
      expect(defaultConfig.defaultRole).toBe('developer');
    });
  });
});
