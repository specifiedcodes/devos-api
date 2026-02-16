import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID, IsArray } from 'class-validator';
import { Workspace } from './workspace.entity';

export enum ConflictResolution {
  LINK_EXISTING = 'link_existing',
  REJECT = 'reject',
  PROMPT_ADMIN = 'prompt_admin',
}

@Entity('jit_provisioning_configs')
@Index(['workspaceId'], { unique: true })
export class JitProvisioningConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'boolean', name: 'jit_enabled', default: true })
  @IsBoolean()
  jitEnabled!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'default_role', default: 'developer' })
  @IsNotEmpty()
  defaultRole!: string;

  @Column({ type: 'boolean', name: 'auto_update_profile', default: true })
  @IsBoolean()
  autoUpdateProfile!: boolean;

  @Column({ type: 'boolean', name: 'auto_update_roles', default: false })
  @IsBoolean()
  autoUpdateRoles!: boolean;

  @Column({ type: 'boolean', name: 'welcome_email', default: true })
  @IsBoolean()
  welcomeEmail!: boolean;

  @Column({ type: 'text', array: true, name: 'require_email_domains', nullable: true })
  @IsOptional()
  @IsArray()
  requireEmailDomains!: string[] | null;

  @Column({
    type: 'jsonb',
    name: 'attribute_mapping',
    default: () => `'{"email": "email", "firstName": "firstName", "lastName": "lastName", "displayName": "displayName", "groups": "groups", "department": "department", "jobTitle": "jobTitle"}'`,
  })
  attributeMapping!: Record<string, string>;

  @Column({
    type: 'jsonb',
    name: 'group_role_mapping',
    default: () => "'{}'",
  })
  groupRoleMapping!: Record<string, string>;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'conflict_resolution',
    default: ConflictResolution.LINK_EXISTING,
  })
  conflictResolution!: ConflictResolution;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
