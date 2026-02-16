import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('scim_configurations')
@Index(['workspaceId'], { unique: true })
export class ScimConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  enabled!: boolean;

  @Column({ type: 'varchar', length: 512, name: 'base_url', default: '' })
  baseUrl!: string;

  @Column({ type: 'varchar', length: 20, name: 'default_role', default: 'developer' })
  @IsNotEmpty()
  defaultRole!: string;

  @Column({ type: 'boolean', name: 'sync_groups', default: true })
  @IsBoolean()
  syncGroups!: boolean;

  @Column({ type: 'boolean', name: 'auto_deactivate', default: true })
  @IsBoolean()
  autoDeactivate!: boolean;

  @Column({ type: 'boolean', name: 'auto_reactivate', default: true })
  @IsBoolean()
  autoReactivate!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
