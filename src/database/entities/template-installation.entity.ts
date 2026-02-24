/**
 * TemplateInstallation Entity
 *
 * Story 19-6: Template Installation Flow
 * Story 19-7: Template Versioning (added installedVersion field)
 *
 * Tracks the progress and state of template installations.
 */
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
import { IsOptional, Matches } from 'class-validator';
import { Template } from './template.entity';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { Project } from './project.entity';
import { TemplateVersion } from './template-version.entity';

/**
 * Installation status enum
 */
export enum InstallationStatus {
  PENDING = 'pending',
  FETCHING = 'fetching',
  PROCESSING = 'processing',
  CREATING_REPO = 'creating_repo',
  PUSHING = 'pushing',
  RUNNING_SCRIPTS = 'running_scripts',
  COMPLETE = 'complete',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Installation step enum for progress tracking
 */
export enum InstallationStep {
  INITIALIZED = 'initialized',
  FETCHING_SOURCE = 'fetching_source',
  VALIDATING_VARIABLES = 'validating_variables',
  PROCESSING_FILES = 'processing_files',
  CREATING_REPOSITORY = 'creating_repository',
  PUSHING_FILES = 'pushing_files',
  CREATING_PROJECT = 'creating_project',
  RUNNING_POST_INSTALL = 'running_post_install',
  RECORDING_USAGE = 'recording_usage',
  COMPLETED = 'completed',
}

@Entity({ name: 'template_installations', schema: 'public' })
@Index(['workspaceId', 'createdAt'])
@Index(['templateId', 'createdAt'])
@Index(['userId', 'status'])
export class TemplateInstallation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'template_id' })
  templateId!: string;

  @ManyToOne(() => Template)
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId?: string;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'varchar', length: 100, name: 'project_name' })
  projectName!: string;

  @Column({ type: 'jsonb' })
  variables!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: InstallationStatus,
    default: InstallationStatus.PENDING,
  })
  status!: InstallationStatus;

  @Column({
    type: 'enum',
    enum: InstallationStep,
    name: 'current_step',
    default: InstallationStep.INITIALIZED,
  })
  currentStep!: InstallationStep;

  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'varchar', length: 500, name: 'github_repo_url', nullable: true })
  githubRepoUrl?: string;

  @Column({ type: 'integer', name: 'github_repo_id', nullable: true })
  githubRepoId?: number;

  @Column({ type: 'boolean', name: 'create_new_repo', default: true })
  createNewRepo!: boolean;

  @Column({ type: 'boolean', name: 'repo_private', default: true })
  repoPrivate!: boolean;

  @Column({ type: 'varchar', length: 100, name: 'repo_name', nullable: true })
  repoName?: string;

  @Column({ type: 'boolean', name: 'skip_post_install', default: false })
  skipPostInstall!: boolean;

  @Column({ type: 'integer', name: 'total_files', default: 0 })
  totalFiles!: number;

  @Column({ type: 'integer', name: 'processed_files', default: 0 })
  processedFiles!: number;

  @Column({ type: 'varchar', length: 50, name: 'installed_version', nullable: true })
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'installed_version must follow semver format (e.g., 1.0.0)' })
  installedVersion?: string | null;

  @Column({ type: 'uuid', name: 'template_version_id', nullable: true })
  templateVersionId?: string | null;

  @ManyToOne(() => TemplateVersion, { nullable: true })
  @JoinColumn({ name: 'template_version_id' })
  templateVersion?: TemplateVersion | null;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
