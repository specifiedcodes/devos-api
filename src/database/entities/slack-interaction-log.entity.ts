/**
 * SlackInteractionLog Entity
 * Story 21.2: Slack Interactive Components (AC9)
 *
 * Logs all Slack interactive component interactions (button clicks,
 * modal submissions, slash commands) for audit and debugging.
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
import { SlackIntegration } from './slack-integration.entity';

@Entity('slack_interaction_logs')
@Index(['workspaceId', 'createdAt'])
@Index(['slackIntegrationId'])
export class SlackInteractionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'uuid', name: 'slack_integration_id' })
  slackIntegrationId!: string;

  @ManyToOne(() => SlackIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slack_integration_id' })
  slackIntegration?: SlackIntegration;

  @Column({ type: 'varchar', length: 50, name: 'slack_user_id' })
  slackUserId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'devos_user_id' })
  devosUserId?: string | null;

  @Column({ type: 'varchar', length: 50, name: 'interaction_type' })
  interactionType!: string; // 'block_actions' | 'view_submission' | 'slash_command'

  @Column({ type: 'varchar', length: 100, name: 'action_id' })
  actionId!: string;

  @Column({ type: 'jsonb', name: 'payload' })
  payload!: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'pending', name: 'result_status' })
  resultStatus!: string; // 'pending' | 'success' | 'error' | 'unauthorized'

  @Column({ type: 'text', nullable: true, name: 'result_message' })
  resultMessage?: string | null;

  @Column({ type: 'integer', nullable: true, name: 'response_time_ms' })
  responseTimeMs?: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
