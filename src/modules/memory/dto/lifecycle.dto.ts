/**
 * Lifecycle DTOs
 * Story 12.9: Memory Lifecycle Management
 *
 * Request validation for memory lifecycle API endpoints.
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for POST /api/v1/memory/lifecycle/run
 * Manually trigger lifecycle for a workspace.
 */
export class LifecycleRunDto {
  @ApiProperty({ description: 'Workspace ID to run lifecycle for' })
  @IsString()
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId!: string;
}

/**
 * DTO for GET /api/v1/memory/lifecycle/policy query params.
 */
export class LifecyclePolicyQueryDto {
  @ApiProperty({ description: 'Workspace ID to get policy for' })
  @IsString()
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId!: string;
}

/**
 * DTO for PUT /api/v1/memory/lifecycle/policy
 * Update lifecycle policy for a workspace.
 */
export class LifecyclePolicyUpdateDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Days before pruning stale memories', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  pruneAfterDays?: number;

  @ApiPropertyOptional({ description: 'Similarity threshold for consolidation (0.0-1.0)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  consolidateThreshold?: number;

  @ApiPropertyOptional({ description: 'Days before archiving old memories', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  archiveAfterDays?: number;

  @ApiPropertyOptional({ description: 'Maximum active memories per project', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxMemoriesPerProject?: number;

  @ApiPropertyOptional({ description: 'Whether to retain decision episodes forever' })
  @IsOptional()
  @IsBoolean()
  retainDecisionsForever?: boolean;

  @ApiPropertyOptional({ description: 'Whether to retain pattern episodes forever' })
  @IsOptional()
  @IsBoolean()
  retainPatternsForever?: boolean;
}

/**
 * DTO for GET /api/v1/memory/lifecycle/report query params.
 */
export class LifecycleReportQueryDto {
  @ApiProperty({ description: 'Workspace ID to get report for' })
  @IsString()
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId!: string;
}
