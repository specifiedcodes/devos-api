/**
 * Agent Sandbox Session Entity
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Represents an isolated sandbox session for testing custom agent behavior,
 * tool usage, and outputs before deployment.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AgentDefinition } from './agent-definition.entity';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum SandboxSampleProject {
  NEXTJS = 'nextjs',
  EXPRESS = 'express',
  PYTHON = 'python',
  REACT = 'react',
  CUSTOM = 'custom',
}

export enum SandboxSessionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

@Entity('agent_sandbox_sessions')
@Index(['workspaceId'])
@Index(['agentDefinitionId'])
@Index(['userId'])
@Index(['status'])
@Index(['expiresAt'])
export class AgentSandboxSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'agent_definition_id' })
  agentDefinitionId!: string;

  @ManyToOne(() => AgentDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_definition_id' })
  agentDefinition?: AgentDefinition;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', name: 'test_scenario_id', nullable: true })
  testScenarioId?: string | null;

  @Column({
    type: 'enum',
    enum: SandboxSampleProject,
    name: 'sample_project',
    default: SandboxSampleProject.NEXTJS,
  })
  sampleProject!: SandboxSampleProject;

  @Column({ type: 'int', name: 'timeout_minutes', default: 10 })
  timeoutMinutes!: number;

  @Column({ type: 'int', name: 'max_tool_calls', default: 50 })
  maxToolCalls!: number;

  @Column({ type: 'int', name: 'max_tokens', default: 100000 })
  maxTokens!: number;

  @Column({
    type: 'enum',
    enum: SandboxSessionStatus,
    default: SandboxSessionStatus.PENDING,
  })
  status!: SandboxSessionStatus;

  @Column({ type: 'timestamp with time zone', name: 'started_at', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'completed_at', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'int', name: 'tokens_input', default: 0 })
  tokensInput!: number;

  @Column({ type: 'int', name: 'tokens_output', default: 0 })
  tokensOutput!: number;

  @Column({ type: 'int', name: 'tool_calls_count', default: 0 })
  toolCallsCount!: number;

  @Column({ type: 'int', name: 'estimated_cost_cents', default: 0 })
  estimatedCostCents!: number;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'jsonb', name: 'sandbox_config', default: {} })
  sandboxConfig!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'test_inputs', nullable: true })
  testInputs?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'test_outputs', nullable: true })
  testOutputs?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
