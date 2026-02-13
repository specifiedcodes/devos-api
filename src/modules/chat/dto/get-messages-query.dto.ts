import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for querying chat messages with pagination and filtering
 * Story 9.2: Send Message to Agent
 * Story 9.6: View Conversation History - Added aroundDate and aroundMessageId
 */
export class GetMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter messages by agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Filter messages by project ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter messages by conversation ID',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Number of messages to return (1-100)',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (message UUID)',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID()
  @IsOptional()
  before?: string;

  @ApiPropertyOptional({
    description: 'Cursor for forward pagination - get messages after this message',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID()
  @IsOptional()
  after?: string;

  @ApiPropertyOptional({
    description: 'Get messages around a specific date (ISO 8601 date string). Returns messages centered around this date.',
    example: '2026-01-15',
  })
  @IsDateString()
  @IsOptional()
  aroundDate?: string;

  @ApiPropertyOptional({
    description: 'Get messages around a specific message ID. Returns messages centered around this message.',
    example: '550e8400-e29b-41d4-a716-446655440005',
  })
  @IsUUID()
  @IsOptional()
  aroundMessageId?: string;
}
