/**
 * CustomRoleService Tests
 *
 * Story 20-1: Custom Role Definition
 * Target: 30+ tests covering CRUD, validation, clone, reorder, member listing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CustomRoleService, AVAILABLE_ICONS } from '../services/custom-role.service';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { AuditService } from '../../../shared/audit/audit.service';

describe('CustomRoleService', () => {
  let service: CustomRoleService;
  let customRoleRepo: jest.Mocked<Repository<CustomRole>>;
  let workspaceMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let auditService: jest.Mocked<AuditService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockRoleId = '33333333-3333-3333-3333-333333333333';

  function createMockRole(): Partial<CustomRole> {
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
    };
  }

  let mockRole: Partial<CustomRole>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ maxPriority: 0 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRoleService,
        {
          provide: getRepositoryToken(CustomRole),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: mockRoleId })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...mockRole, ...entity })),
            remove: jest.fn().mockResolvedValue(undefined),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
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
            transaction: jest.fn().mockImplementation(async (cb) => {
              const manager = {
                update: jest.fn().mockResolvedValue(undefined),
                count: jest.fn().mockResolvedValue(0),
                createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                create: jest.fn().mockImplementation((_entity: any, dto: any) => ({ ...dto, id: mockRoleId })),
                save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...mockRole, ...entity })),
              };
              return cb(manager);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CustomRoleService>(CustomRoleService);
    customRoleRepo = module.get(getRepositoryToken(CustomRole));
    workspaceMemberRepo = module.get(getRepositoryToken(WorkspaceMember));
    auditService = module.get(AuditService);
    dataSource = module.get(DataSource);

    // Create fresh mockRole for each test to prevent mutation leaks
    mockRole = createMockRole();
  });

  describe('listRoles', () => {
    it('should return system roles and custom roles', async () => {
      customRoleRepo.find.mockResolvedValue([mockRole as CustomRole]);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { role: 'owner', count: '1' },
        { role: 'developer', count: '3' },
      ]);

      const result = await service.listRoles(mockWorkspaceId);

      expect(result.systemRoles).toHaveLength(4);
      expect(result.systemRoles[0].name).toBe('owner');
      expect(result.systemRoles[0].isSystem).toBe(true);
      expect(result.customRoles).toHaveLength(1);
    });

    it('should return empty custom roles when none exist', async () => {
      customRoleRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.listRoles(mockWorkspaceId);

      expect(result.systemRoles).toHaveLength(4);
      expect(result.customRoles).toHaveLength(0);
    });

    it('should include member counts for system roles', async () => {
      customRoleRepo.find.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { role: 'owner', count: '2' },
        { role: 'admin', count: '3' },
      ]);

      const result = await service.listRoles(mockWorkspaceId);

      expect(result.systemRoles.find((r) => r.name === 'owner')?.memberCount).toBe(2);
      expect(result.systemRoles.find((r) => r.name === 'admin')?.memberCount).toBe(3);
      expect(result.systemRoles.find((r) => r.name === 'developer')?.memberCount).toBe(0);
    });
  });

  describe('getRole', () => {
    it('should return role with member count', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);
      workspaceMemberRepo.count.mockResolvedValue(5);

      const result = await service.getRole(mockRoleId, mockWorkspaceId);

      expect(result.id).toBe(mockRoleId);
      expect(result.memberCount).toBe(5);
    });

    it('should throw NotFoundException when role not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(service.getRole(mockRoleId, mockWorkspaceId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include creator email when available', async () => {
      const roleWithCreator = {
        ...mockRole,
        creator: { email: 'admin@test.com' },
      };
      customRoleRepo.findOne.mockResolvedValue(roleWithCreator as any);
      workspaceMemberRepo.count.mockResolvedValue(0);

      const result = await service.getRole(mockRoleId, mockWorkspaceId);

      expect((result as any).creatorName).toBe('admin@test.com');
    });
  });

  describe('createRole', () => {
    const createDto = {
      name: 'qa-lead',
      displayName: 'QA Lead',
      description: 'Quality assurance lead',
      color: '#3b82f6',
      icon: 'shield',
      baseRole: BaseRole.DEVELOPER,
    };

    it('should create a role successfully', async () => {
      customRoleRepo.findOne.mockResolvedValue(null); // name validation
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxPriority: 2 });

      const result = await service.createRole(mockWorkspaceId, createDto, mockActorId);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.name).toBe('qa-lead');
    });

    it('should throw BadRequestException when max roles reached', async () => {
      customRoleRepo.findOne.mockResolvedValue(null); // name validation passes
      // Override the transaction mock to simulate count >= 20
      (dataSource.transaction as jest.Mock).mockImplementationOnce(async (cb: any) => {
        const manager = {
          count: jest.fn().mockResolvedValue(20),
          createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          create: jest.fn().mockImplementation((_entity: any, dto: any) => ({ ...dto, id: mockRoleId })),
          save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...mockRole, ...entity })),
        };
        return cb(manager);
      });

      await expect(
        service.createRole(mockWorkspaceId, createDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for reserved names', async () => {
      await expect(
        service.createRole(mockWorkspaceId, { ...createDto, name: 'owner' }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for admin reserved name', async () => {
      await expect(
        service.createRole(mockWorkspaceId, { ...createDto, name: 'admin' }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when name already exists', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);

      await expect(
        service.createRole(mockWorkspaceId, createDto, mockActorId),
      ).rejects.toThrow(ConflictException);
    });

    it('should log audit event on creation', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await service.createRole(mockWorkspaceId, createDto, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        'create',
        'custom_role',
        expect.any(String),
        expect.objectContaining({ roleName: 'qa-lead' }),
      );
    });

    it('should use transaction for atomic count + create', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await service.createRole(mockWorkspaceId, createDto, mockActorId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('should assign next priority order', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxPriority: 5 });

      const result = await service.createRole(mockWorkspaceId, createDto, mockActorId);

      expect(result.priority).toBe(6);
    });
  });

  describe('updateRole', () => {
    const updateDto = { displayName: 'Updated QA Lead' };

    it('should update role successfully', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);

      const result = await service.updateRole(mockRoleId, mockWorkspaceId, updateDto, mockActorId);

      expect(customRoleRepo.save).toHaveBeenCalled();
      expect(result.displayName).toBe('Updated QA Lead');
    });

    it('should throw NotFoundException when role not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateRole(mockRoleId, mockWorkspaceId, updateDto, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for system roles', async () => {
      customRoleRepo.findOne.mockResolvedValue({
        ...mockRole,
        isSystem: true,
      } as CustomRole);

      await expect(
        service.updateRole(mockRoleId, mockWorkspaceId, updateDto, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should validate new name when changed', async () => {
      customRoleRepo.findOne
        .mockResolvedValueOnce(mockRole as CustomRole) // first call: find role
        .mockResolvedValueOnce(null); // second call: name uniqueness check

      await service.updateRole(
        mockRoleId,
        mockWorkspaceId,
        { name: 'new-name' },
        mockActorId,
      );

      expect(customRoleRepo.save).toHaveBeenCalled();
    });

    it('should reject reserved name on update', async () => {
      customRoleRepo.findOne.mockResolvedValueOnce(mockRole as CustomRole);

      await expect(
        service.updateRole(mockRoleId, mockWorkspaceId, { name: 'viewer' }, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit with before/after state', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);

      await service.updateRole(mockRoleId, mockWorkspaceId, updateDto, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        'update',
        'custom_role',
        mockRoleId,
        expect.objectContaining({
          before: expect.objectContaining({ displayName: 'QA Lead' }),
          after: expect.objectContaining({ displayName: 'Updated QA Lead' }),
        }),
      );
    });

    it('should update isActive when provided', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);

      await service.updateRole(
        mockRoleId,
        mockWorkspaceId,
        { isActive: false },
        mockActorId,
      );

      expect(customRoleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('deleteRole', () => {
    it('should delete role with no members', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);
      workspaceMemberRepo.count.mockResolvedValue(0);

      await service.deleteRole(mockRoleId, mockWorkspaceId, mockActorId);

      expect(customRoleRepo.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException when role not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteRole(mockRoleId, mockWorkspaceId, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for system roles', async () => {
      customRoleRepo.findOne.mockResolvedValue({
        ...mockRole,
        isSystem: true,
      } as CustomRole);

      await expect(
        service.deleteRole(mockRoleId, mockWorkspaceId, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when role has members', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);
      workspaceMemberRepo.count.mockResolvedValue(3);

      await expect(
        service.deleteRole(mockRoleId, mockWorkspaceId, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event on deletion', async () => {
      const freshRole = { ...mockRole, name: 'qa-lead', displayName: 'QA Lead' } as CustomRole;
      customRoleRepo.findOne.mockResolvedValue(freshRole);
      workspaceMemberRepo.count.mockResolvedValue(0);

      await service.deleteRole(mockRoleId, mockWorkspaceId, mockActorId);

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockActorId,
        'delete',
        'custom_role',
        mockRoleId,
        expect.objectContaining({ roleName: 'qa-lead' }),
      );
    });
  });

  describe('cloneRole', () => {
    const cloneDto = {
      name: 'senior-qa-lead',
      displayName: 'Senior QA Lead',
      description: 'Senior QA team lead',
    };

    it('should clone role successfully', async () => {
      customRoleRepo.findOne
        .mockResolvedValueOnce(mockRole as CustomRole) // source role
        .mockResolvedValueOnce(null); // name check - no duplicate
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxPriority: 3 });

      const result = await service.cloneRole(mockRoleId, mockWorkspaceId, cloneDto, mockActorId);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.name).toBe('senior-qa-lead');
    });

    it('should throw NotFoundException when source not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.cloneRole(mockRoleId, mockWorkspaceId, cloneDto, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when max roles reached', async () => {
      customRoleRepo.findOne
        .mockResolvedValueOnce(mockRole as CustomRole) // source role found
        .mockResolvedValueOnce(null); // name check passes
      // Override the transaction mock to simulate count >= 20
      (dataSource.transaction as jest.Mock).mockImplementationOnce(async (cb: any) => {
        const manager = {
          count: jest.fn().mockResolvedValue(20),
          createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          create: jest.fn().mockImplementation((_entity: any, dto: any) => ({ ...dto, id: mockRoleId })),
          save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...mockRole, ...entity })),
        };
        return cb(manager);
      });

      await expect(
        service.cloneRole(mockRoleId, mockWorkspaceId, cloneDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use source description when clone description not provided', async () => {
      customRoleRepo.findOne
        .mockResolvedValueOnce(mockRole as CustomRole)
        .mockResolvedValueOnce(null);

      const { description, ...dtoWithoutDesc } = cloneDto;
      const result = await service.cloneRole(mockRoleId, mockWorkspaceId, dtoWithoutDesc as any, mockActorId);

      expect(result.description).toBe(mockRole.description);
    });
  });

  describe('reorderRoles', () => {
    const roleIds = [
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
    ];

    it('should reorder roles successfully', async () => {
      customRoleRepo.find.mockResolvedValue([
        { id: roleIds[0], workspaceId: mockWorkspaceId } as CustomRole,
        { id: roleIds[1], workspaceId: mockWorkspaceId } as CustomRole,
      ]);

      await service.reorderRoles(mockWorkspaceId, roleIds, mockActorId);

      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid role IDs', async () => {
      customRoleRepo.find.mockResolvedValue([
        { id: roleIds[0], workspaceId: mockWorkspaceId } as CustomRole,
      ]);

      await expect(
        service.reorderRoles(mockWorkspaceId, roleIds, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate role IDs', async () => {
      const duplicateIds = [roleIds[0], roleIds[0]];

      await expect(
        service.reorderRoles(mockWorkspaceId, duplicateIds, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRoleMembers', () => {
    it('should return members for a role', async () => {
      customRoleRepo.findOne.mockResolvedValue(mockRole as CustomRole);
      const mockMembers = [
        { id: 'member-1', userId: 'user-1', user: { email: 'a@test.com' } },
      ];
      workspaceMemberRepo.find.mockResolvedValue(mockMembers as any);

      const result = await service.getRoleMembers(mockRoleId, mockWorkspaceId);

      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when role not found', async () => {
      customRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getRoleMembers(mockRoleId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableIcons', () => {
    it('should return list of available icons', () => {
      const icons = service.getAvailableIcons();

      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain('shield');
      expect(icons).toContain('crown');
      expect(icons).toContain('code');
    });

    it('should return a new array (not the original)', () => {
      const icons1 = service.getAvailableIcons();
      const icons2 = service.getAvailableIcons();

      expect(icons1).not.toBe(icons2);
      expect(icons1).toEqual(icons2);
    });
  });

  describe('countCustomRoles', () => {
    it('should return count of custom roles', async () => {
      customRoleRepo.count.mockResolvedValue(7);

      const count = await service.countCustomRoles(mockWorkspaceId);

      expect(count).toBe(7);
      expect(customRoleRepo.count).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
      });
    });
  });
});
