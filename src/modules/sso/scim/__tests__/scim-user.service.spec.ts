import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException } from '@nestjs/common';
import { ScimUserService } from '../scim-user.service';
import { User } from '../../../../database/entities/user.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../../database/entities/workspace-member.entity';
import { ScimGroup } from '../../../../database/entities/scim-group.entity';
import { ScimGroupMembership } from '../../../../database/entities/scim-group-membership.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { ScimSyncLogService } from '../scim-sync-log.service';
import { ScimConfiguration } from '../../../../database/entities/scim-configuration.entity';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';

describe('ScimUserService', () => {
  let service: ScimUserService;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';

  const defaultScimConfig: Partial<ScimConfiguration> = {
    workspaceId,
    enabled: true,
    defaultRole: 'developer',
    autoDeactivate: true,
    autoReactivate: true,
    syncGroups: true,
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
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockScimGroupRepository = {};
  const mockScimGroupMembershipRepository = {};

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockScimSyncLogService = {
    log: jest.fn().mockResolvedValue({}),
  };

  // Helper to set up query builder mock for listUsers
  const setupQueryBuilder = (members: any[], total: number) => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(total),
      getMany: jest.fn().mockResolvedValue(members),
    };
    mockWorkspaceMemberRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimUserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepository },
        { provide: getRepositoryToken(ScimGroup), useValue: mockScimGroupRepository },
        { provide: getRepositoryToken(ScimGroupMembership), useValue: mockScimGroupMembershipRepository },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: ScimSyncLogService, useValue: mockScimSyncLogService },
      ],
    }).compile();

    service = module.get<ScimUserService>(ScimUserService);
  });

  describe('listUsers', () => {
    it('should return empty list for workspace with no members', async () => {
      setupQueryBuilder([], 0);

      const result = await service.listUsers(workspaceId);

      expect(result.totalResults).toBe(0);
      expect(result.Resources).toEqual([]);
      expect(result.schemas).toContain(SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE);
    });

    it('should return all workspace members in SCIM format', async () => {
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: null, suspendedAt: null, scimExternalId: null };
      const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };
      setupQueryBuilder([member], 1);

      const result = await service.listUsers(workspaceId);

      expect(result.totalResults).toBe(1);
      expect(result.Resources[0].userName).toBe('john@test.com');
      expect(result.Resources[0].schemas).toContain(SCIM_CONSTANTS.SCHEMAS.USER);
    });

    it('should handle startIndex and count pagination', async () => {
      const qb = setupQueryBuilder([], 50);

      await service.listUsers(workspaceId, undefined, 11, 10);

      expect(qb.skip).toHaveBeenCalledWith(10); // startIndex 11 => skip 10
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('should default to startIndex=1, count=100', async () => {
      const qb = setupQueryBuilder([], 0);

      const result = await service.listUsers(workspaceId);

      expect(result.startIndex).toBe(1);
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('should cap count at MAX_PAGE_SIZE (500)', async () => {
      const qb = setupQueryBuilder([], 0);

      await service.listUsers(workspaceId, undefined, 1, 999);

      expect(qb.take).toHaveBeenCalledWith(500);
    });

    it('should return correct totalResults (not paginated count)', async () => {
      setupQueryBuilder([], 150);

      const result = await service.listUsers(workspaceId, undefined, 1, 10);

      expect(result.totalResults).toBe(150);
    });

    it('should handle invalid filter gracefully (returns SCIM error)', async () => {
      setupQueryBuilder([], 0);

      await expect(
        service.listUsers(workspaceId, 'invalid !! filter'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getUser', () => {
    it('should return user in SCIM format for valid ID', async () => {
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: { firstName: 'John' }, suspendedAt: null, scimExternalId: 'ext-1' };
      const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(member);

      const result = await service.getUser(workspaceId, userId);

      expect(result.id).toBe(userId);
      expect(result.userName).toBe('john@test.com');
      expect(result.active).toBe(true);
      expect(result.externalId).toBe('ext-1');
    });

    it('should return 404 SCIM error for non-existent user', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.getUser(workspaceId, 'non-existent')).rejects.toThrow(HttpException);
    });

    it('should return 404 SCIM error for user not in workspace', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.getUser(workspaceId, userId)).rejects.toThrow(HttpException);
    });
  });

  describe('createUser', () => {
    it('should create new user with email, name, externalId', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: null, suspendedAt: null, scimExternalId: 'ext-1' };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };
      mockWorkspaceMemberRepository.create.mockReturnValue(member);
      mockWorkspaceMemberRepository.save.mockResolvedValue(member);

      const result = await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true, externalId: 'ext-1', name: { givenName: 'John', familyName: 'Doe' } },
        defaultScimConfig as ScimConfiguration,
      );

      expect(result.userName).toBe('john@test.com');
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john@test.com' }),
      );
    });

    it('should set scimExternalId on user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: null, suspendedAt: null, scimExternalId: 'ext-1' };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true, externalId: 'ext-1' },
        defaultScimConfig as ScimConfiguration,
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ scimExternalId: 'ext-1' }),
      );
    });

    it('should create workspace membership with default role', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date() };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true },
        defaultScimConfig as ScimConfiguration,
      );

      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'developer' }),
      );
    });

    it('should return 409 uniqueness error for existing user already in workspace', async () => {
      const existingUser = { id: userId, email: 'john@test.com', suspendedAt: null, scimExternalId: null, ssoProfileData: null };
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ userId, workspaceId });

      await expect(
        service.createUser(
          workspaceId,
          { schemas: [], userName: 'john@test.com', active: true },
          defaultScimConfig as ScimConfiguration,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should add existing user to workspace if not already member', async () => {
      const existingUser = { id: userId, email: 'john@test.com', suspendedAt: null, scimExternalId: null, ssoProfileData: null };
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(existingUser);
      const member = { userId, workspaceId, role: WorkspaceRole.DEVELOPER };
      mockWorkspaceMemberRepository.create.mockReturnValue(member);
      mockWorkspaceMemberRepository.save.mockResolvedValue(member);

      const result = await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true },
        defaultScimConfig as ScimConfiguration,
      );

      expect(result.userName).toBe('john@test.com');
      expect(mockWorkspaceMemberRepository.create).toHaveBeenCalled();
    });

    it('should reactivate suspended user if auto_reactivate is true', async () => {
      const suspendedUser = { id: userId, email: 'john@test.com', suspendedAt: new Date(), suspensionReason: 'test', scimExternalId: null, ssoProfileData: null };
      mockUserRepository.findOne.mockResolvedValue(suspendedUser);
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue({ ...suspendedUser, suspendedAt: null });
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true },
        { ...defaultScimConfig, autoReactivate: true } as ScimConfiguration,
      );

      expect(suspendedUser.suspendedAt).toBeNull();
    });

    it('should log create_user to scim_sync_logs', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date() };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true },
        defaultScimConfig as ScimConfiguration,
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'create_user' }),
      );
    });

    it('should log SCIM_USER_CREATED audit event', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date() };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);
      mockWorkspaceMemberRepository.create.mockReturnValue({});
      mockWorkspaceMemberRepository.save.mockResolvedValue({});

      await service.createUser(
        workspaceId,
        { schemas: [], userName: 'john@test.com', active: true },
        defaultScimConfig as ScimConfiguration,
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_USER_CREATED,
        }),
      );
    });

    it('should return 400 for missing userName', async () => {
      await expect(
        service.createUser(
          workspaceId,
          { schemas: [], userName: '', active: true },
          defaultScimConfig as ScimConfiguration,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('replaceUser', () => {
    const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: {}, suspendedAt: null, scimExternalId: null, suspensionReason: null };
    const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };

    beforeEach(() => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: { ...user } });
    });

    it('should update user attributes', async () => {
      mockUserRepository.save.mockResolvedValue({ ...user });

      const result = await service.replaceUser(
        workspaceId,
        userId,
        { schemas: [], userName: 'john@test.com', active: true, displayName: 'John D', name: { givenName: 'John', familyName: 'Doe' } },
        defaultScimConfig as ScimConfiguration,
      );

      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should deactivate user when active=false', async () => {
      const userCopy = { ...user, suspendedAt: null };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });
      mockUserRepository.save.mockResolvedValue({ ...userCopy, suspendedAt: new Date() });

      await service.replaceUser(
        workspaceId,
        userId,
        { schemas: [], userName: 'john@test.com', active: false },
        defaultScimConfig as ScimConfiguration,
      );

      expect(userCopy.suspendedAt).toBeDefined();
      expect(userCopy.suspendedAt).not.toBeNull();
    });

    it('should reactivate user when active=true if auto_reactivate', async () => {
      const userCopy = { ...user, suspendedAt: new Date(), suspensionReason: 'test' };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });
      mockUserRepository.save.mockResolvedValue({ ...userCopy, suspendedAt: null });

      await service.replaceUser(
        workspaceId,
        userId,
        { schemas: [], userName: 'john@test.com', active: true },
        { ...defaultScimConfig, autoReactivate: true } as ScimConfiguration,
      );

      expect(userCopy.suspendedAt).toBeNull();
    });

    it('should return 404 for non-existent user', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.replaceUser(
          workspaceId,
          'non-existent',
          { schemas: [], userName: 'john@test.com', active: true },
          defaultScimConfig as ScimConfiguration,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should log update_user to scim_sync_logs', async () => {
      mockUserRepository.save.mockResolvedValue({ ...user });

      await service.replaceUser(
        workspaceId,
        userId,
        { schemas: [], userName: 'john@test.com', active: true },
        defaultScimConfig as ScimConfiguration,
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'update_user' }),
      );
    });
  });

  describe('patchUser', () => {
    const user = { id: userId, email: 'john@test.com', createdAt: new Date(), updatedAt: new Date(), ssoProfileData: {}, suspendedAt: null, scimExternalId: null, suspensionReason: null };
    const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };

    beforeEach(() => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: { ...user } });
      mockUserRepository.save.mockResolvedValue({ ...user });
    });

    it('should handle replace operation on displayName', async () => {
      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'replace', path: 'displayName', value: 'New Name' }] },
        defaultScimConfig as ScimConfiguration,
      );

      const savedUser = mockUserRepository.save.mock.calls[0][0];
      expect(savedUser.ssoProfileData?.displayName).toBe('New Name');
    });

    it('should handle replace operation on active=false (deactivation)', async () => {
      const userCopy = { ...user, suspendedAt: null };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });

      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'replace', path: 'active', value: false }] },
        defaultScimConfig as ScimConfiguration,
      );

      expect(userCopy.suspendedAt).not.toBeNull();
    });

    it('should handle replace operation on active=true (reactivation)', async () => {
      const userCopy = { ...user, suspendedAt: new Date(), suspensionReason: 'test' };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });

      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'replace', path: 'active', value: true }] },
        { ...defaultScimConfig, autoReactivate: true } as ScimConfiguration,
      );

      expect(userCopy.suspendedAt).toBeNull();
    });

    it('should handle add operation on name.givenName', async () => {
      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'add', path: 'name.givenName', value: 'Jane' }] },
        defaultScimConfig as ScimConfiguration,
      );

      const savedUser = mockUserRepository.save.mock.calls[0][0];
      expect(savedUser.ssoProfileData?.firstName).toBe('Jane');
    });

    it('should handle remove operation on title', async () => {
      const userCopy = { ...user, ssoProfileData: { jobTitle: 'Engineer' } };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });

      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'remove', path: 'title' }] },
        defaultScimConfig as ScimConfiguration,
      );

      const savedUser = mockUserRepository.save.mock.calls[0][0];
      expect(savedUser.ssoProfileData?.jobTitle).toBeUndefined();
    });

    it('should process multiple operations in order', async () => {
      await service.patchUser(
        workspaceId,
        userId,
        {
          schemas: [],
          Operations: [
            { op: 'replace', path: 'displayName', value: 'New Name' },
            { op: 'add', path: 'name.givenName', value: 'Jane' },
          ],
        },
        defaultScimConfig as ScimConfiguration,
      );

      const savedUser = mockUserRepository.save.mock.calls[0][0];
      expect(savedUser.ssoProfileData?.displayName).toBe('New Name');
      expect(savedUser.ssoProfileData?.firstName).toBe('Jane');
    });

    it('should return 404 for non-existent user', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.patchUser(
          workspaceId,
          'non-existent',
          { schemas: [], Operations: [] },
          defaultScimConfig as ScimConfiguration,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should log update_user to scim_sync_logs', async () => {
      await service.patchUser(
        workspaceId,
        userId,
        { schemas: [], Operations: [{ op: 'replace', path: 'displayName', value: 'X' }] },
        defaultScimConfig as ScimConfiguration,
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'update_user' }),
      );
    });
  });

  describe('deleteUser', () => {
    const user = { id: userId, email: 'john@test.com', suspendedAt: null, suspensionReason: null, scimExternalId: 'ext-1' };
    const member = { userId, user, workspaceId, role: WorkspaceRole.DEVELOPER };

    beforeEach(() => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: { ...user } });
      mockUserRepository.save.mockResolvedValue({});
      mockWorkspaceMemberRepository.remove.mockResolvedValue({});
    });

    it('should set suspendedAt on user (soft delete)', async () => {
      const userCopy = { ...user };
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ ...member, user: userCopy });

      await service.deleteUser(workspaceId, userId, defaultScimConfig as ScimConfiguration);

      expect(userCopy.suspendedAt).not.toBeNull();
    });

    it('should remove workspace membership', async () => {
      await service.deleteUser(workspaceId, userId, defaultScimConfig as ScimConfiguration);

      expect(mockWorkspaceMemberRepository.remove).toHaveBeenCalled();
    });

    it('should return void (204)', async () => {
      const result = await service.deleteUser(workspaceId, userId, defaultScimConfig as ScimConfiguration);

      expect(result).toBeUndefined();
    });

    it('should log deactivate_user to scim_sync_logs', async () => {
      await service.deleteUser(workspaceId, userId, defaultScimConfig as ScimConfiguration);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'deactivate_user' }),
      );
    });

    it('should log SCIM_USER_DEACTIVATED audit event', async () => {
      await service.deleteUser(workspaceId, userId, defaultScimConfig as ScimConfiguration);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_USER_DEACTIVATED,
        }),
      );
    });

    it('should return 404 for non-existent user', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteUser(workspaceId, 'non-existent', defaultScimConfig as ScimConfiguration),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('parseFilter', () => {
    it('should parse userName eq "value"', () => {
      const result = service.parseFilter('userName eq "john@test.com"');

      expect(result).toEqual([{ attribute: 'userName', operator: 'eq', value: 'john@test.com' }]);
    });

    it('should parse active eq true (boolean without quotes)', () => {
      const result = service.parseFilter('active eq true');

      expect(result).toEqual([{ attribute: 'active', operator: 'eq', value: 'true' }]);
    });

    it('should parse externalId eq "ext123"', () => {
      const result = service.parseFilter('externalId eq "ext123"');

      expect(result).toEqual([{ attribute: 'externalId', operator: 'eq', value: 'ext123' }]);
    });

    it('should parse displayName co "john" (contains)', () => {
      const result = service.parseFilter('displayName co "john"');

      expect(result).toEqual([{ attribute: 'displayName', operator: 'co', value: 'john' }]);
    });

    it('should support and logical operator', () => {
      const result = service.parseFilter('userName eq "john@test.com" and active eq true');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ attribute: 'userName', operator: 'eq', value: 'john@test.com' });
      expect(result[1]).toEqual({ attribute: 'active', operator: 'eq', value: 'true' });
    });

    it('should throw for invalid filter syntax', () => {
      expect(() => service.parseFilter('invalid!! syntax')).toThrow();
    });
  });

  describe('toScimUserResource', () => {
    it('should convert user to SCIM format', () => {
      const user = {
        id: userId,
        email: 'john@test.com',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        ssoProfileData: { firstName: 'John', lastName: 'Doe', displayName: 'John Doe', jobTitle: 'Engineer' },
        suspendedAt: null,
        scimExternalId: 'ext-1',
      } as User;
      const member = { userId, workspaceId, role: WorkspaceRole.DEVELOPER } as WorkspaceMember;

      const result = service.toScimUserResource(user, member, workspaceId, 'https://devos.com');

      expect(result.schemas).toContain(SCIM_CONSTANTS.SCHEMAS.USER);
      expect(result.id).toBe(userId);
      expect(result.userName).toBe('john@test.com');
      expect(result.active).toBe(true);
      expect(result.externalId).toBe('ext-1');
      expect(result.name?.givenName).toBe('John');
      expect(result.name?.familyName).toBe('Doe');
      expect(result.displayName).toBe('John Doe');
      expect(result.title).toBe('Engineer');
      expect(result.meta.resourceType).toBe('User');
    });

    it('should set active=false for suspended user', () => {
      const user = {
        id: userId,
        email: 'john@test.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        ssoProfileData: null,
        suspendedAt: new Date(),
        scimExternalId: null,
      } as User;
      const member = { userId, workspaceId, role: WorkspaceRole.DEVELOPER } as WorkspaceMember;

      const result = service.toScimUserResource(user, member, workspaceId, '');

      expect(result.active).toBe(false);
    });
  });
});
