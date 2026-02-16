import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException } from '@nestjs/common';
import { ScimGroupService } from '../scim-group.service';
import { ScimGroup } from '../../../../database/entities/scim-group.entity';
import { ScimGroupMembership } from '../../../../database/entities/scim-group-membership.entity';
import { User } from '../../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { ScimSyncLogService } from '../scim-sync-log.service';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';

describe('ScimGroupService', () => {
  let service: ScimGroupService;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const groupId = '550e8400-e29b-41d4-a716-446655440010';
  const userId = '550e8400-e29b-41d4-a716-446655440001';

  const mockScimGroupRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockScimGroupMembershipRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockWorkspaceMemberRepository = {};

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockScimSyncLogService = {
    log: jest.fn().mockResolvedValue({}),
  };

  const setupListQueryBuilder = (groups: any[], total: number) => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(total),
      getMany: jest.fn().mockResolvedValue(groups),
    };
    mockScimGroupRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimGroupService,
        { provide: getRepositoryToken(ScimGroup), useValue: mockScimGroupRepository },
        { provide: getRepositoryToken(ScimGroupMembership), useValue: mockScimGroupMembershipRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepository },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: ScimSyncLogService, useValue: mockScimSyncLogService },
      ],
    }).compile();

    service = module.get<ScimGroupService>(ScimGroupService);
  });

  describe('listGroups', () => {
    it('should return empty list for workspace with no groups', async () => {
      setupListQueryBuilder([], 0);

      const result = await service.listGroups(workspaceId);

      expect(result.totalResults).toBe(0);
      expect(result.Resources).toEqual([]);
    });

    it('should return all groups in SCIM format', async () => {
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering', memberships: [], createdAt: new Date(), updatedAt: new Date() };
      setupListQueryBuilder([group], 1);

      const result = await service.listGroups(workspaceId);

      expect(result.totalResults).toBe(1);
      expect(result.Resources[0].displayName).toBe('Engineering');
      expect(result.Resources[0].schemas).toContain(SCIM_CONSTANTS.SCHEMAS.GROUP);
    });

    it('should handle pagination correctly', async () => {
      const qb = setupListQueryBuilder([], 50);

      await service.listGroups(workspaceId, undefined, 11, 10);

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });
  });

  describe('getGroup', () => {
    it('should return group with members in SCIM format', async () => {
      const group = {
        id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering',
        memberships: [{ userId, user: { id: userId, email: 'john@test.com' } }],
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockScimGroupRepository.findOne.mockResolvedValue(group);

      const result = await service.getGroup(workspaceId, groupId);

      expect(result.displayName).toBe('Engineering');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].value).toBe(userId);
    });

    it('should return 404 for non-existent group', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);

      await expect(service.getGroup(workspaceId, 'non-existent')).rejects.toThrow(HttpException);
    });

    it('should return 404 for group in different workspace', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);

      await expect(service.getGroup('other-workspace', groupId)).rejects.toThrow(HttpException);
    });
  });

  describe('createGroup', () => {
    it('should create group with displayName and externalId', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering', memberships: [], createdAt: new Date(), updatedAt: new Date() };
      mockScimGroupRepository.create.mockReturnValue(group);
      mockScimGroupRepository.save.mockResolvedValue(group);

      const result = await service.createGroup(workspaceId, {
        schemas: [],
        displayName: 'Engineering',
        externalId: 'eng-1',
      });

      expect(result.displayName).toBe('Engineering');
      expect(result.id).toBe(groupId);
    });

    it('should add initial members from members array', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering', memberships: [], createdAt: new Date(), updatedAt: new Date() };
      mockScimGroupRepository.create.mockReturnValue(group);
      mockScimGroupRepository.save.mockResolvedValue(group);
      mockUserRepository.findOne.mockResolvedValue({ id: userId, email: 'john@test.com' });
      mockScimGroupMembershipRepository.create.mockReturnValue({});
      mockScimGroupMembershipRepository.save.mockResolvedValue({});

      const result = await service.createGroup(workspaceId, {
        schemas: [],
        displayName: 'Engineering',
        members: [{ value: userId }],
      });

      expect(mockScimGroupMembershipRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ groupId, userId }),
      );
    });

    it('should return 409 for duplicate externalId in same workspace', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue({ id: groupId });

      await expect(
        service.createGroup(workspaceId, { schemas: [], displayName: 'Eng', externalId: 'eng-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('should log create_group to scim_sync_logs', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering', memberships: [], createdAt: new Date(), updatedAt: new Date() };
      mockScimGroupRepository.create.mockReturnValue(group);
      mockScimGroupRepository.save.mockResolvedValue(group);

      await service.createGroup(workspaceId, { schemas: [], displayName: 'Engineering' });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'create_group' }),
      );
    });

    it('should return 400 for missing displayName', async () => {
      await expect(
        service.createGroup(workspaceId, { schemas: [], displayName: '' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('patchGroup', () => {
    const group = {
      id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering',
      memberships: [], createdAt: new Date(), updatedAt: new Date(),
    };

    beforeEach(() => {
      mockScimGroupRepository.findOne.mockResolvedValue({ ...group });
    });

    it('should add members via PATCH add operation', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, email: 'john@test.com' });
      mockScimGroupMembershipRepository.findOne.mockResolvedValue(null);
      mockScimGroupMembershipRepository.create.mockReturnValue({});
      mockScimGroupMembershipRepository.save.mockResolvedValue({});
      mockScimGroupRepository.findOne
        .mockResolvedValueOnce({ ...group })
        .mockResolvedValueOnce({ ...group, memberships: [{ userId, user: { id: userId, email: 'john@test.com' } }] });

      const result = await service.patchGroup(
        workspaceId,
        groupId,
        { schemas: [], Operations: [{ op: 'add', path: 'members', value: [{ value: userId }] }] },
      );

      expect(mockScimGroupMembershipRepository.save).toHaveBeenCalled();
    });

    it('should remove members via PATCH remove operation', async () => {
      mockScimGroupMembershipRepository.delete.mockResolvedValue({});
      mockScimGroupRepository.findOne
        .mockResolvedValueOnce({ ...group })
        .mockResolvedValueOnce({ ...group, memberships: [] });

      await service.patchGroup(
        workspaceId,
        groupId,
        { schemas: [], Operations: [{ op: 'remove', path: `members[value eq "${userId}"]` }] },
      );

      expect(mockScimGroupMembershipRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ groupId, userId }),
      );
    });

    it('should update displayName via PATCH replace', async () => {
      mockScimGroupRepository.save.mockResolvedValue({ ...group, displayName: 'New Name' });
      mockScimGroupRepository.findOne
        .mockResolvedValueOnce({ ...group })
        .mockResolvedValueOnce({ ...group, displayName: 'New Name', memberships: [] });

      const result = await service.patchGroup(
        workspaceId,
        groupId,
        { schemas: [], Operations: [{ op: 'replace', path: 'displayName', value: 'New Name' }] },
      );

      expect(result.displayName).toBe('New Name');
    });

    it('should return 404 for non-existent group', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);

      await expect(
        service.patchGroup(workspaceId, 'non-existent', { schemas: [], Operations: [] }),
      ).rejects.toThrow(HttpException);
    });

    it('should log update_group to scim_sync_logs', async () => {
      mockScimGroupRepository.findOne
        .mockResolvedValueOnce({ ...group })
        .mockResolvedValueOnce({ ...group, memberships: [] });

      await service.patchGroup(
        workspaceId,
        groupId,
        { schemas: [], Operations: [{ op: 'replace', path: 'displayName', value: 'X' }] },
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'update_group' }),
      );
    });

    it('should ignore member add for non-existent user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockScimGroupRepository.findOne
        .mockResolvedValueOnce({ ...group })
        .mockResolvedValueOnce({ ...group, memberships: [] });

      // Should not throw
      await service.patchGroup(
        workspaceId,
        groupId,
        { schemas: [], Operations: [{ op: 'add', path: 'members', value: [{ value: 'non-existent' }] }] },
      );

      expect(mockScimGroupMembershipRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and all memberships', async () => {
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering' };
      mockScimGroupRepository.findOne.mockResolvedValue(group);
      mockScimGroupRepository.remove.mockResolvedValue({});

      await service.deleteGroup(workspaceId, groupId);

      expect(mockScimGroupRepository.remove).toHaveBeenCalledWith(group);
    });

    it('should return void (204)', async () => {
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering' };
      mockScimGroupRepository.findOne.mockResolvedValue(group);
      mockScimGroupRepository.remove.mockResolvedValue({});

      const result = await service.deleteGroup(workspaceId, groupId);

      expect(result).toBeUndefined();
    });

    it('should log delete_group to scim_sync_logs', async () => {
      const group = { id: groupId, workspaceId, externalId: 'eng-1', displayName: 'Engineering' };
      mockScimGroupRepository.findOne.mockResolvedValue(group);
      mockScimGroupRepository.remove.mockResolvedValue({});

      await service.deleteGroup(workspaceId, groupId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockScimSyncLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'delete_group' }),
      );
    });

    it('should return 404 for non-existent group', async () => {
      mockScimGroupRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteGroup(workspaceId, 'non-existent')).rejects.toThrow(HttpException);
    });
  });

  describe('toScimGroupResource', () => {
    it('should convert group to SCIM format', () => {
      const group = {
        id: groupId,
        workspaceId,
        externalId: 'eng-1',
        displayName: 'Engineering',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
      } as ScimGroup;

      const result = service.toScimGroupResource(group, [{ userId, email: 'john@test.com' }], 'https://devos.com');

      expect(result.schemas).toContain(SCIM_CONSTANTS.SCHEMAS.GROUP);
      expect(result.id).toBe(groupId);
      expect(result.displayName).toBe('Engineering');
      expect(result.members).toHaveLength(1);
      expect(result.meta.resourceType).toBe('Group');
    });
  });
});
