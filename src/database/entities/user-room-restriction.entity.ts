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

/**
 * Restriction type - mute or ban
 * Story 9.10: Multi-User Chat
 */
export enum RestrictionType {
  MUTE = 'mute',
  BAN = 'ban',
}

/**
 * UserRoomRestriction Entity
 * Story 9.10: Multi-User Chat
 *
 * Represents a mute or ban on a user in a chat room
 */
@Entity('user_room_restrictions')
@Index(['roomId'])
@Index(['userId'])
@Unique(['roomId', 'userId', 'type'])
export class UserRoomRestriction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: RestrictionType,
  })
  type!: RestrictionType;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
