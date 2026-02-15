/**
 * Query DTOs
 * Story 12.3: Memory Query Service
 *
 * Request validation for memory query and feedback API endpoints.
 */
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsBoolean,
  IsDateString,
  ValidateNested,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Nested DTO for query filters.
 */
export class MemoryQueryFiltersDto {
  @ApiPropertyOptional({
    description: 'Filter by episode types',
    type: [String],
    enum: ['decision', 'fact', 'problem', 'preference', 'pattern'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['decision', 'fact', 'problem', 'preference', 'pattern'], { each: true })
  types?: string[];

  @ApiPropertyOptional({
    description: 'Filter by entity IDs/names',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter episodes since this ISO date',
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return (default: 10)',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxResults?: number;
}

/**
 * DTO for POST /api/v1/memory/query
 * Query memories with filters and semantic relevance.
 */
export class MemoryQueryDto {
  @ApiProperty({ description: 'Project ID to query memories for' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID for tenant isolation' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiProperty({ description: 'Natural language query string' })
  @IsString()
  @IsNotEmpty()
  query!: string;

  @ApiPropertyOptional({
    description: 'Optional filters for the query',
    type: MemoryQueryFiltersDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MemoryQueryFiltersDto)
  filters?: MemoryQueryFiltersDto;
}

/**
 * DTO for POST /api/v1/memory/feedback
 * Record relevance feedback on a memory episode.
 */
export class MemoryFeedbackDto {
  @ApiProperty({ description: 'Episode ID to provide feedback on' })
  @IsString()
  @IsNotEmpty()
  episodeId!: string;

  @ApiProperty({ description: 'Whether the memory was useful for the task' })
  @IsBoolean()
  wasUseful!: boolean;
}
