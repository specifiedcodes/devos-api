import { Injectable } from '@nestjs/common';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';

export enum WorkspaceAction {
  VIEW_WORKSPACE = 'view_workspace',
  VIEW_PROJECTS = 'view_projects',
  VIEW_AGENT_STATUS = 'view_agent_status',
  CREATE_PROJECTS = 'create_projects',
  EDIT_PROJECTS = 'edit_projects',
  DELETE_PROJECTS = 'delete_projects',
  ASSIGN_AGENT_TASKS = 'assign_agent_tasks',
  TRIGGER_DEPLOYMENTS = 'trigger_deployments',
  MANAGE_BYOK_KEYS = 'manage_byok_keys',
  INVITE_MEMBERS = 'invite_members',
  REMOVE_MEMBERS = 'remove_members',
  CHANGE_ROLES = 'change_roles',
  EDIT_WORKSPACE_SETTINGS = 'edit_workspace_settings',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  DELETE_WORKSPACE = 'delete_workspace',
  TRANSFER_OWNERSHIP = 'transfer_ownership',
}

/**
 * Permission matrix mapping roles to allowed actions
 * Based on role hierarchy: Owner > Admin > Developer > Viewer
 */
const PERMISSION_MATRIX: Record<WorkspaceRole, WorkspaceAction[]> = {
  [WorkspaceRole.OWNER]: [
    // Owner has all permissions
    WorkspaceAction.VIEW_WORKSPACE,
    WorkspaceAction.VIEW_PROJECTS,
    WorkspaceAction.VIEW_AGENT_STATUS,
    WorkspaceAction.CREATE_PROJECTS,
    WorkspaceAction.EDIT_PROJECTS,
    WorkspaceAction.DELETE_PROJECTS,
    WorkspaceAction.ASSIGN_AGENT_TASKS,
    WorkspaceAction.TRIGGER_DEPLOYMENTS,
    WorkspaceAction.MANAGE_BYOK_KEYS,
    WorkspaceAction.INVITE_MEMBERS,
    WorkspaceAction.REMOVE_MEMBERS,
    WorkspaceAction.CHANGE_ROLES,
    WorkspaceAction.EDIT_WORKSPACE_SETTINGS,
    WorkspaceAction.VIEW_AUDIT_LOGS,
    WorkspaceAction.DELETE_WORKSPACE,
    WorkspaceAction.TRANSFER_OWNERSHIP,
  ],
  [WorkspaceRole.ADMIN]: [
    // Admin has all permissions except owner-specific ones
    WorkspaceAction.VIEW_WORKSPACE,
    WorkspaceAction.VIEW_PROJECTS,
    WorkspaceAction.VIEW_AGENT_STATUS,
    WorkspaceAction.CREATE_PROJECTS,
    WorkspaceAction.EDIT_PROJECTS,
    WorkspaceAction.DELETE_PROJECTS,
    WorkspaceAction.ASSIGN_AGENT_TASKS,
    WorkspaceAction.TRIGGER_DEPLOYMENTS,
    WorkspaceAction.MANAGE_BYOK_KEYS,
    WorkspaceAction.INVITE_MEMBERS,
    WorkspaceAction.REMOVE_MEMBERS,
    WorkspaceAction.CHANGE_ROLES,
    WorkspaceAction.EDIT_WORKSPACE_SETTINGS,
    WorkspaceAction.VIEW_AUDIT_LOGS,
  ],
  [WorkspaceRole.DEVELOPER]: [
    // Developer has view + create/edit permissions
    // NOTE: DELETE_PROJECTS permission granted per Epic 2 Story 2.5 specification
    // "Developer permissions: Create/delete projects, Edit project settings"
    // This aligns with development workflow where developers manage their own projects
    WorkspaceAction.VIEW_WORKSPACE,
    WorkspaceAction.VIEW_PROJECTS,
    WorkspaceAction.VIEW_AGENT_STATUS,
    WorkspaceAction.CREATE_PROJECTS,
    WorkspaceAction.EDIT_PROJECTS,
    WorkspaceAction.DELETE_PROJECTS, // Explicitly granted in PRD/Epic 2 Story 2.5
    WorkspaceAction.ASSIGN_AGENT_TASKS,
    WorkspaceAction.TRIGGER_DEPLOYMENTS,
    WorkspaceAction.MANAGE_BYOK_KEYS,
  ],
  [WorkspaceRole.VIEWER]: [
    // Viewer has read-only permissions
    WorkspaceAction.VIEW_WORKSPACE,
    WorkspaceAction.VIEW_PROJECTS,
    WorkspaceAction.VIEW_AGENT_STATUS,
  ],
};

@Injectable()
export class PermissionService {
  /**
   * Check if a role can perform a specific action
   * @param role - User's workspace role
   * @param action - Action to check
   * @returns true if role has permission
   */
  canPerformAction(role: WorkspaceRole, action: WorkspaceAction): boolean {
    const allowedActions = PERMISSION_MATRIX[role];
    return allowedActions.includes(action);
  }

  /**
   * Check if role can delete workspace (Owner only)
   */
  canDeleteWorkspace(role: WorkspaceRole): boolean {
    return this.canPerformAction(role, WorkspaceAction.DELETE_WORKSPACE);
  }

  /**
   * Check if role can invite members (Owner/Admin)
   */
  canInviteMembers(role: WorkspaceRole): boolean {
    return this.canPerformAction(role, WorkspaceAction.INVITE_MEMBERS);
  }

  /**
   * Check if role can manage projects (Owner/Admin/Developer)
   */
  canManageProjects(role: WorkspaceRole): boolean {
    return this.canPerformAction(role, WorkspaceAction.CREATE_PROJECTS);
  }

  /**
   * Check if role can view workspace (All roles)
   */
  canViewWorkspace(role: WorkspaceRole): boolean {
    return this.canPerformAction(role, WorkspaceAction.VIEW_WORKSPACE);
  }

  /**
   * Get all permissions for a role
   * @param role - User's workspace role
   * @returns Array of allowed actions
   */
  getPermissionsForRole(role: WorkspaceRole): WorkspaceAction[] {
    return PERMISSION_MATRIX[role];
  }

  /**
   * Export permission constants for frontend use
   * Returns a simplified permission object suitable for API responses
   */
  exportPermissions(role: WorkspaceRole): Record<string, boolean> {
    return {
      canViewWorkspace: this.canViewWorkspace(role),
      canViewProjects: this.canPerformAction(role, WorkspaceAction.VIEW_PROJECTS),
      canViewAgentStatus: this.canPerformAction(role, WorkspaceAction.VIEW_AGENT_STATUS),
      canCreateProjects: this.canPerformAction(role, WorkspaceAction.CREATE_PROJECTS),
      canEditProjects: this.canPerformAction(role, WorkspaceAction.EDIT_PROJECTS),
      canDeleteProjects: this.canPerformAction(role, WorkspaceAction.DELETE_PROJECTS),
      canAssignAgentTasks: this.canPerformAction(role, WorkspaceAction.ASSIGN_AGENT_TASKS),
      canTriggerDeployments: this.canPerformAction(role, WorkspaceAction.TRIGGER_DEPLOYMENTS),
      canManageBYOKKeys: this.canPerformAction(role, WorkspaceAction.MANAGE_BYOK_KEYS),
      canInviteMembers: this.canInviteMembers(role),
      canRemoveMembers: this.canPerformAction(role, WorkspaceAction.REMOVE_MEMBERS),
      canChangeRoles: this.canPerformAction(role, WorkspaceAction.CHANGE_ROLES),
      canEditSettings: this.canPerformAction(role, WorkspaceAction.EDIT_WORKSPACE_SETTINGS),
      canViewAuditLogs: this.canPerformAction(role, WorkspaceAction.VIEW_AUDIT_LOGS),
      canDeleteWorkspace: this.canDeleteWorkspace(role),
      canTransferOwnership: this.canPerformAction(role, WorkspaceAction.TRANSFER_OWNERSHIP),
    };
  }
}
