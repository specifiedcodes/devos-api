/**
 * Permission Cache Invalidation Integration Tests
 *
 * Story 20-3: Permission Enforcement Middleware
 * Tests that PermissionMatrixService and CustomRoleService correctly
 * trigger cache invalidation on permission/role changes.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import { CustomRoleService } from '../services/custom-role.service';
import {
  RolePermission,
  ResourceType,
} from '../../../database/entities/role-permission.entity';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { RedisService } from '../../redis/redis.service';
import { PermissionAuditService } from '../../permission-audit/services/permission-audit.service';

describe('Permission Cache Invalidation Integration', () => {
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockRoleId = '33333333-3333-3333-3333-333333333333';

  // ---- PermissionMatrixService Cache Invalidation ----

  describe('PermissionMatrixService invalidation', () => {
    let matrixService: PermissionMatrixService;
    let cacheService: jest.Mocked<Partial<PermissionCacheService>>;
    let permissionRepo: jest.Mocked<Partial<Repository<RolePermission>>>;
    let customRoleRepo: jest.Mocked<Partial<Repository<CustomRole>>>;
    let workspaceMemberRepo: jest.Mocked<Partial<Repository<WorkspaceMember>>>;
    let auditService: jest.Mocked<Partial<AuditService>>;
    let dataSource: any;

    beforeEach(async () => {
      cacheService = {
        invalidateRolePermissions: jest.fn().mockResolvedValue(undefined),
        invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
        invalidateAll: jest.fn().mockResolvedValue(undefined),
        checkPermission: jest.fn(),
      };

      permissionRepo = {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((data) => data),
        save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'perm-1', ...data })),
      };

      customRoleRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: mockRoleId,
          workspaceId: mockWorkspaceId,
          name: 'test-role',
          displayName: 'Test Role',
          baseRole: BaseRole.DEVELOPER,
          isSystem: false,
        }),
      };

      workspaceMemberRepo = {
        findOne: jest.fn(),
      };

      auditService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      const mockManager = {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation((data) => Promise.resolve(Array.isArray(data) ? data : { id: 'perm-new', ...data })),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PermissionMatrixService,
          { provide: getRepositoryToken(RolePermission), useValue: permissionRepo },
          { provide: getRepositoryToken(CustomRole), useValue: customRoleRepo },
          { provide: getRepositoryToken(WorkspaceMember), useValue: workspaceMemberRepo },
          { provide: AuditService, useValue: auditService },
          { provide: DataSource, useValue: dataSource },
          { provide: PermissionCacheService, useValue: cacheService },
          { provide: PermissionAuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();

      matrixService = module.get<PermissionMatrixService>(PermissionMatrixService);
    });

    it('should invalidate cache after setPermission', async () => {
      permissionRepo.findOne!.mockResolvedValue(null);

      await matrixService.setPermission(mockRoleId, mockWorkspaceId, {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      }, mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should invalidate cache after setBulkPermissions', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((_entity: any, data: any) => data),
        save: jest.fn().mockImplementation((data: any) => Promise.resolve({ id: 'perm-bulk', ...data })),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(mockManager));

      await matrixService.setBulkPermissions(mockRoleId, mockWorkspaceId, [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
        { resourceType: ResourceType.AGENTS, permission: 'view', granted: true },
      ], mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should invalidate cache after bulkResourceAction', async () => {
      await matrixService.bulkResourceAction(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
      );

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should invalidate cache after resetPermissions', async () => {
      await matrixService.resetPermissions(mockRoleId, mockWorkspaceId, undefined, mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should invalidate cache after resetPermissions with specific resource', async () => {
      await matrixService.resetPermissions(mockRoleId, mockWorkspaceId, 'projects', mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  // ---- CustomRoleService Cache Invalidation ----

  describe('CustomRoleService invalidation', () => {
    let roleService: CustomRoleService;
    let cacheService: jest.Mocked<Partial<PermissionCacheService>>;
    let customRoleRepo: jest.Mocked<Partial<Repository<CustomRole>>>;
    let workspaceMemberRepo: jest.Mocked<Partial<Repository<WorkspaceMember>>>;
    let auditService: jest.Mocked<Partial<AuditService>>;
    let dataSource: any;

    beforeEach(async () => {
      cacheService = {
        invalidateRolePermissions: jest.fn().mockResolvedValue(undefined),
        invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      };

      customRoleRepo = {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
        remove: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      };

      workspaceMemberRepo = {
        count: jest.fn().mockResolvedValue(0),
      };

      auditService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      dataSource = {
        transaction: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CustomRoleService,
          { provide: getRepositoryToken(CustomRole), useValue: customRoleRepo },
          { provide: getRepositoryToken(WorkspaceMember), useValue: workspaceMemberRepo },
          { provide: AuditService, useValue: auditService },
          { provide: DataSource, useValue: dataSource },
          { provide: PermissionCacheService, useValue: cacheService },
          { provide: PermissionAuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();

      roleService = module.get<CustomRoleService>(CustomRoleService);
    });

    it('should invalidate cache after deleteRole', async () => {
      customRoleRepo.findOne!.mockResolvedValue({
        id: mockRoleId,
        workspaceId: mockWorkspaceId,
        name: 'test-role',
        isSystem: false,
      } as any);

      await roleService.deleteRole(mockRoleId, mockWorkspaceId, mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should invalidate cache after updateRole when baseRole changes', async () => {
      const existingRole = {
        id: mockRoleId,
        workspaceId: mockWorkspaceId,
        name: 'test-role',
        displayName: 'Test Role',
        description: 'Test',
        color: '#000',
        icon: 'shield',
        baseRole: BaseRole.DEVELOPER,
        isSystem: false,
        isActive: true,
      };
      customRoleRepo.findOne!.mockResolvedValue(existingRole as any);
      customRoleRepo.save!.mockResolvedValue({
        ...existingRole,
        baseRole: BaseRole.VIEWER,
      } as any);

      await roleService.updateRole(mockRoleId, mockWorkspaceId, {
        baseRole: BaseRole.VIEWER,
      } as any, mockActorId);

      expect(cacheService.invalidateRolePermissions).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should NOT invalidate cache after updateRole when baseRole does NOT change', async () => {
      const existingRole = {
        id: mockRoleId,
        workspaceId: mockWorkspaceId,
        name: 'test-role',
        displayName: 'Test Role',
        description: 'Test',
        color: '#000',
        icon: 'shield',
        baseRole: BaseRole.DEVELOPER,
        isSystem: false,
        isActive: true,
      };
      customRoleRepo.findOne!.mockResolvedValue(existingRole as any);
      customRoleRepo.save!.mockResolvedValue({
        ...existingRole,
        displayName: 'Updated Name',
      } as any);

      await roleService.updateRole(mockRoleId, mockWorkspaceId, {
        displayName: 'Updated Name',
      } as any, mockActorId);

      expect(cacheService.invalidateRolePermissions).not.toHaveBeenCalled();
    });
  });
});
