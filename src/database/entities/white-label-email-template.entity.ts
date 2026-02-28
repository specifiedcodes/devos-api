/**
 * White-Label Email Template Entity
 * Story 22-2: White-Label Email Templates (AC1)
 *
 * Stores per-workspace custom email templates with white-label branding.
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
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum WhiteLabelEmailTemplateType {
  INVITATION = 'invitation',
  PASSWORD_RESET = 'password_reset',
  TWO_FA_SETUP = '2fa_setup',
  DEPLOYMENT = 'deployment',
  COST_ALERT = 'cost_alert',
  WEEKLY_DIGEST = 'weekly_digest',
}

@Entity('white_label_email_templates')
@Index(['workspaceId', 'templateType'], { unique: true })
export class WhiteLabelEmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({
    type: 'enum',
    enum: WhiteLabelEmailTemplateType,
    name: 'template_type',
  })
  templateType!: WhiteLabelEmailTemplateType;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text', name: 'body_html' })
  bodyHtml!: string;

  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText?: string | null;

  @Column({ type: 'boolean', name: 'is_custom', default: true })
  isCustom!: boolean;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
