/**
 * Context Budget DTOs
 * Story 12.8: Context Budget System
 *
 * Request validation for context budget API endpoints.
 */
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for GET /api/v1/memory/context-budget query params.
 * Requires modelId to calculate budget for a specific model.
 */
export class ContextBudgetQueryDto {
  @ApiProperty({
    description: 'Model identifier (e.g., claude-3-5-sonnet, gpt-4)',
    example: 'claude-3-5-sonnet',
  })
  @IsString()
  @IsNotEmpty({ message: 'modelId is required' })
  modelId!: string;
}
