/**
 * TemplateAnalyticsEvent Entity
 *
 * Story 19-9: Template Analytics
 *
 * Stores analytics events for template interactions (views, installations, reviews).
 * Uses a dedicated table for template analytics, separate from the generic analytics_events table.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Template } from './template.entity';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

/**
 * Template analytics event types
 */
export enum TemplateAnalyticsEventType {
  VIEW = 'view',
  DETAIL_VIEW = 'detail_view',
  INSTALL_STARTED = 'install_started',
  INSTALL_COMPLETED = 'install_completed',
  INSTALL_FAILED = 'install_failed',
  REVIEW_SUBMITTED = 'review_submitted',
}

@Entity('template_analytics_events')
@Index(['templateId', 'createdAt'])
@Index(['eventType'])
@Index(['workspaceId', 'createdAt'])
@Index(['userId', 'createdAt'])
export class TemplateAnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'template_id' })
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({
    type: 'enum',
    enum: TemplateAnalyticsEventType,
    name: 'event_type',
  })
  eventType!: TemplateAnalyticsEventType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
