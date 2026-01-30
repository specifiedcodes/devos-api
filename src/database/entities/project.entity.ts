import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsUUID, IsOptional, IsUrl, IsEnum } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { ProjectPreferences } from './project-preferences.entity';

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

@Entity('projects')
@Index(['workspaceId', 'name'], { unique: true })
@Index(['workspaceId'])
@Index(['createdByUserId'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  name!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'template_id' })
  @IsOptional()
  templateId?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'github_repo_url' })
  @IsOptional()
  @IsUrl()
  githubRepoUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'deployment_url' })
  @IsOptional()
  @IsUrl()
  deploymentUrl?: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'uuid', name: 'created_by_user_id' })
  @IsUUID()
  createdByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: User;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.ACTIVE,
  })
  @IsEnum(ProjectStatus)
  status!: ProjectStatus;

  @OneToOne(() => ProjectPreferences, (preferences) => preferences.project, {
    cascade: true,
    eager: true,
  })
  preferences?: ProjectPreferences;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
