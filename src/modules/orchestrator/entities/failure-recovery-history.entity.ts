/**
 * FailureRecoveryHistory Entity
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Persists an audit log of every failure detection and recovery attempt
 * to PostgreSQL. Provides a durable audit trail for debugging and compliance.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('failure_recovery_history')
@Index(['workspaceId', 'projectId'])
@Index(['storyId', 'createdAt'])
@Index(['sessionId'])
export class FailureRecoveryHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'story_id', type: 'varchar', length: 255 })
  storyId!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId!: string;

  @Column({ name: 'agent_type', type: 'varchar', length: 50 })
  agentType!: string;

  @Column({ name: 'failure_type', type: 'varchar', length: 50 })
  failureType!: string;

  @Column({ name: 'recovery_strategy', type: 'varchar', length: 50 })
  recoveryStrategy!: string;

  @Column({ name: 'retry_count', type: 'int' })
  retryCount!: number;

  @Column({
    name: 'checkpoint_commit_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  checkpointCommitHash!: string | null;

  @Column({ name: 'new_session_id', type: 'uuid', nullable: true })
  newSessionId!: string | null;

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ name: 'error_details', type: 'text' })
  errorDetails!: string;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs!: number;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
