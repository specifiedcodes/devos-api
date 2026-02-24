/**
 * LinearIntegration Entity
 * Story 21.5: Linear Two-Way Sync (AC1)
 *
 * Stores Linear integration configuration per DevOS workspace.
 * Access tokens and webhook secrets are AES-256 encrypted via EncryptionService.
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

@Entity('linear_integrations')
@Index(['workspaceId'], { unique: true })
@Index(['linearTeamId'])
@Index(['isActive'])
export class LinearIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 100, name: 'linear_team_id' })
  linearTeamId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'linear_team_name' })
  linearTeamName?: string;

  @Column({ type: 'text', name: 'access_token' })
  accessToken!: string; // AES-256 encrypted

  @Column({ type: 'varchar', length: 100, name: 'access_token_iv' })
  accessTokenIv!: string;

  @Column({
    type: 'jsonb',
    name: 'status_mapping',
    default: () => `'{"backlog":"Backlog","in_progress":"In Progress","review":"In Review","done":"Done"}'`,
  })
  statusMapping!: Record<string, string>;

  @Column({
    type: 'jsonb',
    name: 'field_mapping',
    default: () => `'{"title":"title","description":"description","storyPoints":"estimate","priority":"priority"}'`,
  })
  fieldMapping!: Record<string, string>;

  @Column({ type: 'varchar', length: 20, name: 'sync_direction', default: 'bidirectional' })
  syncDirection!: 'devos_to_linear' | 'linear_to_devos' | 'bidirectional';

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
