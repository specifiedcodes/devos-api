import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsArray,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatRoomType, ChatRoomSettings } from '../../../database/entities/chat-room.entity';

/**
 * DTO for creating a chat room
 * Story 9.10: Multi-User Chat
 */
export class CreateChatRoomDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(ChatRoomType)
  type!: ChatRoomType;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  initialMemberIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  initialAgentIds?: string[];

  @IsOptional()
  settings?: Partial<ChatRoomSettings>;
}

/**
 * DTO for updating a chat room
 */
export class UpdateChatRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  settings?: Partial<ChatRoomSettings>;
}

/**
 * DTO for adding members to a chat room
 */
export class AddMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds!: string[];

  @IsEnum(['user', 'agent'])
  memberType!: 'user' | 'agent';
}

/**
 * DTO for updating member role
 */
export class UpdateMemberRoleDto {
  @IsEnum(['owner', 'admin', 'member', 'readonly'])
  role!: 'owner' | 'admin' | 'member' | 'readonly';
}

/**
 * Query params for getting rooms
 */
export class GetRoomsQueryDto {
  @IsOptional()
  @IsEnum(ChatRoomType)
  type?: ChatRoomType;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  includePrivate?: boolean;

  @IsOptional()
  limit?: number;

  @IsOptional()
  offset?: number;
}
