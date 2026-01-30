import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService, WorkspaceAction } from './permission.service';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionService],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  describe('Task 4.1-4.2: Permission matrix and canPerformAction', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should allow OWNER all actions', () => {
      const allActions = Object.values(WorkspaceAction);
      allActions.forEach((action) => {
        expect(service.canPerformAction(WorkspaceRole.OWNER, action)).toBe(true);
      });
    });

    it('should deny ADMIN owner-specific actions', () => {
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.DELETE_WORKSPACE)).toBe(false);
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.TRANSFER_OWNERSHIP)).toBe(false);
    });

    it('should allow ADMIN management actions', () => {
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.INVITE_MEMBERS)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.REMOVE_MEMBERS)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.CHANGE_ROLES)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.ADMIN, WorkspaceAction.VIEW_AUDIT_LOGS)).toBe(true);
    });

    it('should deny DEVELOPER management actions', () => {
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.INVITE_MEMBERS)).toBe(false);
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.REMOVE_MEMBERS)).toBe(false);
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.CHANGE_ROLES)).toBe(false);
    });

    it('should allow DEVELOPER project actions', () => {
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.CREATE_PROJECTS)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.EDIT_PROJECTS)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.DEVELOPER, WorkspaceAction.ASSIGN_AGENT_TASKS)).toBe(true);
    });

    it('should deny VIEWER all write actions', () => {
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.CREATE_PROJECTS)).toBe(false);
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.INVITE_MEMBERS)).toBe(false);
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.DELETE_WORKSPACE)).toBe(false);
    });

    it('should allow VIEWER read actions', () => {
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.VIEW_WORKSPACE)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.VIEW_PROJECTS)).toBe(true);
      expect(service.canPerformAction(WorkspaceRole.VIEWER, WorkspaceAction.VIEW_AGENT_STATUS)).toBe(true);
    });
  });

  describe('Task 4.3: canDeleteWorkspace helper', () => {
    it('should allow only OWNER to delete workspace', () => {
      expect(service.canDeleteWorkspace(WorkspaceRole.OWNER)).toBe(true);
      expect(service.canDeleteWorkspace(WorkspaceRole.ADMIN)).toBe(false);
      expect(service.canDeleteWorkspace(WorkspaceRole.DEVELOPER)).toBe(false);
      expect(service.canDeleteWorkspace(WorkspaceRole.VIEWER)).toBe(false);
    });
  });

  describe('Task 4.4: canInviteMembers helper', () => {
    it('should allow OWNER and ADMIN to invite members', () => {
      expect(service.canInviteMembers(WorkspaceRole.OWNER)).toBe(true);
      expect(service.canInviteMembers(WorkspaceRole.ADMIN)).toBe(true);
      expect(service.canInviteMembers(WorkspaceRole.DEVELOPER)).toBe(false);
      expect(service.canInviteMembers(WorkspaceRole.VIEWER)).toBe(false);
    });
  });

  describe('Task 4.5: canManageProjects helper', () => {
    it('should allow OWNER, ADMIN, and DEVELOPER to manage projects', () => {
      expect(service.canManageProjects(WorkspaceRole.OWNER)).toBe(true);
      expect(service.canManageProjects(WorkspaceRole.ADMIN)).toBe(true);
      expect(service.canManageProjects(WorkspaceRole.DEVELOPER)).toBe(true);
      expect(service.canManageProjects(WorkspaceRole.VIEWER)).toBe(false);
    });
  });

  describe('Task 4.6: canViewWorkspace helper', () => {
    it('should allow all roles to view workspace', () => {
      expect(service.canViewWorkspace(WorkspaceRole.OWNER)).toBe(true);
      expect(service.canViewWorkspace(WorkspaceRole.ADMIN)).toBe(true);
      expect(service.canViewWorkspace(WorkspaceRole.DEVELOPER)).toBe(true);
      expect(service.canViewWorkspace(WorkspaceRole.VIEWER)).toBe(true);
    });
  });

  describe('Task 4.7: Export permission constants for frontend', () => {
    it('should export all permissions for OWNER', () => {
      const permissions = service.exportPermissions(WorkspaceRole.OWNER);

      expect(permissions.canViewWorkspace).toBe(true);
      expect(permissions.canCreateProjects).toBe(true);
      expect(permissions.canInviteMembers).toBe(true);
      expect(permissions.canDeleteWorkspace).toBe(true);
      expect(permissions.canTransferOwnership).toBe(true);
    });

    it('should export limited permissions for ADMIN', () => {
      const permissions = service.exportPermissions(WorkspaceRole.ADMIN);

      expect(permissions.canViewWorkspace).toBe(true);
      expect(permissions.canCreateProjects).toBe(true);
      expect(permissions.canInviteMembers).toBe(true);
      expect(permissions.canDeleteWorkspace).toBe(false);
      expect(permissions.canTransferOwnership).toBe(false);
    });

    it('should export developer permissions for DEVELOPER', () => {
      const permissions = service.exportPermissions(WorkspaceRole.DEVELOPER);

      expect(permissions.canViewWorkspace).toBe(true);
      expect(permissions.canCreateProjects).toBe(true);
      expect(permissions.canInviteMembers).toBe(false);
      expect(permissions.canDeleteWorkspace).toBe(false);
    });

    it('should export read-only permissions for VIEWER', () => {
      const permissions = service.exportPermissions(WorkspaceRole.VIEWER);

      expect(permissions.canViewWorkspace).toBe(true);
      expect(permissions.canViewProjects).toBe(true);
      expect(permissions.canCreateProjects).toBe(false);
      expect(permissions.canInviteMembers).toBe(false);
      expect(permissions.canDeleteWorkspace).toBe(false);
    });
  });

  describe('Task 4.8: Get all permissions for a role', () => {
    it('should return all permissions for OWNER', () => {
      const permissions = service.getPermissionsForRole(WorkspaceRole.OWNER);
      expect(permissions).toContain(WorkspaceAction.DELETE_WORKSPACE);
      expect(permissions).toContain(WorkspaceAction.TRANSFER_OWNERSHIP);
      expect(permissions.length).toBeGreaterThan(10);
    });

    it('should return limited permissions for VIEWER', () => {
      const permissions = service.getPermissionsForRole(WorkspaceRole.VIEWER);
      expect(permissions).toContain(WorkspaceAction.VIEW_WORKSPACE);
      expect(permissions).toContain(WorkspaceAction.VIEW_PROJECTS);
      expect(permissions).not.toContain(WorkspaceAction.CREATE_PROJECTS);
      expect(permissions.length).toBe(3); // Only 3 view permissions
    });
  });
});
