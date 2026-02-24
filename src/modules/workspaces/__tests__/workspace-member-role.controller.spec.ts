/**
 * WorkspacesController - Member Role Assignment Tests
 * Story 20-7: Role Management UI
 * Target: 12 tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { WorkspacesController } from '../workspaces.controller';
import { WorkspacesService } from '../workspaces.service';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../../database/entities/security-event.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { RoleGuard } from '../../../common/guards/role.guard';
import { SystemRole } from '../dto/update-member-role.dto';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const CUSTOM_ROLE_ID = '55555555-5555-5555-5555-555555555555';

const mockRequest = {
  user: { id: USER_ID },
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
};

const enrichedMember = {
  id: MEMBER_ID,
  userId: '44444444-4444-4444-4444-444444444444',
  name: 'test',
  email: 'test@example.com',
  role: WorkspaceRole.ADMIN,
  roleName: 'Admin',
  customRoleId: null,
  customRoleName: null,
  lastActiveAt: null,
  joinedAt: new Date().toISOString(),
  avatarUrl: null,
};

const mockService = {
  getUserWorkspaces: jest.fn(),
  getWorkspaceById: jest.fn(),
  createWorkspace: jest.fn(),
  renameWorkspace: jest.fn(),
  softDeleteWorkspace: jest.fn(),
  switchWorkspace: jest.fn(),
  createInvitation: jest.fn(),
  getInvitations: jest.fn(),
  getInvitationDetails: jest.fn(),
  acceptInvitation: jest.fn(),
  resendInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
  getMembers: jest.fn(),
  changeMemberRole: jest.fn(),
  removeMember: jest.fn(),
  transferOwnership: jest.fn(),
  updateMemberRoleWithCustom: jest.fn(),
  bulkUpdateMemberRoles: jest.fn(),
};

describe('WorkspacesController - Member Role Assignment (Story 20-7)', () => {
  let controller: WorkspacesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [
        { provide: WorkspacesService, useValue: mockService },
        { provide: RoleGuard, useClass: RoleGuard },
        { provide: Reflector, useValue: new Reflector() },
        { provide: getRepositoryToken(WorkspaceMember), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(SecurityEvent), useValue: { save: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    controller = module.get<WorkspacesController>(WorkspacesController);
  });

  describe('GET /workspaces/:id/members', () => {
    it('should return enriched member list', async () => {
      const enrichedMembers = [enrichedMember];
      mockService.getMembers.mockResolvedValue(enrichedMembers);

      const result = await controller.getMembers(WORKSPACE_ID);

      expect(result).toEqual(enrichedMembers);
      expect(mockService.getMembers).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('should return members with custom role information', async () => {
      const memberWithCustomRole = {
        ...enrichedMember,
        customRoleId: CUSTOM_ROLE_ID,
        customRoleName: 'QA Lead',
        roleName: 'QA Lead',
      };
      mockService.getMembers.mockResolvedValue([memberWithCustomRole]);

      const result = await controller.getMembers(WORKSPACE_ID);

      expect(result[0].customRoleId).toBe(CUSTOM_ROLE_ID);
      expect(result[0].customRoleName).toBe('QA Lead');
      expect(result[0].roleName).toBe('QA Lead');
    });

    it('should return enriched fields: name, roleName, lastActiveAt, avatarUrl', async () => {
      mockService.getMembers.mockResolvedValue([enrichedMember]);

      const result = await controller.getMembers(WORKSPACE_ID);

      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('roleName');
      expect(result[0]).toHaveProperty('lastActiveAt');
      expect(result[0]).toHaveProperty('avatarUrl');
    });
  });

  describe('PUT /workspaces/:id/members/:memberId/role', () => {
    it('should update member to system role', async () => {
      mockService.updateMemberRoleWithCustom.mockResolvedValue(enrichedMember);

      const result = await controller.updateMemberRoleWithCustom(
        WORKSPACE_ID,
        MEMBER_ID,
        { role: SystemRole.ADMIN },
        mockRequest,
      );

      expect(result).toEqual(enrichedMember);
      expect(mockService.updateMemberRoleWithCustom).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MEMBER_ID,
        { role: SystemRole.ADMIN },
        USER_ID,
      );
    });

    it('should update member to custom role', async () => {
      const customResult = {
        ...enrichedMember,
        customRoleId: CUSTOM_ROLE_ID,
        roleName: 'QA Lead',
      };
      mockService.updateMemberRoleWithCustom.mockResolvedValue(customResult);

      const result = await controller.updateMemberRoleWithCustom(
        WORKSPACE_ID,
        MEMBER_ID,
        { customRoleId: CUSTOM_ROLE_ID },
        mockRequest,
      );

      expect(result.customRoleId).toBe(CUSTOM_ROLE_ID);
    });

    it('should pass actor ID from JWT to service', async () => {
      mockService.updateMemberRoleWithCustom.mockResolvedValue(enrichedMember);

      await controller.updateMemberRoleWithCustom(
        WORKSPACE_ID,
        MEMBER_ID,
        { role: SystemRole.VIEWER },
        mockRequest,
      );

      expect(mockService.updateMemberRoleWithCustom).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MEMBER_ID,
        { role: SystemRole.VIEWER },
        USER_ID,
      );
    });

    it('should propagate service errors', async () => {
      mockService.updateMemberRoleWithCustom.mockRejectedValue(
        new Error('Member not found'),
      );

      await expect(
        controller.updateMemberRoleWithCustom(WORKSPACE_ID, MEMBER_ID, { role: SystemRole.ADMIN }, mockRequest),
      ).rejects.toThrow('Member not found');
    });
  });

  describe('POST /workspaces/:id/members/bulk-role', () => {
    it('should bulk update member roles successfully', async () => {
      mockService.bulkUpdateMemberRoles.mockResolvedValue(undefined);

      const result = await controller.bulkUpdateMemberRoles(
        WORKSPACE_ID,
        { memberIds: [MEMBER_ID], role: SystemRole.ADMIN },
        mockRequest,
      );

      expect(result.message).toBe('Member roles updated successfully');
      expect(mockService.bulkUpdateMemberRoles).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { memberIds: [MEMBER_ID], role: SystemRole.ADMIN },
        USER_ID,
      );
    });

    it('should pass actor ID for bulk operations', async () => {
      mockService.bulkUpdateMemberRoles.mockResolvedValue(undefined);

      await controller.bulkUpdateMemberRoles(
        WORKSPACE_ID,
        { memberIds: [MEMBER_ID], customRoleId: CUSTOM_ROLE_ID },
        mockRequest,
      );

      expect(mockService.bulkUpdateMemberRoles).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { memberIds: [MEMBER_ID], customRoleId: CUSTOM_ROLE_ID },
        USER_ID,
      );
    });

    it('should propagate service errors for bulk operations', async () => {
      mockService.bulkUpdateMemberRoles.mockRejectedValue(
        new Error('Cannot have more than 5 owners'),
      );

      await expect(
        controller.bulkUpdateMemberRoles(
          WORKSPACE_ID,
          { memberIds: [MEMBER_ID], role: SystemRole.OWNER },
          mockRequest,
        ),
      ).rejects.toThrow('Cannot have more than 5 owners');
    });

    it('should handle empty memberIds error from service', async () => {
      mockService.bulkUpdateMemberRoles.mockRejectedValue(
        new Error('No matching members found'),
      );

      await expect(
        controller.bulkUpdateMemberRoles(
          WORKSPACE_ID,
          { memberIds: ['nonexistent-id-00000000000000000'], role: SystemRole.VIEWER },
          mockRequest,
        ),
      ).rejects.toThrow('No matching members found');
    });
  });
});
