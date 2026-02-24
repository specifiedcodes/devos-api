/**
 * DiscordBotConfig Entity
 * Story 21.4: Discord Bot (Optional) (AC1)
 *
 * Stores Discord bot configuration per guild/workspace.
 * Bot token is AES-256 encrypted via EncryptionService.
 * Supports HTTP-based Discord Interactions Endpoint (slash commands).
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

@Entity('discord_bot_configs')
@Index(['discordIntegrationId'], { unique: true })
@Index(['guildId'], { unique: true })
export class DiscordBotConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'discord_integration_id', unique: true })
  discordIntegrationId!: string;

  @ManyToOne(() => DiscordIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discord_integration_id' })
  discordIntegration?: DiscordIntegration;

  @Column({ type: 'varchar', length: 50, name: 'guild_id', unique: true })
  guildId!: string;

  @Column({ type: 'text', name: 'bot_token' })
  botToken!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'bot_token_iv' })
  botTokenIv!: string;

  @Column({ type: 'varchar', length: 50, name: 'application_id' })
  applicationId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'public_key' })
  publicKey?: string; // Discord application public key for Ed25519 verification

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'command_channel_id' })
  commandChannelId?: string; // Restrict bot responses to this channel (null = all)

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'command_channel_name' })
  commandChannelName?: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string; // 'active' | 'disconnected' | 'error' | 'setup'

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: {}, name: 'enabled_commands' })
  enabledCommands!: Record<string, boolean>; // { status: true, agents: true, deploy: false, costs: true, help: true }

  @Column({ type: 'integer', default: 0, name: 'command_count' })
  commandCount!: number;

  @Column({ type: 'integer', default: 0, name: 'error_count' })
  errorCount!: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_error_at' })
  lastErrorAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_command_at' })
  lastCommandAt?: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'configured_by' })
  configuredBy!: string | null; // Nullable: SET NULL on user deletion per migration FK constraint

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
