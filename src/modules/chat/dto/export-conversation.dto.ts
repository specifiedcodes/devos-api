import {
  IsUUID,
  IsOptional,
  IsIn,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Valid export formats
 */
export type ExportFormat = 'json' | 'csv' | 'txt' | 'md';

/**
 * DTO for exporting conversations
 * Story 9.5: Conversation History Storage
 */
export class ExportConversationQueryDto {
  @ApiProperty({
    description: 'Export format',
    enum: ['json', 'csv', 'txt', 'md'],
    example: 'json',
  })
  @IsIn(['json', 'csv', 'txt', 'md'])
  format!: ExportFormat;

  @ApiPropertyOptional({
    description: 'Export specific conversation thread',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Export all conversations with specific agent',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Start date for export (ISO 8601 format)',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'End date for export (ISO 8601 format)',
    example: '2026-02-01',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Include message metadata in export',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeMetadata?: boolean = true;
}
