/**
 * TemplateAuditEvent Entity
 *
 * Story 19-1: Template Registry Backend
 *
 * Audit event logging for template lifecycle changes.
 * Preserves audit trail even when templates are deleted.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { Template } from './template.entity';

export enum TemplateAuditEventType {
  TEMPLATE_CREATED = 'template_created',
  TEMPLATE_UPDATED = 'template_updated',
  TEMPLATE_DELETED = 'template_deleted',
  TEMPLATE_PUBLISHED = 'template_published',
  TEMPLATE_UNPUBLISHED = 'template_unpublished',
  TEMPLATE_USED = 'template_used',
  TEMPLATE_RATING_UPDATED = 'template_rating_updated',
  VERSION_PUBLISHED = 'version_published',
  VERSION_DELETED = 'version_deleted',
  // Story 19-8: Featured Templates Curation
  TEMPLATE_FEATURED = 'template_featured',
  TEMPLATE_UNFEATURED = 'template_unfeatured',
  TEMPLATES_REORDERED = 'templates_reordered',
  TEMPLATE_TEST_STATUS_UPDATED = 'template_test_status_updated',
}

@Entity('template_audit_events')
@Index(['workspaceId'])
@Index(['templateId'])
@Index(['eventType'])
@Index(['actorId'])
@Index(['createdAt'])
export class TemplateAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  @IsOptional()
  @IsUUID()
  workspaceId!: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace | null;

  @Column({ type: 'uuid', name: 'template_id', nullable: true })
  @IsOptional()
  @IsUUID()
  templateId!: string | null;

  @ManyToOne(() => Template, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_id' })
  template?: Template | null;

  @Column({ type: 'varchar', length: 60, name: 'event_type' })
  @IsNotEmpty()
  eventType!: TemplateAuditEventType;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  @IsOptional()
  @IsUUID()
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
