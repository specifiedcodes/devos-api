import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Agent, AgentType } from './agent.entity';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';

/**
 * AgentStatusUpdate Entity
 * Story 9.3: Agent Status Updates
 *
 * Persists status update history for audit and display purposes.
 * Each record represents a single status change event.
 */
@Entity('agent_status_updates')
@Index(['agentId', 'createdAt'])
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'agentId', 'createdAt'])
export class AgentStatusUpdate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @Index()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @Column({ name: 'agent_id', type: 'uuid' })
  @Index()
  agentId!: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent;

  @Column({ name: 'agent_type', type: 'varchar', length: 50 })
  agentType!: string; // AgentType enum value

  @Column({ name: 'agent_name', type: 'varchar', length: 255 })
  agentName!: string;

  @Column({ name: 'previous_status', type: 'varchar', length: 50, nullable: true })
  previousStatus!: string | null; // AgentActivityStatus enum value

  @Column({ name: 'new_status', type: 'varchar', length: 50 })
  newStatus!: string; // AgentActivityStatus enum value

  @Column({ type: 'text' })
  message!: string; // Human-readable status message

  @Column({ name: 'category', type: 'varchar', length: 50 })
  category!: string; // StatusUpdateCategory enum value

  /**
   * Extra context metadata (task ID, file names, test counts, etc.)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  /**
   * Whether this status update was posted to chat
   */
  @Column({ name: 'posted_to_chat', type: 'boolean', default: false })
  postedToChat!: boolean;

  /**
   * ID of the chat message if posted
   */
  @Column({ name: 'chat_message_id', type: 'uuid', nullable: true })
  chatMessageId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

/**
 * Type guard for AgentStatusUpdate
 */
export function isValidAgentStatusUpdate(value: unknown): value is AgentStatusUpdate {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    typeof obj.workspaceId === 'string' &&
    typeof obj.agentId === 'string' &&
    typeof obj.agentType === 'string' &&
    typeof obj.agentName === 'string' &&
    typeof obj.newStatus === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.category === 'string'
  );
}
