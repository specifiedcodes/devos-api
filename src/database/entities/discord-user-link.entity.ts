/**
 * DiscordUserLink Entity
 * Story 21.4: Discord Bot (Optional) (AC1)
 *
 * Maps Discord users to DevOS users for permission enforcement
 * in bot commands. Follows the same pattern as Slack user mapping.
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
import { DiscordIntegration } from './discord-integration.entity';
import { User } from './user.entity';

@Entity('discord_user_links')
@Index(['workspaceId', 'discordUserId'], { unique: true })
@Index(['workspaceId', 'devosUserId'], { unique: true })
@Index(['discordIntegrationId'])
@Index(['linkToken'], { unique: true, where: '"link_token" IS NOT NULL' })
export class DiscordUserLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'discord_integration_id' })
  discordIntegrationId!: string;

  @ManyToOne(() => DiscordIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discord_integration_id' })
  discordIntegration?: DiscordIntegration;

  @Column({ type: 'uuid', nullable: true, name: 'devos_user_id' })
  devosUserId!: string | null; // Nullable for pending links before DevOS user is mapped

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devos_user_id' })
  devosUser?: User;

  @Column({ type: 'varchar', length: 50, name: 'discord_user_id' })
  discordUserId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'discord_username' })
  discordUsername?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'discord_display_name' })
  discordDisplayName?: string;

  @Column({ type: 'varchar', length: 20, default: 'linked' })
  status!: string; // 'pending' | 'linked' | 'unlinked'

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'link_token' })
  linkToken?: string | null; // One-time token for linking flow

  @Column({ type: 'timestamptz', nullable: true, name: 'link_token_expires_at' })
  linkTokenExpiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'linked_at' })
  linkedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
