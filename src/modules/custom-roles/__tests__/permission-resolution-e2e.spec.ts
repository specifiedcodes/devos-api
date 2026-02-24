/**
 * Permission Resolution End-to-End Tests
 *
 * Story 20-8: Permission Testing Suite (AC1)
 *
 * Tests the full permission resolution chain:
 *   PermissionGuard -> PermissionCacheService -> PermissionMatrixService -> Database entities
 *
 * Verifies owner full-access, system role defaults, custom role inheritance,
 * explicit overrides, non-member denial, cache consistency, and cache invalidation.
 */

import { PermissionMatrixService } from '../services/permission-matrix.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  ResourceType,
  RESOURCE_PERMISSIONS,
  BASE_ROLE_DEFAULTS,
  RolePermission,
} from '../../../database/entities/role-permission.entity';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';

// ---- Test Constants ----
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111';
const USER_ID = 'usr-22222222-2222-2222-2222-222222222222';
const ROLE_ID = 'role-33333333-3333-3333-3333-333333333333';
const ACTOR_ID = 'actor-44444444-4444-4444-4444-444444444444';

// ---- Mock Factories ----

function createMockMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    id: 'mem-1',
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    role: WorkspaceRole.DEVELOPER,
    customRoleId: null,
    customRole: undefined,
    createdAt: new Date(),
    ...overrides,
  } as WorkspaceMember;
}

function createMockCustomRole(overrides: Partial<CustomRole> = {}): CustomRole {
  return {
    id: ROLE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'qa-lead',
    displayName: 'QA Lead',
    description: null,
    color: '#6366f1',
    icon: 'shield',
    baseRole: BaseRole.DEVELOPER,
    isSystem: false,
    isActive: true,
    priority: 0,
    createdBy: ACTOR_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CustomRole;
}

// ---- Mock Repositories & Services ----

const mockPermissionRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockCustomRoleRepo = {
  findOne: jest.fn(),
};

const mockWorkspaceMemberRepo = {
  findOne: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  transaction: jest.fn((fn: any) => fn({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  })),
};

const mockPermissionAuditService = {
  record: jest.fn().mockResolvedValue(undefined),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  scanKeys: jest.fn().mockResolvedValue([]),
};

// ---- Test Suite ----

describe('Permission Resolution E2E', () => {
  let matrixService: PermissionMatrixService;
  let cacheService: PermissionCacheService;

  beforeEach(() => {
    jest.clearAllMocks();

    matrixService = new PermissionMatrixService(
      mockPermissionRepo as any,
      mockCustomRoleRepo as any,
      mockWorkspaceMemberRepo as any,
      mockAuditService as any,
      mockDataSource as any,
      { invalidateRolePermissions: jest.fn().mockResolvedValue(undefined) } as any,
      mockPermissionAuditService as any,
    );

    cacheService = new PermissionCacheService(
      mockRedisService as any,
      matrixService,
    );
  });

  // ---- Owner System Role ----

  describe('Owner system role - full access', () => {
    it('should grant all permissions for every resource type to owner', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.OWNER }),
      );

      for (const resourceType of Object.values(ResourceType)) {
        const permissions = RESOURCE_PERMISSIONS[resourceType];
        for (const perm of permissions) {
          const granted = await matrixService.checkPermission(
            USER_ID, WORKSPACE_ID, resourceType, perm,
          );
          expect(granted).toBe(true);
        }
      }
    });

    it('should grant owner access even for high-risk permissions like secrets:view_plaintext', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.OWNER }),
      );

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, ResourceType.SECRETS, 'view_plaintext',
      );
      expect(granted).toBe(true);
    });
  });

  // ---- Admin System Role ----

  describe('Admin system role - default permissions', () => {
    it('should grant admin full project access', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.ADMIN }),
      );

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'delete',
      );
      expect(granted).toBe(true);
    });

    it('should deny admin secrets:view_plaintext by default', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.ADMIN }),
      );

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'secrets', 'view_plaintext',
      );
      expect(granted).toBe(false);
    });

    it('should deny admin workspace:manage_billing by default', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.ADMIN }),
      );

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'workspace', 'manage_billing',
      );
      expect(granted).toBe(false);
    });
  });

  // ---- Developer System Role ----

  describe('Developer system role - default permissions', () => {
    it('should grant developer projects:create but deny projects:delete', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );

      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'create')).toBe(true);
      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'delete')).toBe(false);
    });

    it('should grant developer stories:assign but deny workspace:manage_roles', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );

      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'stories', 'assign')).toBe(true);
      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'workspace', 'manage_roles')).toBe(false);
    });
  });

  // ---- Viewer System Role ----

  describe('Viewer system role - read-only', () => {
    it('should grant viewer read-only access to projects and stories', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.VIEWER }),
      );

      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'read')).toBe(true);
      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'create')).toBe(false);
      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'stories', 'read')).toBe(true);
      expect(await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'stories', 'create')).toBe(false);
    });

    it('should deny viewer all secret access', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.VIEWER }),
      );

      for (const perm of RESOURCE_PERMISSIONS[ResourceType.SECRETS]) {
        const granted = await matrixService.checkPermission(USER_ID, WORKSPACE_ID, 'secrets', perm);
        expect(granted).toBe(false);
      }
    });
  });

  // ---- Custom Role ----

  describe('Custom role - inheritance and overrides', () => {
    it('should inherit base_role (developer) permissions when no explicit overrides', async () => {
      const customRole = createMockCustomRole({ baseRole: BaseRole.DEVELOPER });
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRole,
          customRoleId: customRole.id,
        }),
      );
      mockPermissionRepo.findOne.mockResolvedValue(null); // no explicit override

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      expect(granted).toBe(true); // developer default = true for projects:create
    });

    it('should allow explicit override to grant where base_role denies', async () => {
      const customRole = createMockCustomRole({ baseRole: BaseRole.VIEWER });
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRole,
          customRoleId: customRole.id,
        }),
      );
      // Explicit grant for projects:create (viewer denies by default)
      mockPermissionRepo.findOne.mockResolvedValue({
        id: 'perm-1',
        roleId: ROLE_ID,
        resourceType: 'projects',
        permission: 'create',
        granted: true,
      });

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      expect(granted).toBe(true);
    });

    it('should allow explicit override to deny where base_role grants', async () => {
      const customRole = createMockCustomRole({ baseRole: BaseRole.ADMIN });
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRole,
          customRoleId: customRole.id,
        }),
      );
      // Explicit deny for projects:delete (admin grants by default)
      mockPermissionRepo.findOne.mockResolvedValue({
        id: 'perm-2',
        roleId: ROLE_ID,
        resourceType: 'projects',
        permission: 'delete',
        granted: false,
      });

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'delete',
      );
      expect(granted).toBe(false);
    });

    it('should deny all when custom role has no base_role (null) and no explicit permissions', async () => {
      const customRole = createMockCustomRole({ baseRole: null });
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRole,
          customRoleId: customRole.id,
        }),
      );
      mockPermissionRepo.findOne.mockResolvedValue(null);

      for (const resourceType of Object.values(ResourceType)) {
        const permissions = RESOURCE_PERMISSIONS[resourceType];
        for (const perm of permissions) {
          const granted = await matrixService.checkPermission(
            USER_ID, WORKSPACE_ID, resourceType, perm,
          );
          expect(granted).toBe(false);
        }
      }
    });
  });

  // ---- Non-Member ----

  describe('Non-member access', () => {
    it('should deny all permissions for non-member', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(null);

      const granted = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'read',
      );
      expect(granted).toBe(false);
    });
  });

  // ---- Cache Consistency ----

  describe('Cache consistency', () => {
    it('should return same result from cache as from DB', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );
      mockRedisService.get.mockResolvedValue(null); // cache miss

      const dbResult = await matrixService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      const cacheResult = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );

      expect(cacheResult).toBe(dbResult);
    });

    it('should serve from cache on second call', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );
      // First call: cache miss
      mockRedisService.get.mockResolvedValueOnce(null);
      // Second call: cache hit
      mockRedisService.get.mockResolvedValueOnce('1');

      await cacheService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'create');
      const secondResult = await cacheService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'create');

      expect(secondResult).toBe(true);
      // checkPermission on matrix service should only be called once (first call)
      expect(mockWorkspaceMemberRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache and re-check from DB after role change', async () => {
      // Setup: developer can create projects
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );
      mockRedisService.get.mockResolvedValue(null);

      const result1 = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      expect(result1).toBe(true);

      // Invalidate
      await cacheService.invalidateUserPermissions(WORKSPACE_ID, USER_ID);

      // Now simulate role change to viewer
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.VIEWER }),
      );
      mockRedisService.get.mockResolvedValue(null); // cache cleared

      const result2 = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      expect(result2).toBe(false);
    });

    it('should fall back to DB when Redis is unavailable', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis unavailable'));
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }),
      );

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
      expect(result).toBe(true); // Falls back to DB, developer can create
    });
  });
});
