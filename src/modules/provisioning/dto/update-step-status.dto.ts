import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { StepStatusType } from '../../../database/entities/provisioning-status.entity';

/**
 * Update Step Status DTO
 * Used by PATCH /api/v1/provisioning/status/:projectId/step (internal API)
 */
export class UpdateStepStatusDto {
  @ApiProperty({
    description: 'Step name to update',
    enum: ['github_repo_created', 'database_provisioned', 'deployment_configured', 'project_initialized'],
    example: 'github_repo_created',
  })
  @IsString()
  @IsNotEmpty()
  stepName!: string;

  @ApiProperty({
    description: 'New status for the step',
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    example: 'completed',
  })
  @IsEnum(['pending', 'in_progress', 'completed', 'failed'])
  @IsNotEmpty()
  status!: StepStatusType;

  @ApiProperty({
    description: 'Error message if step failed',
    example: 'GitHub API rate limit exceeded',
    required: false,
  })
  @IsString()
  @IsOptional()
  error?: string;
}
