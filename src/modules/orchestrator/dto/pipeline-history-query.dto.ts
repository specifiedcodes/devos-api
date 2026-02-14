/**
 * PipelineHistoryQueryDto
 * Story 11.1: Orchestrator State Machine Core
 *
 * Validates query parameters for GET /api/v1/workspaces/:workspaceId/orchestrator/:projectId/history
 */
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PipelineHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
