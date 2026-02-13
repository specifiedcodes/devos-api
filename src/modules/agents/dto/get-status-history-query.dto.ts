import { IsOptional, IsUUID, IsInt, Min, Max, IsDateString, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusUpdateCategory } from '../enums/agent-activity-status.enum';

/**
 * DTO for status history query parameters
 * Story 9.3: Agent Status Updates
 */
export class GetStatusHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of records to return',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (ISO date string)',
    example: '2026-02-13T14:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  before?: string;
}

/**
 * DTO for workspace status updates query parameters
 * Story 9.3: Agent Status Updates
 */
export class GetWorkspaceStatusUpdatesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by project ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter by agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status update category',
    enum: StatusUpdateCategory,
  })
  @IsOptional()
  @IsEnum(StatusUpdateCategory)
  category?: StatusUpdateCategory;

  @ApiPropertyOptional({
    description: 'Maximum number of records to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
