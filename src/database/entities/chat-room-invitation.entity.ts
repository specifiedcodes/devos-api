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
import { ChatRoomMemberRole } from './chat-room-member.entity';

/**
 * Invitation status
 * Story 9.10: Multi-User Chat
 */
export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

/**
 * ChatRoomInvitation Entity
 * Story 9.10: Multi-User Chat
 *
 * Represents an invitation to join a chat room
 */
@Entity('chat_room_invitations')
@Index(['invitedUserId', 'status'])
@Index(['roomId', 'status'])
export class ChatRoomInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room!: ChatRoom;

  @Column({ name: 'invited_by_id', type: 'uuid' })
  invitedById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy!: User;

  @Column({ name: 'invited_user_id', type: 'uuid' })
  invitedUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_user_id' })
  invitedUser!: User;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  @Column({
    type: 'enum',
    enum: ChatRoomMemberRole,
    default: ChatRoomMemberRole.MEMBER,
  })
  role!: ChatRoomMemberRole;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
