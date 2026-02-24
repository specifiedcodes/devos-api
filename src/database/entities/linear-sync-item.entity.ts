/**
 * LinearSyncItem Entity
 * Story 21.5: Linear Two-Way Sync (AC1)
 *
 * Per-story sync tracking between DevOS stories and Linear issues.
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
import { LinearIntegration } from './linear-integration.entity';
import { Story } from './story.entity';

export enum LinearSyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  CONFLICT = 'conflict',
  ERROR = 'error',
}

@Entity('linear_sync_items')
@Index(['linearIntegrationId', 'devosStoryId'], { unique: true })
@Index(['linearIntegrationId', 'linearIssueId'], { unique: true })
@Index(['syncStatus'])
@Index(['linearIntegrationId'])
export class LinearSyncItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'linear_integration_id' })
  linearIntegrationId!: string;

  @ManyToOne(() => LinearIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'linear_integration_id' })
  linearIntegration?: LinearIntegration;

  @Column({ type: 'uuid', name: 'devos_story_id' })
  devosStoryId!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devos_story_id' })
  devosStory?: Story;

  @Column({ type: 'varchar', length: 100, name: 'linear_issue_id' })
  linearIssueId!: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'linear_issue_identifier' })
  linearIssueIdentifier?: string; // e.g., "ENG-123"

  @Column({ type: 'timestamptz', name: 'last_synced_at', default: () => 'NOW()' })
  lastSyncedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_devos_update_at' })
  lastDevosUpdateAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_linear_update_at' })
  lastLinearUpdateAt?: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'sync_status', default: LinearSyncStatus.SYNCED })
  syncStatus!: LinearSyncStatus;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'sync_direction_last' })
  syncDirectionLast?: 'devos_to_linear' | 'linear_to_devos' | null;

  @Column({ type: 'jsonb', nullable: true, name: 'conflict_details' })
  conflictDetails?: {
    devosValue: Record<string, unknown>;
    linearValue: Record<string, unknown>;
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
