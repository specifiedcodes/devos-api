import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for listing conversation threads
 * Story 9.5: Conversation History Storage
 */
export class GetConversationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by project ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter by agent ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Include archived conversations',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeArchived?: boolean = false;

  @ApiPropertyOptional({
    description: 'Number of conversations to return (1-100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (conversation UUID)',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID()
  @IsOptional()
  before?: string;
}

/**
 * DTO for creating a new conversation thread
 */
export class CreateConversationDto {
  @ApiPropertyOptional({
    description: 'Conversation title',
    example: 'Deployment Discussion',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Associated project ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Associated agent ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  agentId?: string;
}

/**
 * DTO for updating a conversation thread
 */
export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: 'New title for the conversation',
    example: 'Updated Discussion Title',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Archive or unarchive the conversation',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}

/**
 * Response DTO for conversation thread
 */
export class ConversationResponseDto {
  @ApiProperty({ description: 'Conversation ID' })
  id!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  projectId?: string | null;

  @ApiPropertyOptional({ description: 'Agent ID' })
  agentId?: string | null;

  @ApiPropertyOptional({ description: 'Conversation title' })
  title?: string | null;

  @ApiProperty({ description: 'Number of messages in thread' })
  messageCount!: number;

  @ApiPropertyOptional({ description: 'Timestamp of last message' })
  lastMessageAt?: string | null;

  @ApiPropertyOptional({ description: 'Preview of last message' })
  lastMessagePreview?: string | null;

  @ApiProperty({ description: 'Whether conversation is archived' })
  isArchived!: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}

/**
 * Response DTO for conversation list
 */
export class ConversationsListResponseDto {
  @ApiProperty({ description: 'Array of conversation threads' })
  conversations!: ConversationResponseDto[];

  @ApiProperty({ description: 'Whether there are more conversations' })
  hasMore!: boolean;

  @ApiPropertyOptional({ description: 'Cursor for next page' })
  cursor?: string;
}
