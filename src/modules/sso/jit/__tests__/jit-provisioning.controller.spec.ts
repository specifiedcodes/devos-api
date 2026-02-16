import { Test, TestingModule } from '@nestjs/testing';
import { JitProvisioningController } from '../jit-provisioning.controller';
import { JitProvisioningService } from '../jit-provisioning.service';
import { ConflictResolution } from '../../../../database/entities/jit-provisioning-config.entity';
import { JIT_PROVISIONING_CONSTANTS } from '../../constants/jit-provisioning.constants';

describe('JitProvisioningController', () => {
  let controller: JitProvisioningController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const configId = '550e8400-e29b-41d4-a716-446655440003';

  const defaultConfig = {
    id: configId,
    workspaceId,
    jitEnabled: true,
    defaultRole: 'developer',
    autoUpdateProfile: true,
    autoUpdateRoles: false,
    welcomeEmail: true,
    requireEmailDomains: null,
    attributeMapping: { ...JIT_PROVISIONING_CONSTANTS.DEFAULT_SAML_ATTRIBUTE_MAPPING },
    groupRoleMapping: {},
    conflictResolution: ConflictResolution.LINK_EXISTING,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockJitProvisioningService = {
    getConfig: jest.fn().mockResolvedValue(defaultConfig),
    updateConfig: jest.fn().mockResolvedValue(defaultConfig),
    extractAttributes: jest.fn().mockReturnValue({
      email: 'john@acme.com',
      firstName: 'John',
      lastName: 'Doe',
      groups: ['Engineering'],
      rawAttributes: {},
    }),
    resolveRole: jest.fn().mockReturnValue('developer'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JitProvisioningController],
      providers: [
        { provide: JitProvisioningService, useValue: mockJitProvisioningService },
      ],
    }).compile();

    controller = module.get<JitProvisioningController>(JitProvisioningController);
  });

  describe('getConfig', () => {
    it('should return JIT config for workspace with 200', async () => {
      const result = await controller.getConfig(workspaceId);

      expect(result.id).toBe(configId);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.jitEnabled).toBe(true);
      expect(result.defaultRole).toBe('developer');
      expect(mockJitProvisioningService.getConfig).toHaveBeenCalledWith(workspaceId);
    });

    it('should create default config if none exists', async () => {
      mockJitProvisioningService.getConfig.mockResolvedValue(defaultConfig);

      const result = await controller.getConfig(workspaceId);

      expect(result.id).toBeDefined();
      expect(result.jitEnabled).toBe(true);
    });

    it('should return all expected fields in response', async () => {
      const result = await controller.getConfig(workspaceId);

      expect(result.id).toBeDefined();
      expect(result.workspaceId).toBeDefined();
      expect(result.jitEnabled).toBeDefined();
      expect(result.defaultRole).toBeDefined();
      expect(result.autoUpdateProfile).toBeDefined();
      expect(result.autoUpdateRoles).toBeDefined();
      expect(result.welcomeEmail).toBeDefined();
      expect(result.attributeMapping).toBeDefined();
      expect(result.groupRoleMapping).toBeDefined();
      expect(result.conflictResolution).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update config and return updated config with 200', async () => {
      const updated = { ...defaultConfig, jitEnabled: false };
      mockJitProvisioningService.updateConfig.mockResolvedValue(updated);

      const req = { user: { id: 'actor-123' } } as any;
      const result = await controller.updateConfig(workspaceId, { jitEnabled: false }, req);

      expect(result.jitEnabled).toBe(false);
      expect(mockJitProvisioningService.updateConfig).toHaveBeenCalledWith(
        workspaceId,
        { jitEnabled: false },
        'actor-123',
      );
    });

    it('should pass actor ID from request user', async () => {
      mockJitProvisioningService.updateConfig.mockResolvedValue(defaultConfig);

      const req = { user: { id: 'actor-456' } } as any;
      await controller.updateConfig(workspaceId, { defaultRole: 'admin' }, req);

      expect(mockJitProvisioningService.updateConfig).toHaveBeenCalledWith(
        workspaceId,
        { defaultRole: 'admin' },
        'actor-456',
      );
    });
  });

  describe('testMapping', () => {
    it('should return extracted attributes and resolved role', async () => {
      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: {
          email: 'john@acme.com',
          given_name: 'John',
          family_name: 'Doe',
          groups: ['Engineering'],
        },
      });

      expect(result.extractedAttributes).toBeDefined();
      expect(result.extractedAttributes.email).toBe('john@acme.com');
      expect(result.resolvedRole).toBe('developer');
      expect(result.wouldCreateUser).toBe(true);
      expect(result.wouldUpdateProfile).toBe(true);
      expect(result.wouldUpdateRole).toBe(false);
    });

    it('should not modify any database records', async () => {
      await controller.testMapping(workspaceId, {
        sampleAttributes: { email: 'test@test.com' },
      });

      // Only getConfig should be called, not updateConfig or provisionUser
      expect(mockJitProvisioningService.getConfig).toHaveBeenCalled();
      expect(mockJitProvisioningService.updateConfig).not.toHaveBeenCalled();
    });

    it('should handle empty/missing sample attributes gracefully', async () => {
      mockJitProvisioningService.extractAttributes.mockReturnValue({
        email: '',
        rawAttributes: {},
      });

      const result = await controller.testMapping(workspaceId, {
        sampleAttributes: {},
      });

      expect(result.extractedAttributes).toBeDefined();
    });

    it('should handle missing sampleAttributes in body', async () => {
      mockJitProvisioningService.extractAttributes.mockReturnValue({
        email: '',
        rawAttributes: {},
      });

      const result = await controller.testMapping(workspaceId, {} as any);

      expect(result.extractedAttributes).toBeDefined();
    });
  });
});
