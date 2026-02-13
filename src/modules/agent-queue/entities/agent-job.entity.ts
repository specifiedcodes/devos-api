import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AgentJobType {
  SPAWN_AGENT = 'spawn-agent',
  EXECUTE_TASK = 'execute-task',
  RECOVER_CONTEXT = 'recover-context',
  TERMINATE_AGENT = 'terminate-agent',
  PROCESS_CHAT_MESSAGE = 'process-chat-message',
}

export enum AgentJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/**
 * AgentJob Entity
 * Story 5.1: BullMQ Task Queue Setup
 *
 * Persists agent job data for tracking and recovery
 */
@Entity('agent_jobs')
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'status'])
@Index(['jobType', 'status'])
export class AgentJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @Index()
  workspaceId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @Column({
    name: 'job_type',
    type: 'enum',
    enum: AgentJobType,
  })
  jobType!: AgentJobType;

  @Column({
    type: 'enum',
    enum: AgentJobStatus,
    default: AgentJobStatus.PENDING,
  })
  status!: AgentJobStatus;

  @Column({ name: 'bull_job_id', type: 'varchar', nullable: true })
  bullJobId!: string | null;

  @Column({ type: 'jsonb', nullable: false })
  data!: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result!: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
