/**
 * JiraIntegration Entity
 * Story 21.6: Jira Two-Way Sync (AC1)
 *
 * Stores Jira integration configuration per DevOS workspace.
 * Access tokens, refresh tokens, and webhook secrets are AES-256 encrypted via EncryptionService.
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

@Entity('jira_integrations')
@Index(['workspaceId'], { unique: true })
@Index(['cloudId'])
@Index(['isActive'])
export class JiraIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 500, name: 'jira_site_url' })
  jiraSiteUrl!: string; // e.g., "https://mycompany.atlassian.net"

  @Column({ type: 'varchar', length: 20, name: 'jira_project_key' })
  jiraProjectKey!: string; // e.g., "PROJ"

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'jira_project_name' })
  jiraProjectName?: string;

  @Column({ type: 'varchar', length: 100, name: 'cloud_id' })
  cloudId!: string; // Atlassian Cloud ID for the site

  @Column({ type: 'text', name: 'access_token' })
  accessToken!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'access_token_iv' })
  accessTokenIv!: string;

  @Column({ type: 'text', name: 'refresh_token' })
  refreshToken!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'refresh_token_iv' })
  refreshTokenIv!: string;

  @Column({ type: 'timestamptz', name: 'token_expires_at' })
  tokenExpiresAt!: Date;

  @Column({
    type: 'jsonb',
    name: 'status_mapping',
    default: () => `'{"backlog":"To Do","in_progress":"In Progress","review":"In Review","done":"Done"}'`,
  })
  statusMapping!: Record<string, string>;

  @Column({
    type: 'jsonb',
    name: 'field_mapping',
    default: () => `'{"title":"summary","description":"description","storyPoints":"story_points","priority":"priority"}'`,
  })
  fieldMapping!: Record<string, string>;

  @Column({ type: 'varchar', length: 50, name: 'issue_type', default: 'Story' })
  issueType!: string; // Story, Task, Bug, etc.

  @Column({ type: 'varchar', length: 20, name: 'sync_direction', default: 'bidirectional' })
  syncDirection!: 'devos_to_jira' | 'jira_to_devos' | 'bidirectional';

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'webhook_id' })
  webhookId?: string; // Jira webhook registration ID

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'webhook_secret' })
  webhookSecret?: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'webhook_secret_iv' })
  webhookSecretIv?: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'connected_by' })
  connectedBy!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connected_by' })
  connectedByUser?: User;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_sync_at' })
  lastSyncAt?: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_error_at' })
  lastErrorAt?: Date | null;

  @Column({ type: 'integer', default: 0, name: 'error_count' })
  errorCount!: number;

  @Column({ type: 'integer', default: 0, name: 'sync_count' })
  syncCount!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
