/**
 * PermissionCheckService Tests
 * Story 20-10: Permission Analytics
 * Target: 15 tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionCheckService } from '../services/permission-check.service';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { PermissionCacheService } from '../../custom-roles/services/permission-cache.service';
import { PermissionMatrixService } from '../../custom-roles/services/permission-matrix.service';
import { CustomRoleService } from '../../custom-roles/services/custom-role.service';
import { ResourceType } from '../../../database/entities/role-permission.entity';

describe('PermissionCheckService', () => {
  let service: PermissionCheckService;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let permissionCacheService: jest.Mocked<PermissionCacheService>;
  let permissionMatrixService: jest.Mocked<PermissionMatrixService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const mockMember = {
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    role: WorkspaceRole.DEVELOPER,
    customRole: null,
    user: { email: 'test@example.com' },
  } as unknown as WorkspaceMember;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCheckService,
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            find: jest.fn().mockResolvedValue([mockMember]),
            findOne: jest.fn().mockResolvedValue(mockMember),
          },
        },
        {
          provide: PermissionCacheService,
          useValue: {
            checkPermission: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: PermissionMatrixService,
          useValue: {
            getEffectivePermissions: jest.fn().mockResolvedValue({
              userId: mockUserId,
              workspaceId: mockWorkspaceId,
              systemRole: WorkspaceRole.DEVELOPER,
              customRoleId: null,
              customRoleName: null,
              resources: [
                {
                  resourceType: 'projects',
                  permissions: [
                    { permission: 'create', granted: true, inherited: true },
                    { permission: 'read', granted: true, inherited: true },
                  ],
                },
              ],
            }),
          },
        },
        {
          provide: CustomRoleService,
          useValue: {
            listRoles: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<PermissionCheckService>(PermissionCheckService);
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    permissionCacheService = module.get(PermissionCacheService);
    permissionMatrixService = module.get(PermissionMatrixService);
  });

  describe('checkPermissions', () => {
    it('returns correct result for single check', async () => {
      const result = await service.checkPermissions({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        checks: [{ resource: 'projects', permission: 'create' }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].granted).toBe(true);
      expect(result.checkedAt).toBeDefined();
    });

    it('returns all results for batch checks', async () => {
      permissionCacheService.checkPermission
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.checkPermissions({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        checks: [
          { resource: 'projects', permission: 'create' },
          { resource: 'projects', permission: 'delete' },
        ],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].granted).toBe(true);
      expect(result.results[1].granted).toBe(false);
    });

    it('rejects more than 50 checks', async () => {
      const checks = Array.from({ length: 51 }, () => ({
        resource: 'projects',
        permission: 'create',
      }));

      await expect(
        service.checkPermissions({
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          checks,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns user role name', async () => {
      const result = await service.checkPermissions({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        checks: [{ resource: 'projects', permission: 'create' }],
      });

      expect(result.userRole).toBe(WorkspaceRole.DEVELOPER);
    });

    it('includes cacheHit indicator', async () => {
      const result = await service.checkPermissions({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        checks: [{ resource: 'projects', permission: 'create' }],
      });

      expect(result.cacheHit).toBeDefined();
    });

    it('validates resource types', async () => {
      await expect(
        service.checkPermissions({
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          checks: [{ resource: 'invalid_resource', permission: 'create' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates permission names', async () => {
      await expect(
        service.checkPermissions({
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          checks: [{ resource: 'projects', permission: 'invalid_perm' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserEffectivePermissions', () => {
    it('returns complete permission map', async () => {
      const result = await service.getUserEffectivePermissions(
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.userId).toBe(mockUserId);
      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(result.permissions).toBeDefined();
      expect(result.permissions.projects).toBeDefined();
    });

    it('for owner returns correct role name', async () => {
      permissionMatrixService.getEffectivePermissions.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        systemRole: WorkspaceRole.OWNER,
        customRoleId: null,
        customRoleName: null,
        resources: [
          {
            resourceType: 'projects',
            permissions: [
              { permission: 'create', granted: true, inherited: true, inheritedFrom: 'owner' },
            ],
          },
        ],
      });

      const result = await service.getUserEffectivePermissions(
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.roleName).toBe(WorkspaceRole.OWNER);
    });

    it('for custom role includes role name', async () => {
      permissionMatrixService.getEffectivePermissions.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        systemRole: WorkspaceRole.DEVELOPER,
        customRoleId: 'role-id',
        customRoleName: 'QA Lead',
        resources: [],
      });

      const result = await service.getUserEffectivePermissions(
        mockWorkspaceId,
        mockUserId,
      );

      expect(result.roleName).toBe('QA Lead');
    });

    it('throws for non-member', async () => {
      permissionMatrixService.getEffectivePermissions.mockRejectedValue(
        new NotFoundException('User not found in workspace'),
      );

      await expect(
        service.getUserEffectivePermissions(mockWorkspaceId, 'non-member'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getResourceAccessList', () => {
    it('returns members with permissions', async () => {
      const result = await service.getResourceAccessList(
        mockWorkspaceId,
        'projects',
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('validates resource type', async () => {
      await expect(
        service.getResourceAccessList(mockWorkspaceId, 'invalid_resource'),
      ).rejects.toThrow(BadRequestException);
    });

    it('groups by role for efficiency', async () => {
      const member2 = {
        ...mockMember,
        userId: '44444444-4444-4444-4444-444444444444',
        user: { email: 'test2@example.com' },
      } as unknown as WorkspaceMember;
      memberRepo.find.mockResolvedValue([mockMember, member2]);

      const result = await service.getResourceAccessList(
        mockWorkspaceId,
        'projects',
      );

      expect(result).toHaveLength(2);
    });

    it('returns empty array for no members', async () => {
      memberRepo.find.mockResolvedValue([]);

      const result = await service.getResourceAccessList(
        mockWorkspaceId,
        'projects',
      );

      expect(result).toEqual([]);
    });
  });
});
