import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum PermissionAuditEventType {
  // Role lifecycle events
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  ROLE_CLONED = 'role_cloned',

  // Permission change events
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  PERMISSION_BULK_UPDATED = 'permission_bulk_updated',

  // Member role assignment events
  MEMBER_ROLE_CHANGED = 'member_role_changed',
  MEMBER_REMOVED = 'member_removed',

  // IP allowlist events
  IP_ALLOWLIST_ENTRY_ADDED = 'ip_allowlist_entry_added',
  IP_ALLOWLIST_ENTRY_REMOVED = 'ip_allowlist_entry_removed',
  IP_ALLOWLIST_ENTRY_UPDATED = 'ip_allowlist_entry_updated',
  IP_ALLOWLIST_ENABLED = 'ip_allowlist_enabled',
  IP_ALLOWLIST_DISABLED = 'ip_allowlist_disabled',

  // Geo-restriction events
  GEO_RESTRICTION_UPDATED = 'geo_restriction_updated',

  // Access denial events
  ACCESS_DENIED_IP = 'access_denied_ip',
  ACCESS_DENIED_GEO = 'access_denied_geo',
  ACCESS_DENIED_PERMISSION = 'access_denied_permission',
}

@Entity('permission_audit_events')
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'eventType'])
@Index(['workspaceId', 'actorId'])
@Index(['workspaceId', 'targetUserId'])
@Index(['workspaceId', 'targetRoleId'])
export class PermissionAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'event_type',
  })
  @IsEnum(PermissionAuditEventType)
  eventType!: PermissionAuditEventType;

  /**
   * User who performed the action.
   */
  @Column({ type: 'uuid', name: 'actor_id' })
  @IsUUID()
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  /**
   * User affected by the action (e.g., member whose role was changed).
   * Null for events that don't target a specific user.
   */
  @Column({ type: 'uuid', name: 'target_user_id', nullable: true })
  @IsOptional()
  @IsUUID()
  targetUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_user_id' })
  targetUser?: User;

  /**
   * Role affected by the action.
   * Null for events that don't target a specific role.
   */
  @Column({ type: 'uuid', name: 'target_role_id', nullable: true })
  @IsOptional()
  @IsUUID()
  targetRoleId!: string | null;

  /**
   * Snapshot of the state before the change. JSONB column.
   * Contains structured data about what was changed.
   */
  @Column({ type: 'jsonb', name: 'before_state', nullable: true })
  beforeState!: Record<string, any> | null;

  /**
   * Snapshot of the state after the change. JSONB column.
   */
  @Column({ type: 'jsonb', name: 'after_state', nullable: true })
  afterState!: Record<string, any> | null;

  /**
   * Client IP address of the actor.
   */
  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress!: string | null;

  /**
   * User agent string of the actor's client. Truncated to prevent storage bloat.
   */
  @Column({ type: 'varchar', length: 500, name: 'user_agent', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
