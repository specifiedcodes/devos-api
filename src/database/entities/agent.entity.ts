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
import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { AgentActivityStatus } from '../../modules/agents/enums/agent-activity-status.enum';

export enum AgentType {
  DEV = 'dev',
  PLANNER = 'planner',
  QA = 'qa',
  DEVOPS = 'devops',
  ORCHESTRATOR = 'orchestrator',
}

export enum AgentStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}

// Re-export AgentActivityStatus for convenience
export { AgentActivityStatus };

/**
 * Agent Entity
 * Story 5.2: Agent Entity & Lifecycle Management
 *
 * Represents an autonomous AI agent instance
 */
@Entity('agents')
@Index(['workspaceId', 'status'])
@Index(['projectId', 'status'])
@Index(['type', 'status'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: AgentType,
  })
  type!: AgentType;

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.CREATED,
  })
  status!: AgentStatus;

  /**
   * Fine-grained activity status (Story 9.3: Agent Status Updates)
   * Tracks what the agent is actively doing (coding, testing, etc.)
   */
  @Column({
    name: 'activity_status',
    type: 'varchar',
    length: 50,
    default: AgentActivityStatus.IDLE,
    nullable: true,
  })
  activityStatus!: AgentActivityStatus | null;

  /**
   * Timestamp when the activity status last changed
   */
  @Column({ name: 'activity_status_since', type: 'timestamptz', nullable: true })
  activityStatusSince!: Date | null;

  /**
   * Human-readable description of current activity
   */
  @Column({ name: 'activity_message', type: 'text', nullable: true })
  activityMessage!: string | null;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @Index()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @Column({ type: 'jsonb', nullable: true })
  config!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  context!: Record<string, any> | null;

  @Column({ name: 'current_task', type: 'text', nullable: true })
  currentTask!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'last_heartbeat', type: 'timestamptz', nullable: true })
  lastHeartbeat!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
