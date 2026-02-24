import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsUUID, IsNotEmpty, IsString, IsBoolean, MaxLength } from 'class-validator';
import { CustomRole } from './custom-role.entity';

/**
 * Resource types that can have permissions assigned.
 * Maps to the major feature areas of DevOS.
 */
export enum ResourceType {
  PROJECTS = 'projects',
  AGENTS = 'agents',
  STORIES = 'stories',
  DEPLOYMENTS = 'deployments',
  SECRETS = 'secrets',
  INTEGRATIONS = 'integrations',
  WORKSPACE = 'workspace',
  COST_MANAGEMENT = 'cost_management',
}

/**
 * All available permissions organized by resource type.
 * Used for validation and default permission generation.
 */
export const RESOURCE_PERMISSIONS: Record<ResourceType, string[]> = {
  [ResourceType.PROJECTS]: ['create', 'read', 'update', 'delete', 'manage_settings'],
  [ResourceType.AGENTS]: ['view', 'create_custom', 'assign_tasks', 'pause_cancel', 'configure'],
  [ResourceType.STORIES]: ['create', 'read', 'update', 'delete', 'assign', 'change_status'],
  [ResourceType.DEPLOYMENTS]: ['view', 'trigger', 'approve', 'rollback', 'configure'],
  [ResourceType.SECRETS]: ['view_masked', 'create', 'update', 'delete', 'view_plaintext'],
  [ResourceType.INTEGRATIONS]: ['view', 'connect', 'disconnect', 'configure'],
  [ResourceType.WORKSPACE]: [
    'view_members', 'invite_members', 'remove_members',
    'manage_roles', 'manage_billing', 'view_audit_log', 'manage_settings',
  ],
  [ResourceType.COST_MANAGEMENT]: ['view_own_usage', 'view_workspace_usage', 'set_budgets', 'export_reports'],
};

/**
 * Default permissions for each system base role.
 * When a custom role inherits from a base role, these defaults apply
 * unless overridden by explicit role_permissions entries.
 */
export const BASE_ROLE_DEFAULTS: Record<string, Record<string, Record<string, boolean>>> = {
  owner: {
    projects: { create: true, read: true, update: true, delete: true, manage_settings: true },
    agents: { view: true, create_custom: true, assign_tasks: true, pause_cancel: true, configure: true },
    stories: { create: true, read: true, update: true, delete: true, assign: true, change_status: true },
    deployments: { view: true, trigger: true, approve: true, rollback: true, configure: true },
    secrets: { view_masked: true, create: true, update: true, delete: true, view_plaintext: true },
    integrations: { view: true, connect: true, disconnect: true, configure: true },
    workspace: {
      view_members: true, invite_members: true, remove_members: true,
      manage_roles: true, manage_billing: true, view_audit_log: true, manage_settings: true,
    },
    cost_management: { view_own_usage: true, view_workspace_usage: true, set_budgets: true, export_reports: true },
  },
  admin: {
    projects: { create: true, read: true, update: true, delete: true, manage_settings: true },
    agents: { view: true, create_custom: true, assign_tasks: true, pause_cancel: true, configure: true },
    stories: { create: true, read: true, update: true, delete: true, assign: true, change_status: true },
    deployments: { view: true, trigger: true, approve: true, rollback: true, configure: true },
    secrets: { view_masked: true, create: true, update: true, delete: true, view_plaintext: false },
    integrations: { view: true, connect: true, disconnect: true, configure: true },
    workspace: {
      view_members: true, invite_members: true, remove_members: true,
      manage_roles: true, manage_billing: false, view_audit_log: true, manage_settings: true,
    },
    cost_management: { view_own_usage: true, view_workspace_usage: true, set_budgets: true, export_reports: true },
  },
  developer: {
    projects: { create: true, read: true, update: true, delete: false, manage_settings: false },
    agents: { view: true, create_custom: false, assign_tasks: true, pause_cancel: true, configure: false },
    stories: { create: true, read: true, update: true, delete: false, assign: true, change_status: true },
    deployments: { view: true, trigger: true, approve: false, rollback: false, configure: false },
    secrets: { view_masked: true, create: true, update: true, delete: false, view_plaintext: false },
    integrations: { view: true, connect: false, disconnect: false, configure: false },
    workspace: {
      view_members: true, invite_members: false, remove_members: false,
      manage_roles: false, manage_billing: false, view_audit_log: false, manage_settings: false,
    },
    cost_management: { view_own_usage: true, view_workspace_usage: false, set_budgets: false, export_reports: false },
  },
  viewer: {
    projects: { create: false, read: true, update: false, delete: false, manage_settings: false },
    agents: { view: true, create_custom: false, assign_tasks: false, pause_cancel: false, configure: false },
    stories: { create: false, read: true, update: false, delete: false, assign: false, change_status: false },
    deployments: { view: true, trigger: false, approve: false, rollback: false, configure: false },
    secrets: { view_masked: false, create: false, update: false, delete: false, view_plaintext: false },
    integrations: { view: true, connect: false, disconnect: false, configure: false },
    workspace: {
      view_members: true, invite_members: false, remove_members: false,
      manage_roles: false, manage_billing: false, view_audit_log: false, manage_settings: false,
    },
    cost_management: { view_own_usage: true, view_workspace_usage: false, set_budgets: false, export_reports: false },
  },
  none: {
    projects: { create: false, read: false, update: false, delete: false, manage_settings: false },
    agents: { view: false, create_custom: false, assign_tasks: false, pause_cancel: false, configure: false },
    stories: { create: false, read: false, update: false, delete: false, assign: false, change_status: false },
    deployments: { view: false, trigger: false, approve: false, rollback: false, configure: false },
    secrets: { view_masked: false, create: false, update: false, delete: false, view_plaintext: false },
    integrations: { view: false, connect: false, disconnect: false, configure: false },
    workspace: {
      view_members: false, invite_members: false, remove_members: false,
      manage_roles: false, manage_billing: false, view_audit_log: false, manage_settings: false,
    },
    cost_management: { view_own_usage: false, view_workspace_usage: false, set_budgets: false, export_reports: false },
  },
};

@Entity('role_permissions')
@Unique(['roleId', 'resourceType', 'permission'])
@Index(['roleId'])
@Index(['roleId', 'resourceType'])
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'role_id' })
  @IsUUID()
  roleId!: string;

  @ManyToOne(() => CustomRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: CustomRole;

  @Column({ type: 'varchar', length: 50, name: 'resource_type' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  resourceType!: string;

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  permission!: string;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  granted!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
