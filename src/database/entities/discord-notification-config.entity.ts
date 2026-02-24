/**
 * DiscordNotificationConfig Entity
 * Story 21.3: Discord Webhook Integration (AC1)
 *
 * Per-event-type notification routing configuration for Discord.
 * Enables fine-grained control over which Discord channels receive which event types,
 * with optional per-project overrides.
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
import { DiscordIntegration } from './discord-integration.entity';

@Entity('discord_notification_configs')
@Index(['discordIntegrationId', 'eventType'], { unique: false })
@Index(['projectId'])
export class DiscordNotificationConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'discord_integration_id' })
  discordIntegrationId!: string;

  @ManyToOne(() => DiscordIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discord_integration_id' })
  discordIntegration?: DiscordIntegration;

  @Column({ type: 'uuid', nullable: true, name: 'project_id' })
  projectId?: string | null;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'text', nullable: true, name: 'webhook_url' })
  webhookUrl?: string | null; // AES-256 encrypted; null = use default webhook

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'webhook_url_iv' })
  webhookUrlIv?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'channel_name' })
  channelName?: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_enabled' })
  isEnabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
