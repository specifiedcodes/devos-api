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
import { IsNotEmpty, IsUUID, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';

@Entity('shared_links')
@Index(['token'], { unique: true })
@Index(['projectId'])
@Index(['workspaceId'])
@Index(['isActive'])
@Index(['token', 'isActive'])
export class SharedLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @IsUUID()
  @IsNotEmpty()
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'varchar', length: 64, unique: true })
  @IsNotEmpty()
  token!: string;

  @Column({ type: 'uuid', name: 'created_by_user_id' })
  @IsUUID()
  @IsNotEmpty()
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: User;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'expires_at' })
  @IsOptional()
  expiresAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'password_hash' })
  @IsOptional()
  passwordHash?: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'int', default: 0, name: 'view_count' })
  @IsInt()
  viewCount!: number;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'last_viewed_at' })
  @IsOptional()
  lastViewedAt?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
