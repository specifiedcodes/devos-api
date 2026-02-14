/**
 * PipelineStateHistory Entity
 * Story 11.1: Orchestrator State Machine Core
 *
 * Persists an audit log of every pipeline state transition to PostgreSQL.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { PipelineState } from '../interfaces/pipeline.interfaces';

@Entity('pipeline_state_history')
@Index(['projectId', 'createdAt'])
@Index(['workspaceId', 'createdAt'])
@Index(['workflowId'])
export class PipelineStateHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Column({
    name: 'previous_state',
    type: 'varchar',
    length: 50,
  })
  previousState!: PipelineState;

  @Column({
    name: 'new_state',
    type: 'varchar',
    length: 50,
  })
  newState!: PipelineState;

  @Column({ name: 'triggered_by', type: 'varchar', length: 255 })
  triggeredBy!: string;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId!: string | null;

  @Column({ name: 'story_id', type: 'varchar', length: 255, nullable: true })
  storyId!: string | null;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata!: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
