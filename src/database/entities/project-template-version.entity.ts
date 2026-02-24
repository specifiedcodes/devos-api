/**
 * ProjectTemplateVersion Entity
 *
 * Story 19-7: Template Versioning
 *
 * Tracks which template version was used for each project,
 * enabling update detection and version tracking.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsUUID, IsBoolean, IsOptional, Matches } from 'class-validator';
import { Project } from './project.entity';
import { Template } from './template.entity';
import { TemplateVersion } from './template-version.entity';

/**
 * Update type enum for tracking the type of available update
 */
export enum TemplateUpdateType {
  PATCH = 'patch',
  MINOR = 'minor',
  MAJOR = 'major',
}

@Entity('project_template_versions')
@Index(['projectId'], { unique: true })
@Index(['templateId'])
@Index(['updateAvailable'])
@Index(['lastCheckedAt'])
export class ProjectTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @IsNotEmpty()
  @IsUUID()
  projectId!: string;

  @OneToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'template_id' })
  @IsNotEmpty()
  @IsUUID()
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column({ type: 'uuid', name: 'template_version_id', nullable: true })
  @IsOptional()
  @IsUUID()
  templateVersionId?: string | null;

  @ManyToOne(() => TemplateVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_version_id' })
  templateVersion?: TemplateVersion | null;

  @Column({ type: 'varchar', length: 50, name: 'installed_version' })
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'installed_version must follow semver format (e.g., 1.0.0)' })
  installedVersion!: string;

  @Column({ type: 'varchar', length: 50, name: 'latest_version', nullable: true })
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'latest_version must follow semver format (e.g., 1.0.0)' })
  latestVersion?: string | null;

  @Column({ type: 'boolean', name: 'update_available', default: false })
  @IsBoolean()
  updateAvailable!: boolean;

  @Column({
    type: 'enum',
    enum: TemplateUpdateType,
    name: 'update_type',
    nullable: true,
  })
  @IsOptional()
  updateType?: TemplateUpdateType | null;

  @Column({ type: 'timestamp with time zone', name: 'last_checked_at', nullable: true })
  lastCheckedAt?: Date;

  @Column({ type: 'varchar', length: 50, name: 'dismissed_version', nullable: true })
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'dismissed_version must follow semver format' })
  dismissedVersion?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
