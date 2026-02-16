import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';

export enum ScimOperation {
  CREATE_USER = 'create_user',
  UPDATE_USER = 'update_user',
  DEACTIVATE_USER = 'deactivate_user',
  REACTIVATE_USER = 'reactivate_user',
  DELETE_USER = 'delete_user',
  CREATE_GROUP = 'create_group',
  UPDATE_GROUP = 'update_group',
  DELETE_GROUP = 'delete_group',
  ADD_MEMBER = 'add_member',
  REMOVE_MEMBER = 'remove_member',
}

export enum ScimResourceType {
  USER = 'user',
  GROUP = 'group',
}

export enum ScimSyncStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

@Entity('scim_sync_logs')
@Index(['workspaceId'])
@Index(['createdAt'])
@Index(['resourceType', 'resourceId'])
export class ScimSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 30 })
  @IsNotEmpty()
  operation!: ScimOperation;

  @Column({ type: 'varchar', length: 20, name: 'resource_type' })
  @IsNotEmpty()
  resourceType!: ScimResourceType;

  @Column({ type: 'varchar', length: 255, name: 'resource_id', nullable: true })
  @IsOptional()
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'external_id', nullable: true })
  @IsOptional()
  externalId!: string | null;

  @Column({ type: 'varchar', length: 20, default: ScimSyncStatus.SUCCESS })
  status!: ScimSyncStatus;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  @IsOptional()
  errorMessage!: string | null;

  @Column({ type: 'jsonb', name: 'request_body', nullable: true })
  @IsOptional()
  requestBody!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'response_body', nullable: true })
  @IsOptional()
  responseBody!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true })
  @IsOptional()
  ipAddress!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
