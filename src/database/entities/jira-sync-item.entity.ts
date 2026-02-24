/**
 * JiraSyncItem Entity
 * Story 21.6: Jira Two-Way Sync (AC1)
 *
 * Per-story sync tracking between DevOS stories and Jira issues.
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
import { JiraIntegration } from './jira-integration.entity';
import { Story } from './story.entity';

export enum JiraSyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  CONFLICT = 'conflict',
  ERROR = 'error',
}

@Entity('jira_sync_items')
@Index(['jiraIntegrationId', 'devosStoryId'], { unique: true })
@Index(['jiraIntegrationId', 'jiraIssueId'], { unique: true })
@Index(['jiraIssueKey'])
@Index(['syncStatus'])
@Index(['jiraIntegrationId'])
export class JiraSyncItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'jira_integration_id' })
  jiraIntegrationId!: string;

  @ManyToOne(() => JiraIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jira_integration_id' })
  jiraIntegration?: JiraIntegration;

  @Column({ type: 'uuid', name: 'devos_story_id' })
  devosStoryId!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devos_story_id' })
  devosStory?: Story;

  @Column({ type: 'varchar', length: 30, name: 'jira_issue_key' })
  jiraIssueKey!: string; // e.g., "PROJ-123"

  @Column({ type: 'varchar', length: 100, name: 'jira_issue_id' })
  jiraIssueId!: string; // Jira internal issue ID

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'jira_issue_type', default: 'Story' })
  jiraIssueType?: string;

  @Column({ type: 'timestamptz', name: 'last_synced_at', default: () => 'NOW()' })
  lastSyncedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_devos_update_at' })
  lastDevosUpdateAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_jira_update_at' })
  lastJiraUpdateAt?: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'sync_status', default: JiraSyncStatus.SYNCED })
  syncStatus!: JiraSyncStatus;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'sync_direction_last' })
  syncDirectionLast?: 'devos_to_jira' | 'jira_to_devos' | null;

  @Column({ type: 'jsonb', nullable: true, name: 'conflict_details' })
  conflictDetails?: {
    devosValue: Record<string, unknown>;
    jiraValue: Record<string, unknown>;
    conflictedFields: string[];
    detectedAt: string;
  } | null;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'`, name: 'metadata' })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
