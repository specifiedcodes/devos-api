/**
 * Summarization DTOs
 * Story 12.7: Memory Summarization (Cheap Models)
 *
 * Request validation for memory summarization API endpoints.
 */
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for POST /api/v1/memory/summarize
 * Manually trigger summarization for a project.
 */
export class SummarizeDto {
  @ApiProperty({ description: 'Project ID to summarize memories for' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

/**
 * DTO for GET /api/v1/memory/summaries query params.
 */
export class SummaryQueryDto {
  @ApiProperty({ description: 'Project ID to get summaries for' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

/**
 * DTO for GET /api/v1/memory/summarization-stats query params.
 */
export class SummarizationStatsQueryDto {
  @ApiProperty({ description: 'Project ID to get summarization stats for' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}
