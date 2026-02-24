/**
 * PermissionMatrixController Tests
 *
 * Story 20-2: Permission Matrix
 * Target: 20+ tests covering all endpoints, auth guards, validation
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionMatrixController } from '../controllers/permission-matrix.controller';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { ResourceType, RESOURCE_PERMISSIONS, BASE_ROLE_DEFAULTS } from '../../../database/entities/role-permission.entity';

describe('PermissionMatrixController', () => {
  let controller: PermissionMatrixController;
  let service: jest.Mocked<PermissionMatrixService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockRoleId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '44444444-4444-4444-4444-444444444444';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockReq = { user: { id: mockActorId } };

  const mockMatrix = {
    roleId: mockRoleId,
    roleName: 'qa-lead',
    displayName: 'QA Lead',
    baseRole: 'developer',
    resources: [
      {
        resourceType: 'projects',
        permissions: [
          { permission: 'create', granted: true, inherited: true, inheritedFrom: 'developer' },
          { permission: 'read', granted: true, inherited: true, inheritedFrom: 'developer' },
        ],
      },
    ],
  };

  const mockEffectivePermissions = {
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    systemRole: 'developer',
    customRoleId: null,
    customRoleName: null,
    resources: [],
  };

  beforeEach(async () => {
    const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionMatrixController],
      providers: [
        {
          provide: PermissionMatrixService,
          useValue: {
            getPermissionMatrix: jest.fn().mockResolvedValue(mockMatrix),
            setPermission: jest.fn().mockResolvedValue({ id: 'perm-1', granted: true }),
            setBulkPermissions: jest.fn().mockResolvedValue([]),
            bulkResourceAction: jest.fn().mockResolvedValue(undefined),
            resetPermissions: jest.fn().mockResolvedValue(undefined),
            getEffectivePermissions: jest.fn().mockResolvedValue(mockEffectivePermissions),
            checkPermission: jest.fn().mockResolvedValue(true),
            getResourceDefinitions: jest.fn().mockReturnValue(RESOURCE_PERMISSIONS),
            getBaseRoleDefaults: jest.fn().mockReturnValue(BASE_ROLE_DEFAULTS),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RoleGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<PermissionMatrixController>(PermissionMatrixController);
    service = module.get(PermissionMatrixService);
  });

  describe('getResourceDefinitions', () => {
    it('should return resource definitions', async () => {
      const result = await controller.getResourceDefinitions(mockWorkspaceId);
      expect(result.resources).toBeDefined();
      expect(service.getResourceDefinitions).toHaveBeenCalled();
    });

    it('should wrap result in resources key', async () => {
      const result = await controller.getResourceDefinitions(mockWorkspaceId);
      expect(result).toHaveProperty('resources');
    });
  });

  describe('getBaseRoleDefaults', () => {
    it('should return base role defaults', async () => {
      const result = await controller.getBaseRoleDefaults(mockWorkspaceId);
      expect(result.defaults).toBeDefined();
      expect(service.getBaseRoleDefaults).toHaveBeenCalled();
    });

    it('should wrap result in defaults key', async () => {
      const result = await controller.getBaseRoleDefaults(mockWorkspaceId);
      expect(result).toHaveProperty('defaults');
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return effective permissions for a user', async () => {
      const result = await controller.getEffectivePermissions(
        mockWorkspaceId, mockUserId,
      );
      expect(result).toEqual(mockEffectivePermissions);
      expect(service.getEffectivePermissions).toHaveBeenCalledWith(
        mockUserId, mockWorkspaceId,
      );
    });
  });

  describe('getPermissionMatrix', () => {
    it('should return the permission matrix for a role', async () => {
      const result = await controller.getPermissionMatrix(mockWorkspaceId, mockRoleId);
      expect(result).toEqual(mockMatrix);
      expect(service.getPermissionMatrix).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId,
      );
    });
  });

  describe('setPermission', () => {
    it('should set a single permission', async () => {
      const dto = {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      };

      const result = await controller.setPermission(
        mockWorkspaceId, mockRoleId, dto, mockReq,
      );

      expect(service.setPermission).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, dto, mockActorId,
      );
    });

    it('should extract actor ID from request', async () => {
      const dto = {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      };

      await controller.setPermission(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.setPermission).toHaveBeenCalledWith(
        expect.any(String), expect.any(String), expect.any(Object), mockActorId,
      );
    });
  });

  describe('setBulkPermissions', () => {
    it('should set multiple permissions', async () => {
      const dto = {
        permissions: [
          { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
          { resourceType: ResourceType.PROJECTS, permission: 'delete', granted: false },
        ],
      };

      await controller.setBulkPermissions(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.setBulkPermissions).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, dto.permissions, mockActorId,
      );
    });
  });

  describe('bulkResourceAction', () => {
    it('should call bulkResourceAction with allow_all', async () => {
      const dto = {
        resourceType: ResourceType.PROJECTS,
        action: 'allow_all' as const,
      };

      await controller.bulkResourceAction(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.bulkResourceAction).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, 'allow_all', mockActorId,
      );
    });

    it('should call bulkResourceAction with deny_all', async () => {
      const dto = {
        resourceType: ResourceType.AGENTS,
        action: 'deny_all' as const,
      };

      await controller.bulkResourceAction(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.bulkResourceAction).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, ResourceType.AGENTS, 'deny_all', mockActorId,
      );
    });
  });

  describe('resetPermissions', () => {
    it('should reset all permissions (no resource type)', async () => {
      const dto = {};

      await controller.resetPermissions(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.resetPermissions).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, undefined, mockActorId,
      );
    });

    it('should reset specific resource type permissions', async () => {
      const dto = { resourceType: ResourceType.PROJECTS };

      await controller.resetPermissions(mockWorkspaceId, mockRoleId, dto, mockReq);

      expect(service.resetPermissions).toHaveBeenCalledWith(
        mockRoleId, mockWorkspaceId, ResourceType.PROJECTS, mockActorId,
      );
    });
  });
});
