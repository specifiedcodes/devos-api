import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ChatRoomMemberRole } from '../../../database/entities/chat-room-member.entity';
import { InvitationStatus } from '../../../database/entities/chat-room-invitation.entity';

/**
 * DTO for sending invitations
 * Story 9.10: Multi-User Chat
 */
export class SendInvitationsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  userIds!: string[];

  @IsOptional()
  @IsEnum(ChatRoomMemberRole)
  role?: ChatRoomMemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/**
 * Query params for getting invitations
 */
export class GetInvitationsQueryDto {
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}

/**
 * Response DTO for invitation
 */
export class InvitationResponseDto {
  id!: string;
  roomId!: string;
  roomName!: string;
  invitedByName!: string;
  invitedById!: string;
  role!: ChatRoomMemberRole;
  message?: string | null;
  status!: InvitationStatus;
  expiresAt!: string;
  createdAt!: string;
}
