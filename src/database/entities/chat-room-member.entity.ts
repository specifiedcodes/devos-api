import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';
import { Agent } from './agent.entity';

/**
 * Member roles within a chat room
 * Story 9.10: Multi-User Chat
 */
export enum ChatRoomMemberRole {
  OWNER = 'owner',     // Can delete room, manage all settings
  ADMIN = 'admin',     // Can manage members, moderate
  MEMBER = 'member',   // Can read/write messages
  READONLY = 'readonly', // Can only read (for audit/support)
}

/**
 * Member type - user or agent
 */
export enum ChatRoomMemberType {
  USER = 'user',
  AGENT = 'agent',
}

/**
 * ChatRoomMember Entity
 * Story 9.10: Multi-User Chat
 *
 * Represents membership in a chat room
 */
@Entity('chat_room_members')
@Index(['roomId'])
@Index(['userId'])
@Index(['agentId'])
@Unique(['roomId', 'userId'])
@Unique(['roomId', 'agentId'])
export class ChatRoomMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId!: string | null;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent | null;

  @Column({
    name: 'member_type',
    type: 'enum',
    enum: ChatRoomMemberType,
  })
  memberType!: ChatRoomMemberType;

  @Column({
    type: 'enum',
    enum: ChatRoomMemberRole,
    default: ChatRoomMemberRole.MEMBER,
  })
  role!: ChatRoomMemberRole;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt!: Date | null;

  @Column({ name: 'is_muted', type: 'boolean', default: false })
  isMuted!: boolean;

  @Column({ name: 'muted_until', type: 'timestamptz', nullable: true })
  mutedUntil!: Date | null;
}
