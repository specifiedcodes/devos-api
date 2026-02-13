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
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { Agent, AgentType } from './agent.entity';
import { User } from './user.entity';
import { ConversationThread } from './conversation-thread.entity';

/**
 * Sender type for chat messages
 */
export enum ChatSenderType {
  USER = 'user',
  AGENT = 'agent',
}

/**
 * Message delivery status
 */
export enum ChatMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

/**
 * ChatMessage Entity
 * Story 9.2: Send Message to Agent
 *
 * Represents a chat message between users and agents
 */
@Entity('chat_messages')
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'agentId', 'createdAt'])
@Index(['workspaceId', 'userId', 'createdAt'])
@Index(['workspaceId', 'conversationId', 'createdAt'])
export class ChatMessage {
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

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId!: string | null;

  @ManyToOne(() => Agent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({
    name: 'sender_type',
    type: 'enum',
    enum: ChatSenderType,
  })
  senderType!: ChatSenderType;

  @Column({
    name: 'agent_type',
    type: 'enum',
    enum: AgentType,
    nullable: true,
  })
  agentType!: AgentType | null;

  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'is_status_update', type: 'boolean', default: false })
  isStatusUpdate!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({
    type: 'enum',
    enum: ChatMessageStatus,
    default: ChatMessageStatus.SENT,
  })
  status!: ChatMessageStatus;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  @Index()
  conversationId!: string | null;

  @ManyToOne(() => ConversationThread, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: ConversationThread | null;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived!: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
