import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Workspace } from './workspace.entity';

export enum ContextTier {
  TIER_1_ACTIVE = 'tier_1_active',
  TIER_2_RECENT = 'tier_2_recent',
  TIER_3_ARCHIVED = 'tier_3_archived',
}

/**
 * ContextSnapshot Entity
 * Story 5.7: Three-Tier Context Recovery System
 *
 * Stores versioned context snapshots for agents across storage tiers.
 * Enables context recovery across compressions, restarts, and failures.
 */
@Entity('context_snapshots')
@Index(['agentId', 'version'], { unique: true })
@Index(['workspaceId', 'agentId'])
@Index(['tier', 'createdAt'])
export class ContextSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId!: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({
    type: 'enum',
    enum: ContextTier,
  })
  tier!: ContextTier;

  @Column({ name: 'context_data', type: 'jsonb', nullable: true })
  contextData!: Record<string, any> | null;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
}
