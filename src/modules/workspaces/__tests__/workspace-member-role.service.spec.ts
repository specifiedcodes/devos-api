/**
 * WorkspacesService - Member Role Assignment Tests
 * Story 20-7: Role Management UI
 * Target: 15 tests for updateMemberRoleWithCustom and bulkUpdateMemberRoles
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from '../workspaces.service';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { WorkspaceInvitation } from '../../../database/entities/workspace-invitation.entity';
import { User } from '../../../database/entities/user.entity';
import { SecurityEvent } from '../../../database/entities/security-event.entity';
import { CustomRole } from '../../../database/entities/custom-role.entity';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { SystemRole } from '../dto/update-member-role.dto';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../../email/email.service';
import { AuditService } from '../../../shared/audit/audit.service';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const ACTOR_ID = '44444444-4444-4444-4444-444444444444';
const CUSTOM_ROLE_ID = '55555555-5555-5555-5555-555555555555';

const mockMember = {
  id: MEMBER_ID,
  userId: USER_ID,
  workspaceId: WORKSPACE_ID,
  role: WorkspaceRole.DEVELOPER,
  customRoleId: null,
  customRole: null,
  user: { email: 'test@example.com' },
  createdAt: new Date(),
};

const mockCustomRole = {
  id: CUSTOM_ROLE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'qa-lead',
  displayName: 'QA Lead',
  isActive: true,
};

const mockMemberRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  remove: jest.fn(),
};

const mockWorkspaceRepo = {
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  create: jest.fn(),
};

const mockInvitationRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockSecurityEventRepo = {
  save: jest.fn(),
  create: jest.fn().mockImplementation((data) => data),
};

const mockCustomRoleRepo = {
  findOne: jest.fn(),
};

const mockRedisService = {
  scanKeys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn().mockResolvedValue([]),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockEmailService = {
  sendEmail: jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { save: jest.fn() },
    query: jest.fn(),
    connection: { driver: { escape: jest.fn((s: string) => `"${s}"`) } },
  }),
  query: jest.fn(),
};

describe('WorkspacesService - Member Role Assignment (Story 20-7)', () => {
  let service: WorkspacesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
        { provide: getRepositoryToken(WorkspaceInvitation), useValue: mockInvitationRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(SecurityEvent), useValue: mockSecurityEventRepo },
        { provide: getRepositoryToken(CustomRole), useValue: mockCustomRoleRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  describe('updateMemberRoleWithCustom', () => {
    it('should update a member to a system role successfully', async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce({ ...mockMember })
        .mockResolvedValueOnce({
          ...mockMember,
          role: WorkspaceRole.ADMIN,
          customRoleId: null,
          customRole: null,
        });
      mockMemberRepo.save.mockResolvedValue(undefined);

      const result = await service.updateMemberRoleWithCustom(
        WORKSPACE_ID,
        MEMBER_ID,
        { role: SystemRole.ADMIN },
        ACTOR_ID,
      );

      expect(result.role).toBe(WorkspaceRole.ADMIN);
      expect(result.email).toBe('test@example.com');
      expect(mockMemberRepo.save).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should update a member to a custom role successfully', async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce({ ...mockMember })
        .mockResolvedValueOnce({
          ...mockMember,
          customRoleId: CUSTOM_ROLE_ID,
          customRole: mockCustomRole,
        });
      mockMemberRepo.save.mockResolvedValue(undefined);
      mockCustomRoleRepo.findOne.mockResolvedValue(mockCustomRole);

      const result = await service.updateMemberRoleWithCustom(
        WORKSPACE_ID,
        MEMBER_ID,
        { customRoleId: CUSTOM_ROLE_ID },
        ACTOR_ID,
      );

      expect(result.customRoleId).toBe(CUSTOM_ROLE_ID);
      expect(result.roleName).toBe('QA Lead');
    });

    it('should throw NotFoundException when member not found', async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.ADMIN }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when custom role not found', async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce({ ...mockMember });
      mockCustomRoleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { customRoleId: CUSTOM_ROLE_ID }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when custom role is not active', async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce({ ...mockMember });
      mockCustomRoleRepo.findOne.mockResolvedValue({ ...mockCustomRole, isActive: false });

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { customRoleId: CUSTOM_ROLE_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when demoting the only owner', async () => {
      const ownerMember = {
        ...mockMember,
        userId: ACTOR_ID,
        role: WorkspaceRole.OWNER,
      };
      mockMemberRepo.findOne.mockResolvedValueOnce(ownerMember);
      mockMemberRepo.count.mockResolvedValue(1); // Only 1 owner

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.ADMIN }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when assigning owner role exceeds limit', async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce({ ...mockMember });
      mockMemberRepo.count.mockResolvedValue(5); // Already 5 owners

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.OWNER }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate permission cache for the affected user', async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce({ ...mockMember })
        .mockResolvedValueOnce({ ...mockMember, role: WorkspaceRole.ADMIN });
      mockMemberRepo.save.mockResolvedValue(undefined);
      mockRedisService.scanKeys.mockResolvedValue(['perm:key1', 'perm:key2']);

      await service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.ADMIN }, ACTOR_ID);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith(
        expect.stringContaining(`perm:${WORKSPACE_ID}:${USER_ID}`),
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('perm:key1', 'perm:key2');
    });

    it('should record permission audit event', async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce({ ...mockMember })
        .mockResolvedValueOnce({ ...mockMember, role: WorkspaceRole.ADMIN });
      mockMemberRepo.save.mockResolvedValue(undefined);

      await service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.ADMIN }, ACTOR_ID);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        WORKSPACE_ID,
        ACTOR_ID,
        expect.any(String), // MEMBER_ROLE_CHANGED
        'workspace_member',
        USER_ID,
        expect.objectContaining({ beforeState: expect.any(Object), afterState: expect.any(Object) }),
      );
    });

    it('should throw BadRequestException when neither role nor customRoleId provided', async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce({ ...mockMember });

      await expect(
        service.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, {}, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkUpdateMemberRoles', () => {
    const members = [
      { ...mockMember, id: 'aaa', userId: 'u1' },
      { ...mockMember, id: 'bbb', userId: 'u2' },
    ];

    it('should bulk update members to a system role', async () => {
      mockMemberRepo.find.mockResolvedValue(members);
      mockMemberRepo.save.mockResolvedValue(undefined);

      await service.bulkUpdateMemberRoles(
        WORKSPACE_ID,
        { memberIds: ['aaa', 'bbb'], role: SystemRole.VIEWER },
        ACTOR_ID,
      );

      expect(mockMemberRepo.save).toHaveBeenCalledTimes(2);
      expect(mockAuditService.log).toHaveBeenCalledTimes(2);
    });

    it('should bulk update members to a custom role', async () => {
      mockMemberRepo.find.mockResolvedValue(members);
      mockMemberRepo.save.mockResolvedValue(undefined);
      mockCustomRoleRepo.findOne.mockResolvedValue(mockCustomRole);

      await service.bulkUpdateMemberRoles(
        WORKSPACE_ID,
        { memberIds: ['aaa', 'bbb'], customRoleId: CUSTOM_ROLE_ID },
        ACTOR_ID,
      );

      expect(mockMemberRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when no matching members found', async () => {
      mockMemberRepo.find.mockResolvedValue([]);

      await expect(
        service.bulkUpdateMemberRoles(
          WORKSPACE_ID,
          { memberIds: ['aaa'], role: SystemRole.VIEWER },
          ACTOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should batch invalidate permission cache for all affected users', async () => {
      mockMemberRepo.find.mockResolvedValue(members);
      mockMemberRepo.save.mockResolvedValue(undefined);
      mockRedisService.scanKeys.mockResolvedValue(['perm:key1']);

      await service.bulkUpdateMemberRoles(
        WORKSPACE_ID,
        { memberIds: ['aaa', 'bbb'], role: SystemRole.VIEWER },
        ACTOR_ID,
      );

      // Should be called for each user
      expect(mockRedisService.scanKeys).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when owner limit exceeded on bulk assign', async () => {
      mockMemberRepo.find.mockResolvedValue([
        { ...mockMember, id: 'aaa', userId: 'u1', role: WorkspaceRole.DEVELOPER },
        { ...mockMember, id: 'bbb', userId: 'u2', role: WorkspaceRole.DEVELOPER },
      ]);
      mockMemberRepo.count.mockResolvedValue(4); // 4 existing owners + 2 new = 6 > 5

      await expect(
        service.bulkUpdateMemberRoles(
          WORKSPACE_ID,
          { memberIds: ['aaa', 'bbb'], role: SystemRole.OWNER },
          ACTOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
