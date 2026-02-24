/**
 * DiscordInteractionLog Entity
 * Story 21.4: Discord Bot (Optional) (AC1)
 *
 * Logs all Discord bot interactions (slash commands) for auditing,
 * analytics, and debugging. Records command name, args, result,
 * and response time.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('discord_interaction_logs')
@Index(['workspaceId', 'createdAt'])
@Index(['discordIntegrationId'])
@Index(['discordUserId'])
export class DiscordInteractionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'uuid', name: 'discord_integration_id' })
  discordIntegrationId!: string;

  @Column({ type: 'varchar', length: 50, name: 'discord_user_id' })
  discordUserId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'devos_user_id' })
  devosUserId?: string | null;

  @Column({ type: 'varchar', length: 50, name: 'command_name' })
  commandName!: string; // 'status' | 'agents' | 'deploy' | 'costs' | 'link' | 'help'

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'command_args' })
  commandArgs?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending', name: 'result_status' })
  resultStatus!: string; // 'pending' | 'success' | 'error' | 'unauthorized' | 'not_linked'

  @Column({ type: 'text', nullable: true, name: 'result_message' })
  resultMessage?: string | null;

  @Column({ type: 'integer', nullable: true, name: 'response_time_ms' })
  responseTimeMs?: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
