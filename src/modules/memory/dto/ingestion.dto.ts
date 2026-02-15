/**
 * Ingestion DTOs
 * Story 12.2: Memory Ingestion Pipeline
 *
 * Request/response validation for memory ingestion API endpoints.
 */
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsObject,
  IsNotEmpty,
  IsInt,
  Min,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Nested DTO for test results within ingestion input.
 */
export class TestResultsDto {
  @ApiProperty({ description: 'Number of tests passed' })
  @IsInt()
  @Min(0)
  passed!: number;

  @ApiProperty({ description: 'Number of tests failed' })
  @IsInt()
  @Min(0)
  failed!: number;

  @ApiProperty({ description: 'Total number of tests' })
  @IsInt()
  @Min(0)
  total!: number;
}

/**
 * DTO for POST /api/v1/memory/ingest
 * Manually trigger memory ingestion for a completed task.
 */
export class IngestMemoryDto {
  @ApiProperty({ description: 'Project ID' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Story ID' })
  @IsOptional()
  @IsString()
  storyId?: string | null;

  @ApiProperty({ description: 'Agent type that completed the task' })
  @IsString()
  @IsNotEmpty()
  agentType!: string;

  @ApiProperty({ description: 'CLI session ID' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiPropertyOptional({ description: 'Git branch name' })
  @IsOptional()
  @IsString()
  branch?: string | null;

  @ApiPropertyOptional({ description: 'Git commit hash' })
  @IsOptional()
  @IsString()
  commitHash?: string | null;

  @ApiPropertyOptional({ description: 'CLI exit code' })
  @IsOptional()
  @IsNumber()
  exitCode?: number | null;

  @ApiProperty({ description: 'Task duration in milliseconds' })
  @IsNumber()
  @Min(0)
  durationMs!: number;

  @ApiPropertyOptional({ description: 'Summary of task output' })
  @IsOptional()
  @IsString()
  outputSummary?: string | null;

  @ApiPropertyOptional({
    description: 'List of files changed during the task',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filesChanged?: string[];

  @ApiPropertyOptional({
    description: 'Commit messages from the task',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commitMessages?: string[];

  @ApiPropertyOptional({ description: 'Test execution results' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TestResultsDto)
  testResults?: TestResultsDto | null;

  @ApiPropertyOptional({ description: 'Pull request URL' })
  @IsOptional()
  @IsString()
  prUrl?: string | null;

  @ApiPropertyOptional({ description: 'Deployment URL' })
  @IsOptional()
  @IsString()
  deploymentUrl?: string | null;

  @ApiPropertyOptional({ description: 'Error message if task failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @ApiPropertyOptional({ description: 'Additional pipeline metadata' })
  @IsOptional()
  @IsObject()
  pipelineMetadata?: Record<string, any>;
}

/**
 * DTO for GET /api/v1/memory/ingestion-stats query params.
 */
export class IngestionStatsQueryDto {
  @ApiProperty({ description: 'Project ID to get stats for' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({
    description: 'Filter stats since this ISO date',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}
