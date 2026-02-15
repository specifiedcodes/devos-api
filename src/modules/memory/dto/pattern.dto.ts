/**
 * Pattern DTOs
 * Story 12.6: Cross-Project Learning
 *
 * Request validation for cross-project pattern API endpoints.
 */
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for POST /api/v1/memory/patterns/detect
 * Trigger pattern detection for a workspace.
 */
export class PatternDetectDto {
  @ApiProperty({ description: 'Workspace ID to run pattern detection on' })
  @IsUUID()
  workspaceId!: string;
}

/**
 * DTO for POST /api/v1/memory/patterns/:patternId/override
 * Override a workspace pattern.
 */
export class PatternOverrideDto {
  @ApiProperty({ description: 'User ID overriding the pattern' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Reason for overriding the pattern' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

/**
 * DTO for GET /api/v1/memory/patterns/:workspaceId query params.
 * Filter workspace patterns.
 */
export class PatternQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by pattern type',
    enum: ['architecture', 'error', 'testing', 'deployment', 'security'],
  })
  @IsOptional()
  @IsEnum(['architecture', 'error', 'testing', 'deployment', 'security'] as const, {
    message: 'type must be one of: architecture, error, testing, deployment, security',
  })
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by confidence level',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'] as const, {
    message: 'confidence must be one of: low, medium, high',
  })
  confidence?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'overridden', 'archived'],
  })
  @IsOptional()
  @IsEnum(['active', 'overridden', 'archived'] as const, {
    message: 'status must be one of: active, overridden, archived',
  })
  status?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of patterns to return',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/**
 * DTO for GET /api/v1/memory/patterns/:workspaceId/recommendations query params.
 * Get pattern recommendations for a task.
 */
export class PatternRecommendationQueryDto {
  @ApiProperty({ description: 'Project ID for recommendation context' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ description: 'Task description to match patterns against' })
  @IsString()
  @MinLength(1)
  task!: string;
}
