/**
 * EmailBounce Entity
 * Story 16.6: Production Email Service (AC3)
 *
 * Tracks email bounces per workspace for delivery management.
 * Hard bounces permanently block delivery; soft bounces allow retry after 24h.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Workspace } from './workspace.entity';

@Entity('email_bounces')
@Index(['workspaceId'])
@Index(['emailAddress'])
@Index(['bounceType'])
@Unique(['workspaceId', 'emailAddress'])
export class EmailBounce {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 320, name: 'email_address' })
  emailAddress!: string;

  @Column({ type: 'varchar', length: 20, default: 'hard', name: 'bounce_type' })
  bounceType!: string; // 'hard' | 'soft' | 'complaint'

  @Column({ type: 'text', nullable: true, name: 'bounce_reason' })
  bounceReason?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'original_template' })
  originalTemplate?: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()', name: 'bounced_at' })
  bouncedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
