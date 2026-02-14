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
import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

/**
 * PinnedMessage Entity
 * Story 9.10: Multi-User Chat
 *
 * Tracks pinned messages in chat rooms
 */
@Entity('pinned_messages')
@Index(['roomId', 'pinnedAt'])
@Unique(['roomId', 'messageId'])
export class PinnedMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: ChatMessage;

  @Column({ name: 'pinned_by_id', type: 'uuid' })
  pinnedById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pinned_by_id' })
  pinnedBy!: User;

  @CreateDateColumn({ name: 'pinned_at' })
  pinnedAt!: Date;
}
