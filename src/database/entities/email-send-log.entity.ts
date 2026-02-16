/**
 * EmailSendLog Entity
 * Story 16.6: Production Email Service (AC4)
 *
 * Tracks all email send attempts for auditing and debugging.
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
import { Workspace } from './workspace.entity';

@Entity('email_send_log')
@Index(['workspaceId'])
@Index(['status'])
@Index(['template'])
@Index(['recipientEmail'])
@Index(['createdAt'])
export class EmailSendLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 320, name: 'recipient_email' })
  recipientEmail!: string;

  @Column({ type: 'varchar', length: 50 })
  template!: string;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status!: string; // 'queued' | 'sent' | 'failed' | 'bounced'

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'message_id' })
  messageId?: string;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'sent_at' })
  sentAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
