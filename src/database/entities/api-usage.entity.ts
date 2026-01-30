import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { BYOKKey } from './byok-key.entity';

/**
 * API provider enum for AI services
 */
export enum ApiProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
}

/**
 * Individual API usage record for real-time cost tracking
 * Stores each AI API call with calculated cost
 *
 * This entity differs from UsageRecord which aggregates daily usage.
 * ApiUsage stores individual transactions for detailed tracking and auditing.
 */
@Entity('api_usage')
@Index('idx_api_usage_workspace_date', ['workspaceId', 'createdAt'])
@Index('idx_api_usage_project_date', ['projectId', 'createdAt'])
@Index('idx_api_usage_byok_key', ['byokKeyId', 'createdAt'])
export class ApiUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string | null;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @Column({ name: 'agent_id', type: 'varchar', length: 255, nullable: true })
  agentId?: string | null;

  @Column({ name: 'byok_key_id', type: 'uuid', nullable: true })
  byokKeyId?: string | null;

  @ManyToOne(() => BYOKKey, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'byok_key_id' })
  byokKey?: BYOKKey | null;

  @Column({
    type: 'varchar',
    length: 20,
  })
  provider!: ApiProvider;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'input_tokens', type: 'integer' })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer' })
  outputTokens!: number;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 10, scale: 6 })
  costUsd!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
