/**
 * StartPipelineDto
 * Story 11.1: Orchestrator State Machine Core
 *
 * Validates request body for POST /api/v1/workspaces/:workspaceId/orchestrator/start
 */
import { IsUUID, IsOptional, IsString, IsObject } from 'class-validator';

export class StartPipelineDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsString()
  storyId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
