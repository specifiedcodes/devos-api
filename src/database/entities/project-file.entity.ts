/**
 * ProjectFile Entity
 * Story 16.2: File Upload/Download API (AC1)
 *
 * Represents a file uploaded to a project within a workspace.
 * Uses soft-delete for safe file lifecycle management.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

@Entity({ name: 'project_files', schema: 'public' })
@Index(['projectId', 'path', 'filename'], { unique: true, where: '"deleted_at" IS NULL' })
@Index(['workspaceId'])
@Index(['projectId'])
@Index(['uploadedBy'])
@Index(['mimeType'])
@Index(['deletedAt'])
export class ProjectFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 1000 })
  path!: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType!: string;

  @Column({ type: 'bigint', name: 'size_bytes' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 500, name: 'storage_key' })
  storageKey!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', name: 'uploaded_by' })
  uploadedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploader!: User;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
