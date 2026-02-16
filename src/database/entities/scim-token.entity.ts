import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('scim_tokens')
@Index(['workspaceId'])
@Index(['tokenHash'])
export class ScimToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 128, name: 'token_hash' })
  @IsNotEmpty()
  tokenHash!: string;

  @Column({ type: 'varchar', length: 12, name: 'token_prefix' })
  @IsNotEmpty()
  tokenPrefix!: string;

  @Column({ type: 'varchar', length: 100, default: 'Default SCIM Token' })
  @IsNotEmpty()
  label!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'timestamp with time zone', name: 'last_used_at', nullable: true })
  @IsOptional()
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'expires_at', nullable: true })
  @IsOptional()
  expiresAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
