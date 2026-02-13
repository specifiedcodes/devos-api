import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  MinLength,
  MaxLength,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for searching chat messages
 * Story 9.5: Conversation History Storage
 */
export class SearchMessagesQueryDto {
  @ApiProperty({
    description: 'Search query string (full-text search)',
    example: 'deployment error',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string;

  @ApiPropertyOptional({
    description: 'Filter by agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by conversation thread ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO 8601 format)',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO 8601 format)',
    example: '2026-02-01',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Include archived messages in search results',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeArchived?: boolean = false;

  @ApiPropertyOptional({
    description: 'Number of results to return (1-100)',
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
    description: 'Offset for pagination',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;
}

/**
 * Response DTO for search results
 */
export class SearchMessagesResponseDto {
  @ApiProperty({ description: 'Array of matching messages' })
  messages!: any[];

  @ApiProperty({ description: 'Total count of matching messages', example: 42 })
  totalCount!: number;

  @ApiPropertyOptional({
    description: 'Highlighted text snippets keyed by message ID',
    example: { 'msg-1': ['<b>deployment</b> error occurred'] },
  })
  highlights?: Record<string, string[]>;
}
