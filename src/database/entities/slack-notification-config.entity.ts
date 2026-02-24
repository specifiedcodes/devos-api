/**
 * SlackNotificationConfig Entity
 * Story 21.2: Slack Interactive Components (AC1)
 *
 * Per-project, per-event-type notification routing configuration.
 * Allows granular control over which Slack channels receive which event types.
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

@Entity('slack_notification_configs')
@Index(['slackIntegrationId', 'eventType', 'projectId'], { unique: true })
@Index(['slackIntegrationId'])
@Index(['projectId'])
export class SlackNotificationConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'slack_integration_id' })
  slackIntegrationId!: string;

  @ManyToOne(() => SlackIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slack_integration_id' })
  slackIntegration?: SlackIntegration;

  @Column({ type: 'uuid', nullable: true, name: 'project_id' })
  projectId?: string | null; // null = all projects

  @Column({ type: 'varchar', length: 50, name: 'event_type' })
  eventType!: string; // NotificationType or extended interactive types

  @Column({ type: 'varchar', length: 50, name: 'channel_id' })
  channelId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'channel_name' })
  channelName?: string;

  @Column({ type: 'boolean', default: true, name: 'is_enabled' })
  isEnabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
