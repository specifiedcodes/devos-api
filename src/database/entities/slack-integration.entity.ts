/**
 * SlackIntegration Entity
 * Story 16.4: Slack Notification Integration
 *
 * Stores Slack workspace integration configuration per DevOS workspace.
 * Bot tokens are AES-256 encrypted via EncryptionService.
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

@Entity('slack_integrations')
@Index(['workspaceId'], { unique: true })
@Index(['teamId'])
@Index(['status'])
export class SlackIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 50, name: 'team_id' })
  teamId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'team_name' })
  teamName?: string;

  @Column({ type: 'text', name: 'bot_token' })
  botToken!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'bot_token_iv' })
  botTokenIV!: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'bot_user_id' })
  botUserId?: string;

  @Column({ type: 'text', nullable: true, name: 'incoming_webhook_url' })
  incomingWebhookUrl?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'incoming_webhook_channel' })
  incomingWebhookChannel?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'default_channel_id' })
  defaultChannelId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'default_channel_name' })
  defaultChannelName?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  scopes?: string;

  @Column({ type: 'uuid', name: 'connected_by' })
  connectedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'connected_by' })
  connectedByUser?: User;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string; // 'active' | 'disconnected' | 'error' | 'revoked'

  @Column({ type: 'jsonb', default: {}, name: 'event_channel_config' })
  eventChannelConfig!: Record<string, { channelId: string; channelName: string }>;

  @Column({ type: 'jsonb', nullable: true, name: 'quiet_hours_config' })
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;

  @Column({ type: 'integer', default: 60, name: 'rate_limit_per_hour' })
  rateLimitPerHour!: number;

  @Column({ type: 'jsonb', default: { critical: '@here', normal: null }, name: 'mention_config' })
  mentionConfig!: Record<string, string | null>;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_message_at' })
  lastMessageAt?: Date | null;

  @Column({ type: 'integer', default: 0, name: 'message_count' })
  messageCount!: number;

  @Column({ type: 'integer', default: 0, name: 'error_count' })
  errorCount!: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_error_at' })
  lastErrorAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'connected_at', default: () => 'NOW()' })
  connectedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
