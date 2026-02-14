import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';
import { ChatMessage } from './chat-message.entity';

/**
 * Moderation actions
 * Story 9.10: Multi-User Chat
 */
export enum ModerationAction {
  DELETE_MESSAGE = 'delete_message',
  EDIT_MESSAGE = 'edit_message',
  MUTE_USER = 'mute_user',
  UNMUTE_USER = 'unmute_user',
  KICK_USER = 'kick_user',
  BAN_USER = 'ban_user',
  UNBAN_USER = 'unban_user',
  PIN_MESSAGE = 'pin_message',
  UNPIN_MESSAGE = 'unpin_message',
  LOCK_ROOM = 'lock_room',
  UNLOCK_ROOM = 'unlock_room',
}

/**
 * ModerationLog Entity
 * Story 9.10: Multi-User Chat
 *
 * Tracks moderation actions in chat rooms
 */
@Entity('moderation_log')
@Index(['roomId', 'createdAt'])
export class ModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'moderator_id', type: 'uuid' })
  moderatorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moderator_id' })
  moderator!: User;

  @Column({
    type: 'enum',
    enum: ModerationAction,
  })
  action!: ModerationAction;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_user_id' })
  targetUser!: User | null;

  @Column({ name: 'target_message_id', type: 'uuid', nullable: true })
  targetMessageId!: string | null;

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_message_id' })
  targetMessage!: ChatMessage | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
