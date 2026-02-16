/**
 * EmailConfiguration Entity
 * Story 16.6: Production Email Service (AC2)
 *
 * Stores email provider configuration per workspace.
 * SMTP passwords and API keys are AES-256 encrypted via EncryptionService.
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

@Entity('email_configurations')
@Index(['workspaceId'], { unique: true })
@Index(['status'])
@Index(['provider'])
export class EmailConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 20, default: 'smtp' })
  provider!: string; // 'smtp' | 'sendgrid' | 'ses'

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'smtp_host' })
  smtpHost?: string;

  @Column({ type: 'integer', default: 587, name: 'smtp_port' })
  smtpPort!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'smtp_user' })
  smtpUser?: string;

  @Column({ type: 'text', nullable: true, name: 'smtp_pass' })
  smtpPass?: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'smtp_pass_iv' })
  smtpPassIv?: string;

  @Column({ type: 'text', nullable: true, name: 'api_key' })
  apiKey?: string; // AES-256 encrypted (for SendGrid/SES)

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'api_key_iv' })
  apiKeyIv?: string;

  @Column({ type: 'varchar', length: 255, default: 'noreply@devos.app', name: 'from_address' })
  fromAddress!: string;

  @Column({ type: 'varchar', length: 255, default: 'DevOS', name: 'from_name' })
  fromName!: string;

  @Column({ type: 'varchar', length: 255, default: 'support@devos.app', name: 'reply_to' })
  replyTo!: string;

  @Column({ type: 'uuid', name: 'connected_by' })
  connectedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'connected_by' })
  connectedByUser?: User;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string; // 'active' | 'disabled' | 'error'

  @Column({ type: 'integer', default: 100, name: 'rate_limit_per_hour' })
  rateLimitPerHour!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_sent_at' })
  lastSentAt?: Date | null;

  @Column({ type: 'integer', default: 0, name: 'total_sent' })
  totalSent!: number;

  @Column({ type: 'integer', default: 0, name: 'total_bounced' })
  totalBounced!: number;

  @Column({ type: 'integer', default: 0, name: 'total_complaints' })
  totalComplaints!: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_error_at' })
  lastErrorAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
