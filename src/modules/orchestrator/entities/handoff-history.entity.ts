/**
 * HandoffHistory Entity
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Persists an audit log of every agent-to-agent handoff to PostgreSQL.
 * Tracks the full handoff chain including normal transitions, QA rejections,
 * escalations, and story completions.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('handoff_history')
@Index(['workspaceId', 'storyId'])
@Index(['workspaceId', 'createdAt'])
export class HandoffHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'story_id', type: 'varchar', length: 255 })
  storyId!: string;

  @Column({ name: 'from_agent_type', type: 'varchar', length: 50 })
  fromAgentType!: string;

  @Column({ name: 'from_agent_id', type: 'varchar', length: 255 })
  fromAgentId!: string;

  @Column({ name: 'to_agent_type', type: 'varchar', length: 50 })
  toAgentType!: string;

  @Column({ name: 'to_agent_id', type: 'varchar', length: 255 })
  toAgentId!: string;

  @Column({ name: 'from_phase', type: 'varchar', length: 50 })
  fromPhase!: string;

  @Column({ name: 'to_phase', type: 'varchar', length: 50 })
  toPhase!: string;

  @Column({
    name: 'handoff_type',
    type: 'varchar',
    length: 50,
  })
  handoffType!: 'normal' | 'rejection' | 'escalation' | 'completion';

  @Column({ name: 'context_summary', type: 'text', default: '' })
  contextSummary!: string;

  @Column({ name: 'iteration_count', type: 'int', default: 0 })
  iterationCount!: number;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs!: number;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
