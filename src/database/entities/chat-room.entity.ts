import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { User } from './user.entity';

/**
 * Chat room types
 * Story 9.10: Multi-User Chat
 */
export enum ChatRoomType {
  DIRECT = 'direct',       // 1:1 user-to-user or user-to-agent
  PROJECT = 'project',     // Project-specific channel
  WORKSPACE = 'workspace', // Workspace-wide channel
  GROUP = 'group',         // Custom group chat
}

/**
 * Chat room settings interface
 */
export interface ChatRoomSettings {
  allowAgents: boolean;        // Whether agents can participate
  allowedAgentTypes?: string[]; // Specific agent types allowed
  maxMembers?: number;         // Optional member limit
  messageRetentionDays?: number; // Custom retention
  threadingEnabled: boolean;   // Allow threaded replies
  reactionsEnabled: boolean;   // Allow emoji reactions
}

/**
 * Default chat room settings
 */
export const DEFAULT_CHAT_ROOM_SETTINGS: ChatRoomSettings = {
  allowAgents: true,
  threadingEnabled: false,
  reactionsEnabled: true,
};

/**
 * ChatRoom Entity
 * Story 9.10: Multi-User Chat
 *
 * Represents a chat room for multi-user communication
 */
@Entity('chat_rooms')
@Index(['workspaceId', 'type'])
@Index(['workspaceId', 'createdAt'])
@Index(['projectId'])
export class ChatRoom {
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

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: ChatRoomType,
    default: ChatRoomType.GROUP,
  })
  type!: ChatRoomType;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate!: boolean;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked!: boolean;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ type: 'jsonb', default: () => `'${JSON.stringify(DEFAULT_CHAT_ROOM_SETTINGS)}'` })
  settings!: ChatRoomSettings;

  @Column({ name: 'member_count', type: 'integer', default: 0 })
  memberCount!: number;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
