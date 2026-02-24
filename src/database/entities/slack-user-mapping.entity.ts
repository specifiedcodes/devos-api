/**
 * SlackUserMapping Entity
 * Story 21.1: Slack OAuth Integration (AC1)
 *
 * Maps Slack users to DevOS users within a workspace,
 * enabling @mention notifications and permission-checked interactive actions.
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
import { SlackIntegration } from './slack-integration.entity';
import { User } from './user.entity';

@Entity('slack_user_mappings')
@Index(['workspaceId', 'slackUserId'], { unique: true })
@Index(['workspaceId', 'devosUserId'], { unique: true })
@Index(['slackIntegrationId'])
export class SlackUserMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'slack_integration_id' })
  slackIntegrationId!: string;

  @ManyToOne(() => SlackIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slack_integration_id' })
  slackIntegration?: SlackIntegration;

  @Column({ type: 'uuid', name: 'devos_user_id' })
  devosUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devos_user_id' })
  devosUser?: User;

  @Column({ type: 'varchar', length: 50, name: 'slack_user_id' })
  slackUserId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'slack_username' })
  slackUsername?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'slack_display_name' })
  slackDisplayName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'slack_email' })
  slackEmail?: string;

  @Column({ type: 'boolean', default: false, name: 'is_auto_mapped' })
  isAutoMapped!: boolean;

  @Column({ type: 'timestamptz', name: 'mapped_at', default: () => 'NOW()' })
  mappedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
