import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';

/**
 * CLI Session Status
 * Story 8.5: CLI Session History and Replay
 */
export enum CliSessionStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}

/**
 * CLI Session Agent Type
 * Extended from backend Agent entity types
 * Story 8.5: CLI Session History and Replay
 */
export enum CliSessionAgentType {
  DEV = 'dev',
  QA = 'qa',
  DEVOPS = 'devops',
  PLANNER = 'planner',
  SECURITY = 'security',
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  DATABASE = 'database',
  PERFORMANCE = 'performance',
}

/**
 * CLI Session Entity
 * Story 8.5: CLI Session History and Replay
 *
 * Stores completed CLI session data for history viewing and replay.
 * Sessions are persisted when they terminate from the orchestrator.
 */
@Entity('cli_sessions')
@Index(['workspaceId', 'startedAt'])
@Index(['workspaceId', 'agentType'])
@Index(['workspaceId', 'status'])
@Index(['agentId'])
@Index(['projectId'])
export class CliSession {
  @PrimaryColumn('uuid')
  id!: string; // Same as sessionId from orchestrator

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'story_key', type: 'varchar', length: 50, nullable: true })
  storyKey!: string | null; // e.g., "8-5"

  @Column({
    name: 'agent_type',
    type: 'enum',
    enum: CliSessionAgentType,
  })
  agentType!: CliSessionAgentType;

  @Column({ name: 'output_text', type: 'text' })
  outputText!: string; // Compressed CLI output (gzip base64)

  @Column({ name: 'line_count', type: 'int' })
  lineCount!: number; // Total lines for UI display

  @Column({ name: 'output_size_bytes', type: 'int' })
  outputSizeBytes!: number; // Compressed size for quota tracking

  @Column({
    type: 'enum',
    enum: CliSessionStatus,
  })
  status!: CliSessionStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds!: number | null; // Calculated from startedAt to endedAt

  /**
   * Story 16.3: CLI Session Archive Storage
   * MinIO object key once session output is archived (e.g., {workspaceId}/{projectId}/{sessionId}.gz)
   */
  @Column({ name: 'storage_key', type: 'varchar', length: 500, nullable: true })
  storageKey!: string | null;

  /**
   * Story 16.3: CLI Session Archive Storage
   * Timestamp when session output was archived to MinIO
   */
  @Index()
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
