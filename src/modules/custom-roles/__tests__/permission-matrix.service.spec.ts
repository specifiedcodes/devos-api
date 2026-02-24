/**
 * PermissionMatrixService Tests
 *
 * Story 20-2: Permission Matrix
 * Target: 70+ tests covering getPermissionMatrix, setPermission, setBulkPermissions,
 * bulkResourceAction, resetPermissions, getEffectivePermissions, checkPermission,
 * getResourceDefinitions, getBaseRoleDefaults, validatePermission, getInheritedPermission,
 * loadAndValidateRole
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import {
  RolePermission,
  ResourceType,
  RESOURCE_PERMISSIONS,
  BASE_ROLE_DEFAULTS,
} from '../../../database/entities/role-permission.entity';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';
import { AuditService } from '../../../shared/audit/audit.service';

describe('PermissionMatrixService', () => {
  let service: PermissionMatrixService;
  let permissionRepo: jest.Mocked<Repository<RolePermission>>;
  let customRoleRepo: jest.Mocked<Repository<CustomRole>>;
  let workspaceMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let auditService: jest.Mocked<AuditService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockRoleId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '44444444-4444-4444-4444-444444444444';

  function createMockRole(overrides?: Partial<CustomRole>): Partial<CustomRole> {
    return {
      id: mockRoleId,
      workspaceId: mockWorkspaceId,
      name: 'qa-lead',
      displayName: 'QA Lead',
      description: 'Quality assurance team lead',
      color: '#6366f1',
      icon: 'shield',
      baseRole: BaseRole.DEVELOPER,
      isSystem: false,
      isActive: true,
      priority: 0,
      createdBy: mockActorId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createMockPermission(overrides?: Partial<RolePermission>): Partial<RolePermission> {
    return {
      id: 'perm-1',
      roleId: mockRoleId,
      resourceType: ResourceType.PROJECTS,
      permission: 'create',
      granted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createMockMember(overrides?: Partial<WorkspaceMember>): Partial<WorkspaceMember> {
    return {
      id: 'member-1',
      userId: mockUserId,
      workspaceId: mockWorkspaceId,
      role: WorkspaceRole.DEVELOPER,
      customRoleId: null,
      customRole: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  // Transaction mock: executes callback with a mock manager
  const mockTransactionManager = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((_, dto) => ({ ...dto, id: 'new-perm' })),
    save: jest.fn().mockImplementation((entity) => {
      if (Array.isArray(entity)) return Promise.resolve(entity);
      return Promise.resolve({ ...entity, id: entity.id || 'new-perm' });
    }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionMatrixService,
        {
          provide: getRepositoryToken(RolePermission),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'new-perm' })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id || 'new-perm' })),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(CustomRole),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation(async (cb) => cb(mockTransactionManager)),
          },
        },
      ],
    }).compile();

    service = module.get<PermissionMatrixService>(PermissionMatrixService);
    permissionRepo = module.get(getRepositoryToken(RolePermission));
    customRoleRepo = module.get(getRepositoryToken(CustomRole));
    workspaceMemberRepo = module.get(getRepositoryToken(WorkspaceMember));
    auditService = module.get(AuditService);
    dataSource = module.get(DataSource);
  });

  // =========================================================================
  // getResourceDefinitions & getBaseRoleDefaults
  // =========================================================================

  describe('getResourceDefinitions', () => {
    it('should return all resource types and their permissions', () => {
      const result = service.getResourceDefinitions();
      expect(Object.keys(result)).toHaveLength(8);
      expect(result[ResourceType.PROJECTS]).toContain('create');
      expect(result[ResourceType.PROJECTS]).toContain('read');
      expect(result[ResourceType.AGENTS]).toContain('view');
      expect(result[ResourceType.WORKSPACE]).toContain('manage_roles');
    });

    it('should return a copy, not the original reference', () => {
      const r1 = service.getResourceDefinitions();
      const r2 = service.getResourceDefinitions();
      expect(r1).not.toBe(r2);
    });
  });

  describe('getBaseRoleDefaults', () => {
    it('should return defaults for all base roles', () => {
      const result = service.getBaseRoleDefaults();
      expect(Object.keys(result)).toContain('owner');
      expect(Object.keys(result)).toContain('admin');
      expect(Object.keys(result)).toContain('developer');
      expect(Object.keys(result)).toContain('viewer');
      expect(Object.keys(result)).toContain('none');
    });

    it('should give owner full access', () => {
      const result = service.getBaseRoleDefaults();
      expect(result.owner.projects.create).toBe(true);
      expect(result.owner.projects.delete).toBe(true);
      expect(result.owner.secrets.view_plaintext).toBe(true);
    });

    it('should deny viewer most write permissions', () => {
      const result = service.getBaseRoleDefaults();
      expect(result.viewer.projects.create).toBe(false);
      expect(result.viewer.projects.delete).toBe(false);
      expect(result.viewer.projects.read).toBe(true);
    });

    it('should deny none all permissions', () => {
      const result = service.getBaseRoleDefaults();
      const noneDefaults = result.none;
      for (const resource of Object.values(noneDefaults)) {
        for (const granted of Object.values(resource)) {
          expect(granted).toBe(false);
        }
      }
    });
  });

  // =========================================================================
  // getPermissionMatrix
  // =========================================================================

  describe('getPermissionMatrix', () => {
    it('should return full permission matrix for a role with inherited defaults', async () => {
      const mockRole = createMockRole();
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);

      expect(result.roleId).toBe(mockRoleId);
      expect(result.roleName).toBe('qa-lead');
      expect(result.baseRole).toBe(BaseRole.DEVELOPER);
      expect(result.resources).toHaveLength(8);
    });

    it('should show inherited permissions from base role when no explicit overrides', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);
      const projects = result.resources.find((r) => r.resourceType === 'projects');

      const createPerm = projects!.permissions.find((p) => p.permission === 'create');
      expect(createPerm!.granted).toBe(true); // developer can create
      expect(createPerm!.inherited).toBe(true);
      expect(createPerm!.inheritedFrom).toBe('developer');
    });

    it('should show explicit override taking precedence over inherited', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      const explicitPerm = createMockPermission({
        resourceType: ResourceType.PROJECTS,
        permission: 'delete',
        granted: true, // developer default is false for delete
      });
      permissionRepo.find.mockResolvedValue([explicitPerm as RolePermission]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);
      const projects = result.resources.find((r) => r.resourceType === 'projects');
      const deletePerm = projects!.permissions.find((p) => p.permission === 'delete');

      expect(deletePerm!.granted).toBe(true);
      expect(deletePerm!.inherited).toBe(false);
    });

    it('should throw NotFoundException if role not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getPermissionMatrix(mockRoleId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle role with no base role (all defaults to false)', async () => {
      customRoleRepo.findOne.mockResolvedValue(
        createMockRole({ baseRole: null }) as CustomRole,
      );
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);
      const projects = result.resources.find((r) => r.resourceType === 'projects');
      const createPerm = projects!.permissions.find((p) => p.permission === 'create');

      expect(createPerm!.granted).toBe(false);
      expect(createPerm!.inherited).toBe(false);
    });

    it('should not reject system roles for read operations', async () => {
      customRoleRepo.findOne.mockResolvedValue(
        createMockRole({ isSystem: true }) as CustomRole,
      );
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);
      expect(result.roleId).toBe(mockRoleId);
    });

    it('should include all 8 resource types in the matrix', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getPermissionMatrix(mockRoleId, mockWorkspaceId);
      const resourceTypes = result.resources.map((r) => r.resourceType);

      expect(resourceTypes).toContain(ResourceType.PROJECTS);
      expect(resourceTypes).toContain(ResourceType.AGENTS);
      expect(resourceTypes).toContain(ResourceType.STORIES);
      expect(resourceTypes).toContain(ResourceType.DEPLOYMENTS);
      expect(resourceTypes).toContain(ResourceType.SECRETS);
      expect(resourceTypes).toContain(ResourceType.INTEGRATIONS);
      expect(resourceTypes).toContain(ResourceType.WORKSPACE);
      expect(resourceTypes).toContain(ResourceType.COST_MANAGEMENT);
    });
  });

  // =========================================================================
  // setPermission
  // =========================================================================

  describe('setPermission', () => {
    it('should create new permission entry when none exists', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      permissionRepo.findOne.mockResolvedValue(null);

      const result = await service.setPermission(mockRoleId, mockWorkspaceId, {
        resourceType: ResourceType.PROJECTS,
        permission: 'delete',
        granted: true,
      }, mockActorId);

      expect(permissionRepo.create).toHaveBeenCalledWith({
        roleId: mockRoleId,
        resourceType: ResourceType.PROJECTS,
        permission: 'delete',
        granted: true,
      });
      expect(permissionRepo.save).toHaveBeenCalled();
    });

    it('should update existing permission entry', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      const existing = createMockPermission({ granted: false });
      permissionRepo.findOne.mockResolvedValue(existing as RolePermission);

      await service.setPermission(mockRoleId, mockWorkspaceId, {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      }, mockActorId);

      expect(permissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ granted: true }),
      );
    });

    it('should throw BadRequestException for invalid resource type', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await expect(
        service.setPermission(mockRoleId, mockWorkspaceId, {
          resourceType: 'invalid_type',
          permission: 'create',
          granted: true,
        }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid permission name', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await expect(
        service.setPermission(mockRoleId, mockWorkspaceId, {
          resourceType: ResourceType.PROJECTS,
          permission: 'invalid_permission',
          granted: true,
        }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent role', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setPermission(mockRoleId, mockWorkspaceId, {
          resourceType: ResourceType.PROJECTS,
          permission: 'create',
          granted: true,
        }, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for system role', async () => {
      customRoleRepo.findOne.mockResolvedValue(
        createMockRole({ isSystem: true }) as CustomRole,
      );

      await expect(
        service.setPermission(mockRoleId, mockWorkspaceId, {
          resourceType: ResourceType.PROJECTS,
          permission: 'create',
          granted: true,
        }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event for permission change', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      permissionRepo.findOne.mockResolvedValue(null);

      await service.setPermission(mockRoleId, mockWorkspaceId, {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      }, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        expect.any(String),
        'role_permission',
        mockRoleId,
        expect.objectContaining({
          action: 'set_permission',
          resourceType: ResourceType.PROJECTS,
          permission: 'create',
        }),
      );
    });

    it('should accept all valid permission combinations for projects', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      permissionRepo.findOne.mockResolvedValue(null);

      for (const perm of RESOURCE_PERMISSIONS[ResourceType.PROJECTS]) {
        await expect(
          service.setPermission(mockRoleId, mockWorkspaceId, {
            resourceType: ResourceType.PROJECTS,
            permission: perm,
            granted: true,
          }, mockActorId),
        ).resolves.toBeDefined();
      }
    });
  });

  // =========================================================================
  // setBulkPermissions
  // =========================================================================

  describe('setBulkPermissions', () => {
    it('should set multiple permissions in a transaction', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      const permissions = [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
        { resourceType: ResourceType.PROJECTS, permission: 'delete', granted: false },
      ];

      const result = await service.setBulkPermissions(
        mockRoleId, mockWorkspaceId, permissions, mockActorId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should validate all permissions before applying any', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      const permissions = [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
        { resourceType: 'invalid_type', permission: 'create', granted: true },
      ];

      await expect(
        service.setBulkPermissions(mockRoleId, mockWorkspaceId, permissions, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent role', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      const permissions = [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
      ];

      await expect(
        service.setBulkPermissions(mockRoleId, mockWorkspaceId, permissions, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit with all changed permissions', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      const permissions = [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
      ];

      await service.setBulkPermissions(mockRoleId, mockWorkspaceId, permissions, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        expect.any(String),
        'role_permission',
        mockRoleId,
        expect.objectContaining({
          action: 'set_bulk_permissions',
          permissionCount: 1,
        }),
      );
    });

    it('should reject empty permissions array', async () => {
      await expect(
        service.setBulkPermissions(mockRoleId, mockWorkspaceId, [], mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update existing permissions in bulk', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      mockTransactionManager.findOne.mockResolvedValue(createMockPermission({ granted: false }));

      const permissions = [
        { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
      ];

      await service.setBulkPermissions(mockRoleId, mockWorkspaceId, permissions, mockActorId);

      expect(mockTransactionManager.save).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // bulkResourceAction
  // =========================================================================

  describe('bulkResourceAction', () => {
    beforeEach(() => {
      mockTransactionManager.find.mockReset().mockResolvedValue([]);
      mockTransactionManager.findOne.mockReset().mockResolvedValue(null);
      mockTransactionManager.create.mockReset().mockImplementation((_, dto) => ({ ...dto, id: 'new-perm' }));
      mockTransactionManager.save.mockReset().mockImplementation((entity) => {
        if (Array.isArray(entity)) return Promise.resolve(entity);
        return Promise.resolve({ ...entity, id: entity.id || 'new-perm' });
      });
      mockTransactionManager.delete.mockReset().mockResolvedValue({ affected: 1 });
    });

    it('should set all permissions for a resource to true (allow_all)', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      mockTransactionManager.find.mockResolvedValue([]); // no existing permissions

      await service.bulkResourceAction(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      // 5 permissions for projects created as new entries
      expect(mockTransactionManager.create).toHaveBeenCalledTimes(
        RESOURCE_PERMISSIONS[ResourceType.PROJECTS].length,
      );
      // Batch save called once
      expect(mockTransactionManager.save).toHaveBeenCalled();
    });

    it('should set all permissions for a resource to false (deny_all)', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      mockTransactionManager.find.mockResolvedValue([]); // no existing permissions

      await service.bulkResourceAction(
        mockRoleId, mockWorkspaceId, ResourceType.AGENTS, 'deny_all', mockActorId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid resource type', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await expect(
        service.bulkResourceAction(
          mockRoleId, mockWorkspaceId, 'invalid' as ResourceType, 'allow_all', mockActorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent role', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.bulkResourceAction(
          mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit event for bulk resource action', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      mockTransactionManager.find.mockResolvedValue([]); // no existing permissions

      await service.bulkResourceAction(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
      );

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        expect.any(String),
        'role_permission',
        mockRoleId,
        expect.objectContaining({
          action: 'bulk_resource_action',
          bulkAction: 'allow_all',
        }),
      );
    });

    it('should update existing permissions during bulk resource action', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);
      const existing = createMockPermission({ granted: false, permission: 'create' });
      mockTransactionManager.find.mockResolvedValue([existing]); // one existing permission

      await service.bulkResourceAction(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
      );

      // Batch save called with all permissions (1 existing updated + 4 new)
      expect(mockTransactionManager.save).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resetPermissions
  // =========================================================================

  describe('resetPermissions', () => {
    it('should delete all explicit permissions for a role (global reset)', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await service.resetPermissions(mockRoleId, mockWorkspaceId, undefined, mockActorId);

      expect(mockTransactionManager.delete).toHaveBeenCalledWith(
        RolePermission, { roleId: mockRoleId },
      );
    });

    it('should delete only specific resource type permissions (resource reset)', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await service.resetPermissions(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, mockActorId,
      );

      expect(mockTransactionManager.delete).toHaveBeenCalledWith(
        RolePermission, { roleId: mockRoleId, resourceType: ResourceType.PROJECTS },
      );
    });

    it('should throw BadRequestException for invalid resource type', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await expect(
        service.resetPermissions(mockRoleId, mockWorkspaceId, 'invalid_type', mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent role', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resetPermissions(mockRoleId, mockWorkspaceId, undefined, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit event for reset', async () => {
      customRoleRepo.findOne.mockResolvedValue(createMockRole() as CustomRole);

      await service.resetPermissions(mockRoleId, mockWorkspaceId, undefined, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        expect.any(String),
        'role_permission',
        mockRoleId,
        expect.objectContaining({
          action: 'reset_permissions',
          resourceType: 'all',
        }),
      );
    });
  });

  // =========================================================================
  // getEffectivePermissions
  // =========================================================================

  describe('getEffectivePermissions', () => {
    it('should return full access for owner role', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.OWNER }) as WorkspaceMember,
      );

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);

      expect(result.systemRole).toBe(WorkspaceRole.OWNER);
      for (const resource of result.resources) {
        for (const perm of resource.permissions) {
          expect(perm.granted).toBe(true);
        }
      }
    });

    it('should return system role defaults when no custom role', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }) as WorkspaceMember,
      );

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);

      expect(result.systemRole).toBe(WorkspaceRole.DEVELOPER);
      const projects = result.resources.find((r) => r.resourceType === 'projects');
      const createPerm = projects!.permissions.find((p) => p.permission === 'create');
      expect(createPerm!.granted).toBe(true);

      const deletePerm = projects!.permissions.find((p) => p.permission === 'delete');
      expect(deletePerm!.granted).toBe(false);
    });

    it('should use custom role permissions when assigned', async () => {
      const customRole = createMockRole();
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      // Explicit override: grant delete for projects
      permissionRepo.find.mockResolvedValue([
        createMockPermission({
          resourceType: ResourceType.PROJECTS,
          permission: 'delete',
          granted: true,
        }) as RolePermission,
      ]);

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);

      expect(result.customRoleId).toBe(mockRoleId);
      const projects = result.resources.find((r) => r.resourceType === 'projects');
      const deletePerm = projects!.permissions.find((p) => p.permission === 'delete');
      expect(deletePerm!.granted).toBe(true);
      expect(deletePerm!.inherited).toBe(false);
    });

    it('should throw NotFoundException if user not in workspace', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getEffectivePermissions(mockUserId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include customRoleName in response when assigned', async () => {
      const customRole = createMockRole({ displayName: 'Test Role' });
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);
      expect(result.customRoleName).toBe('Test Role');
    });

    it('should return null for customRoleId when no custom role', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember() as WorkspaceMember,
      );

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);
      expect(result.customRoleId).toBeNull();
      expect(result.customRoleName).toBeNull();
    });

    it('should handle custom role with no base role', async () => {
      const customRole = createMockRole({ baseRole: null });
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);
      const projects = result.resources.find((r) => r.resourceType === 'projects');
      const createPerm = projects!.permissions.find((p) => p.permission === 'create');
      expect(createPerm!.granted).toBe(false);
    });

    it('should return all 8 resource types', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember() as WorkspaceMember,
      );

      const result = await service.getEffectivePermissions(mockUserId, mockWorkspaceId);
      expect(result.resources).toHaveLength(8);
    });
  });

  // =========================================================================
  // checkPermission
  // =========================================================================

  describe('checkPermission', () => {
    it('should always return true for owner', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.OWNER }) as WorkspaceMember,
      );

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.SECRETS, 'view_plaintext',
      );

      expect(result).toBe(true);
    });

    it('should return false if user not in workspace', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(null);

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );

      expect(result).toBe(false);
    });

    it('should use system role defaults when no custom role', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }) as WorkspaceMember,
      );

      const canCreate = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );
      expect(canCreate).toBe(true);

      const canDelete = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'delete',
      );
      expect(canDelete).toBe(false);
    });

    it('should use explicit custom role permission when exists', async () => {
      const customRole = createMockRole();
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      // Explicit override
      permissionRepo.findOne.mockResolvedValue(
        createMockPermission({ granted: true, permission: 'delete' }) as RolePermission,
      );

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'delete',
      );

      expect(result).toBe(true);
    });

    it('should fall back to base role inherited defaults when no explicit permission', async () => {
      const customRole = createMockRole({ baseRole: BaseRole.DEVELOPER });
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      permissionRepo.findOne.mockResolvedValue(null);

      const canCreate = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );
      expect(canCreate).toBe(true); // developer default

      const canDelete = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'delete',
      );
      expect(canDelete).toBe(false); // developer default
    });

    it('should return false for custom role with no base role and no explicit permission', async () => {
      const customRole = createMockRole({ baseRole: null });
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      permissionRepo.findOne.mockResolvedValue(null);

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );

      expect(result).toBe(false);
    });

    it('should return system role default for viewer', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.VIEWER }) as WorkspaceMember,
      );

      const canRead = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'read',
      );
      expect(canRead).toBe(true);

      const canCreate = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );
      expect(canCreate).toBe(false);
    });

    it('should handle unknown permission gracefully', async () => {
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({ role: WorkspaceRole.DEVELOPER }) as WorkspaceMember,
      );

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, 'unknown_resource', 'unknown_permission',
      );

      expect(result).toBe(false);
    });

    it('should deny explicit false even when base role would allow', async () => {
      const customRole = createMockRole({ baseRole: BaseRole.DEVELOPER });
      workspaceMemberRepo.findOne.mockResolvedValue(
        createMockMember({
          role: WorkspaceRole.DEVELOPER,
          customRoleId: mockRoleId,
          customRole: customRole as CustomRole,
        }) as WorkspaceMember,
      );
      // Explicit deny overrides base role allow
      permissionRepo.findOne.mockResolvedValue(
        createMockPermission({ granted: false, permission: 'create' }) as RolePermission,
      );

      const result = await service.checkPermission(
        mockUserId, mockWorkspaceId, ResourceType.PROJECTS, 'create',
      );

      expect(result).toBe(false);
    });
  });
});
