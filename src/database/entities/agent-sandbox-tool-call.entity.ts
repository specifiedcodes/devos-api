/**
 * Agent Sandbox Tool Call Entity
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Tracks individual tool calls during sandbox session execution.
 * Records tool input, output, status, and timing for analysis.
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
import { AgentSandboxSession } from './agent-sandbox-session.entity';

export enum SandboxToolCallStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  SUCCESS = 'success',
  DENIED = 'denied',
  ERROR = 'error',
}

@Entity('agent_sandbox_tool_calls')
@Index(['sandboxSessionId'])
@Index(['toolCategory'])
@Index(['status'])
export class AgentSandboxToolCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'sandbox_session_id' })
  sandboxSessionId!: string;

  @ManyToOne(() => AgentSandboxSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sandbox_session_id' })
  sandboxSession?: AgentSandboxSession;

  @Column({ type: 'varchar', length: 100, name: 'tool_category' })
  toolCategory!: string;

  @Column({ type: 'varchar', length: 100, name: 'tool_name' })
  toolName!: string;

  @Column({ type: 'jsonb', name: 'tool_input' })
  toolInput!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'tool_output', nullable: true })
  toolOutput?: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: SandboxToolCallStatus,
    default: SandboxToolCallStatus.PENDING,
  })
  status!: SandboxToolCallStatus;

  @Column({ type: 'text', name: 'denial_reason', nullable: true })
  denialReason?: string | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'int', name: 'duration_ms', default: 0 })
  durationMs!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
