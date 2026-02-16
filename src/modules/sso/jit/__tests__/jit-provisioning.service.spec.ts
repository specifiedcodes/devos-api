import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JitProvisioningService } from '../jit-provisioning.service';
import { JitProvisioningConfig, ConflictResolution } from '../../../../database/entities/jit-provisioning-config.entity';
import { User } from '../../../../database/entities/user.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../../redis/redis.service';
import { JIT_PROVISIONING_CONSTANTS } from '../../constants/jit-provisioning.constants';

describe('JitProvisioningService', () => {
  let service: JitProvisioningService;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const actorId = '550e8400-e29b-41d4-a716-446655440002';
  const configId = '550e8400-e29b-41d4-a716-446655440003';

  const defaultConfig: Partial<JitProvisioningConfig> = {
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJitConfigRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockWorkspaceMemberRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JitProvisioningService,
        { provide: getRepositoryToken(JitProvisioningConfig), useValue: mockJitConfigRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepository },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<JitProvisioningService>(JitProvisioningService);
  });

  describe('getConfig', () => {
    it('should return existing config for workspace', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue(defaultConfig);

      const result = await service.getConfig(workspaceId);

      expect(result).toEqual(defaultConfig);
      expect(mockJitConfigRepository.findOne).toHaveBeenCalledWith({ where: { workspaceId } });
    });

    it('should create default config if none exists and return it', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue(null);
      mockJitConfigRepository.create.mockReturnValue(defaultConfig);
      mockJitConfigRepository.save.mockResolvedValue(defaultConfig);

      const result = await service.getConfig(workspaceId);

      expect(result).toEqual(defaultConfig);
      expect(mockJitConfigRepository.create).toHaveBeenCalled();
      expect(mockJitConfigRepository.save).toHaveBeenCalled();
    });

    it('should cache config in Redis on first fetch', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue(defaultConfig);

      await service.getConfig(workspaceId);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `${JIT_PROVISIONING_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`,
        JSON.stringify(defaultConfig),
        JIT_PROVISIONING_CONSTANTS.CACHE_TTL_SECONDS,
      );
    });

    it('should return cached config on subsequent calls', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(defaultConfig));

      const result = await service.getConfig(workspaceId);

      // Cached result has dates as strings (from JSON.parse), so compare key fields
      expect(result.id).toEqual(defaultConfig.id);
      expect(result.workspaceId).toEqual(defaultConfig.workspaceId);
      expect(result.jitEnabled).toEqual(defaultConfig.jitEnabled);
      expect(result.defaultRole).toEqual(defaultConfig.defaultRole);
      expect(mockJitConfigRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fall back to DB when cache parse fails', async () => {
      mockRedisService.get.mockResolvedValue('invalid-json');
      mockJitConfigRepository.findOne.mockResolvedValue(defaultConfig);

      const result = await service.getConfig(workspaceId);

      expect(result).toEqual(defaultConfig);
      expect(mockJitConfigRepository.findOne).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('should update existing config with partial data', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      const updated = { ...defaultConfig, jitEnabled: false };
      mockJitConfigRepository.save.mockResolvedValue(updated);

      const result = await service.updateConfig(workspaceId, { jitEnabled: false }, actorId);

      expect(result.jitEnabled).toBe(false);
      expect(mockJitConfigRepository.save).toHaveBeenCalled();
    });

    it('should create new config if none exists', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue(null);
      mockJitConfigRepository.create.mockReturnValue({ ...defaultConfig });
      const updated = { ...defaultConfig, defaultRole: 'admin' };
      mockJitConfigRepository.save.mockResolvedValue(updated);

      const result = await service.updateConfig(workspaceId, { defaultRole: 'admin' }, actorId);

      expect(result.defaultRole).toBe('admin');
      expect(mockJitConfigRepository.create).toHaveBeenCalled();
    });

    it('should validate groupRoleMapping values against VALID_ROLES', async () => {
      await expect(
        service.updateConfig(workspaceId, {
          groupRoleMapping: { 'Engineers': 'super_admin' },
        }, actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject groupRoleMapping with invalid role values', async () => {
      await expect(
        service.updateConfig(workspaceId, {
          groupRoleMapping: { 'Engineers': 'owner' },
        }, actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate attributeMapping keys against VALID_PROFILE_FIELDS', async () => {
      await expect(
        service.updateConfig(workspaceId, {
          attributeMapping: { 'invalidField': 'some_path' },
        }, actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject groupRoleMapping with more than MAX_GROUP_ROLE_MAPPINGS entries', async () => {
      const tooMany: Record<string, string> = {};
      for (let i = 0; i <= JIT_PROVISIONING_CONSTANTS.MAX_GROUP_ROLE_MAPPINGS; i++) {
        tooMany[`group-${i}`] = 'developer';
      }
      await expect(
        service.updateConfig(workspaceId, { groupRoleMapping: tooMany }, actorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate Redis cache', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockJitConfigRepository.save.mockResolvedValue(defaultConfig);

      await service.updateConfig(workspaceId, { jitEnabled: false }, actorId);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `${JIT_PROVISIONING_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`,
      );
    });

    it('should log jit_config_updated audit event', async () => {
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockJitConfigRepository.save.mockResolvedValue(defaultConfig);

      await service.updateConfig(workspaceId, { jitEnabled: false }, actorId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_CONFIG_UPDATED,
          workspaceId,
          actorId,
        }),
      );
    });

    it('should return updated config', async () => {
      const updated = { ...defaultConfig, defaultRole: 'viewer' };
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockJitConfigRepository.save.mockResolvedValue(updated);

      const result = await service.updateConfig(workspaceId, { defaultRole: 'viewer' }, actorId);

      expect(result).toEqual(updated);
    });
  });

  describe('provisionUser - new user', () => {
    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockJitConfigRepository.create.mockReturnValue({ ...defaultConfig });
      mockJitConfigRepository.save.mockResolvedValue({ ...defaultConfig });
      mockUserRepository.findOne.mockResolvedValue(null); // No existing user
    });

    it('should create new user with email and random password hash', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
      );

      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe('user@example.com');
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          twoFactorEnabled: false,
        }),
      );
      // Ensure password hash is set (not empty)
      const createCall = mockUserRepository.create.mock.calls[0][0];
      expect(createCall.passwordHash).toBeDefined();
      expect(createCall.passwordHash.length).toBeGreaterThan(0);
    });

    it('should create workspace membership with default role (developer)', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml');

      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          userId,
          role: 'developer',
        }),
      );
    });

    it('should create workspace membership with mapped role when group matches', async () => {
      const configWithMapping = {
        ...defaultConfig,
        groupRoleMapping: { 'Engineering Leads': 'admin', 'Engineering': 'developer' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(configWithMapping);

      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Engineering Leads', 'Engineering'] },
        'saml',
      );

      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'admin',
        }),
      );
    });

    it('should respect require_email_domains restriction', async () => {
      const configWithDomains = {
        ...defaultConfig,
        requireEmailDomains: ['acme.com'],
      };
      mockJitConfigRepository.findOne.mockResolvedValue(configWithDomains);

      await expect(
        service.provisionUser(workspaceId, { email: 'user@other.com' }, 'saml'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should set welcomeEmail flag in result when welcomeEmail=true', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
      );

      expect(result.provisioningDetails.welcomeEmail).toBe(true);
    });

    it('should log jit_user_provisioned audit event', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
        '127.0.0.1',
        'Mozilla/5.0',
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_PROVISIONED,
          workspaceId,
          targetUserId: userId,
        }),
      );
    });

    it('should set isNewUser=true in result', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
      );

      expect(result.isNewUser).toBe(true);
    });

    it('should handle missing optional attributes gracefully', async () => {
      const newUser = { id: userId, email: 'user@example.com', ssoProfileData: null };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' }, // No firstName, lastName, etc.
        'oidc',
      );

      expect(result.user.email).toBe('user@example.com');
      expect(result.isNewUser).toBe(true);
    });
  });

  describe('provisionUser - existing user, not in workspace', () => {
    const existingUser = {
      id: userId,
      email: 'user@example.com',
      suspendedAt: null,
      ssoProfileData: null,
    };

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null); // Not in workspace
    });

    it('link_existing: should create workspace membership and log jit_user_linked_existing', async () => {
      const config = { ...defaultConfig, conflictResolution: ConflictResolution.LINK_EXISTING };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.conflictResolved).toBe('linked');
      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_LINKED,
        }),
      );
    });

    it('reject: should throw ForbiddenException and log jit_user_rejected', async () => {
      const config = { ...defaultConfig, conflictResolution: ConflictResolution.REJECT };
      mockJitConfigRepository.findOne.mockResolvedValue(config);

      await expect(
        service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml'),
      ).rejects.toThrow(ForbiddenException);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          details: expect.objectContaining({ reason: 'conflict_resolution_reject' }),
        }),
      );
    });

    it('prompt_admin: should throw ConflictException with pending_approval and log event', async () => {
      const config = { ...defaultConfig, conflictResolution: ConflictResolution.PROMPT_ADMIN };
      mockJitConfigRepository.findOne.mockResolvedValue(config);

      await expect(
        service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml'),
      ).rejects.toThrow(ConflictException);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          details: expect.objectContaining({ reason: 'pending_admin_approval' }),
        }),
      );
    });

    it('link_existing: should update profile if autoUpdateProfile=true', async () => {
      const config = {
        ...defaultConfig,
        conflictResolution: ConflictResolution.LINK_EXISTING,
        autoUpdateProfile: true,
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        ssoProfileData: { firstName: 'John' },
      });

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', firstName: 'John' },
        'saml',
      );

      expect(result.profileUpdated).toBe(true);
    });

    it('link_existing: should use mapped role from groups for new membership', async () => {
      const config = {
        ...defaultConfig,
        conflictResolution: ConflictResolution.LINK_EXISTING,
        groupRoleMapping: { 'Admins': 'admin' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Admins'] },
        'saml',
      );

      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
      );
    });
  });

  describe('provisionUser - existing user, in workspace', () => {
    const existingUser = {
      id: userId,
      email: 'user@example.com',
      suspendedAt: null,
      ssoProfileData: null,
    };

    const existingMember = {
      id: 'member-1',
      workspaceId,
      userId,
      role: WorkspaceRole.DEVELOPER,
    };

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...existingMember });
    });

    it('should update profile attributes when autoUpdateProfile=true', async () => {
      const config = { ...defaultConfig, autoUpdateProfile: true };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        ssoProfileData: { firstName: 'Jane' },
      });

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', firstName: 'Jane' },
        'oidc',
      );

      expect(result.profileUpdated).toBe(true);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should not update profile when autoUpdateProfile=false', async () => {
      const config = { ...defaultConfig, autoUpdateProfile: false };
      mockJitConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', firstName: 'Jane' },
        'oidc',
      );

      expect(result.profileUpdated).toBe(false);
    });

    it('should update role when autoUpdateRoles=true and group mapping matches different role', async () => {
      const config = {
        ...defaultConfig,
        autoUpdateRoles: true,
        groupRoleMapping: { 'Admins': 'admin' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockWorkspaceMemberRepository.save.mockResolvedValue({
        ...existingMember,
        role: WorkspaceRole.ADMIN,
      });

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Admins'] },
        'saml',
      );

      expect(result.roleUpdated).toBe(true);
      expect(result.previousRole).toBe('developer');
      expect(result.newRole).toBe('admin');
    });

    it('should not update role when autoUpdateRoles=false', async () => {
      const config = { ...defaultConfig, autoUpdateRoles: false };
      mockJitConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Admins'] },
        'saml',
      );

      expect(result.roleUpdated).toBe(false);
    });

    it('should not update role to owner (preserves owner role)', async () => {
      const ownerMember = { ...existingMember, role: WorkspaceRole.OWNER };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(ownerMember);
      const config = {
        ...defaultConfig,
        autoUpdateRoles: true,
        groupRoleMapping: { 'Engineers': 'developer' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Engineers'] },
        'saml',
      );

      expect(result.roleUpdated).toBe(false);
      expect(mockWorkspaceMemberRepository.save).not.toHaveBeenCalled();
    });

    it('should log jit_user_profile_updated when profile changed', async () => {
      const config = { ...defaultConfig, autoUpdateProfile: true };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        ssoProfileData: { firstName: 'Jane' },
      });

      await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', firstName: 'Jane' },
        'oidc',
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_PROFILE_UPDATED,
        }),
      );
    });

    it('should log jit_user_role_updated when role changed', async () => {
      const config = {
        ...defaultConfig,
        autoUpdateRoles: true,
        groupRoleMapping: { 'Admins': 'admin' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockWorkspaceMemberRepository.save.mockResolvedValue({
        ...existingMember,
        role: 'admin',
      });

      await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', groups: ['Admins'] },
        'saml',
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.JIT_USER_ROLE_UPDATED,
        }),
      );
    });

    it('should return profileUpdated=true and roleUpdated=true correctly', async () => {
      const config = {
        ...defaultConfig,
        autoUpdateProfile: true,
        autoUpdateRoles: true,
        groupRoleMapping: { 'Admins': 'admin' },
      };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        ssoProfileData: { firstName: 'Jane' },
      });
      mockWorkspaceMemberRepository.save.mockResolvedValue({
        ...existingMember,
        role: 'admin',
      });

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com', firstName: 'Jane', groups: ['Admins'] },
        'saml',
      );

      expect(result.profileUpdated).toBe(true);
      expect(result.roleUpdated).toBe(true);
    });
  });

  describe('provisionUser - JIT disabled', () => {
    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
    });

    it('should allow existing users in workspace to login (no provisioning needed)', async () => {
      const config = { ...defaultConfig, jitEnabled: false };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      const existingUser = {
        id: userId,
        email: 'user@example.com',
        suspendedAt: null,
        ssoProfileData: null,
      };
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        workspaceId,
        userId,
        role: WorkspaceRole.DEVELOPER,
      });

      const result = await service.provisionUser(
        workspaceId,
        { email: 'user@example.com' },
        'saml',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(userId);
    });

    it('should throw ForbiddenException for new users when JIT disabled', async () => {
      const config = { ...defaultConfig, jitEnabled: false };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.provisionUser(workspaceId, { email: 'new@example.com' }, 'saml'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for existing users not in workspace when JIT disabled', async () => {
      const config = { ...defaultConfig, jitEnabled: false };
      mockJitConfigRepository.findOne.mockResolvedValue(config);
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        suspendedAt: null,
        ssoProfileData: null,
      });
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('provisionUser - suspended user', () => {
    it('should throw ForbiddenException for suspended users', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        suspendedAt: new Date(),
        ssoProfileData: null,
      });

      await expect(
        service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('extractAttributes', () => {
    it('should extract flat attributes correctly', () => {
      const result = service.extractAttributes(
        { email: 'USER@EXAMPLE.COM', firstName: 'John', lastName: 'Doe' },
        { email: 'email', firstName: 'firstName', lastName: 'lastName' },
      );

      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle dot-notation paths', () => {
      const result = service.extractAttributes(
        { user: { profile: { email: 'user@test.com' } } },
        { email: 'user.profile.email' },
      );

      expect(result.email).toBe('user@test.com');
    });

    it('should return groups as array (wraps single string value)', () => {
      const result = service.extractAttributes(
        { groups: 'Engineering' },
        { groups: 'groups' },
      );

      expect(result.groups).toEqual(['Engineering']);
    });

    it('should return groups as array when already an array', () => {
      const result = service.extractAttributes(
        { groups: ['Engineering', 'Admins'] },
        { groups: 'groups' },
      );

      expect(result.groups).toEqual(['Engineering', 'Admins']);
    });

    it('should normalize email to lowercase', () => {
      const result = service.extractAttributes(
        { email: 'John.Doe@ACME.COM' },
        { email: 'email' },
      );

      expect(result.email).toBe('john.doe@acme.com');
    });

    it('should return undefined for missing optional fields', () => {
      const result = service.extractAttributes(
        { email: 'user@example.com' },
        { email: 'email', firstName: 'firstName', lastName: 'lastName' },
      );

      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });

    it('should preserve rawAttributes in result', () => {
      const raw = { email: 'user@example.com', custom: 'value' };
      const result = service.extractAttributes(raw, { email: 'email' });

      expect(result.rawAttributes).toBe(raw);
    });

    it('should handle null/undefined attribute values gracefully', () => {
      const result = service.extractAttributes(
        { email: 'user@example.com', firstName: null, lastName: undefined },
        { email: 'email', firstName: 'firstName', lastName: 'lastName' },
      );

      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });
  });

  describe('resolveRole', () => {
    it('should return first matching role from groups', () => {
      const role = service.resolveRole(
        ['Engineering Leads', 'Engineering'],
        { 'Engineering Leads': 'admin', 'Engineering': 'developer' },
        'viewer',
      );

      expect(role).toBe('admin');
    });

    it('should perform case-insensitive group matching', () => {
      const role = service.resolveRole(
        ['engineering leads'],
        { 'Engineering Leads': 'admin' },
        'developer',
      );

      expect(role).toBe('admin');
    });

    it('should return defaultRole when no groups provided', () => {
      const role = service.resolveRole(undefined, { 'Admin': 'admin' }, 'developer');

      expect(role).toBe('developer');
    });

    it('should return defaultRole when no mapping matches', () => {
      const role = service.resolveRole(
        ['Marketing'],
        { 'Engineering': 'developer' },
        'viewer',
      );

      expect(role).toBe('viewer');
    });

    it('should ignore invalid role values in mapping (falls through to defaultRole)', () => {
      const role = service.resolveRole(
        ['Special Group'],
        { 'Special Group': 'super_admin' }, // invalid role
        'developer',
      );

      expect(role).toBe('developer');
    });

    it('should return defaultRole when groups array is empty', () => {
      const role = service.resolveRole([], { 'Admin': 'admin' }, 'developer');

      expect(role).toBe('developer');
    });
  });

  describe('provisionUser - error handling', () => {
    it('should throw BadRequestException when email is missing', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });

      await expect(
        service.provisionUser(workspaceId, {}, 'saml'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException on database error during user creation', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockJitConfigRepository.findOne.mockResolvedValue({ ...defaultConfig });
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({ email: 'user@example.com' });
      mockUserRepository.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.provisionUser(workspaceId, { email: 'user@example.com' }, 'saml'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
