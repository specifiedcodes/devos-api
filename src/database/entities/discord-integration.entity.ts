/**
 * DiscordIntegration Entity
 * Story 16.5: Discord Notification Integration (AC2)
 *
 * Stores Discord webhook integration configuration per DevOS workspace.
 * Webhook URLs are AES-256 encrypted via EncryptionService.
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

@Entity('discord_integrations')
@Index(['workspaceId'], { unique: true })
@Index(['guildId'])
@Index(['status'])
export class DiscordIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255, default: 'Discord' })
  name!: string;

  @Column({ type: 'text', name: 'default_webhook_url' })
  defaultWebhookUrl!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'default_webhook_url_iv' })
  defaultWebhookUrlIv!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'default_webhook_id' })
  defaultWebhookId?: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'default_webhook_token' })
  defaultWebhookToken?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'default_channel_name' })
  defaultChannelName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'guild_id' })
  guildId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'guild_name' })
  guildName?: string;

  @Column({ type: 'uuid', name: 'connected_by' })
  connectedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'connected_by' })
  connectedByUser?: User;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string; // 'active' | 'disconnected' | 'error' | 'invalid_webhook'

  @Column({ type: 'jsonb', default: {}, name: 'event_webhook_config' })
  eventWebhookConfig!: Record<string, { webhookUrl: string; webhookUrlIv: string; channelName: string }>;

  @Column({ type: 'jsonb', nullable: true, name: 'quiet_hours_config' })
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;

  @Column({ type: 'integer', default: 30, name: 'rate_limit_per_minute' })
  rateLimitPerMinute!: number;

  @Column({ type: 'jsonb', default: { critical: null, normal: null }, name: 'mention_config' })
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
