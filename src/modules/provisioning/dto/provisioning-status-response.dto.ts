import { ApiProperty } from '@nestjs/swagger';
import { ProvisioningStatusEnum, StepStatus } from '../../../database/entities/provisioning-status.entity';

/**
 * Provisioning Status Response DTO
 * Returned by GET /api/v1/provisioning/status/:projectId
 */
export class ProvisioningStatusResponseDto {
  @ApiProperty({
    description: 'Provisioning status ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Project ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Workspace ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  workspaceId!: string;

  @ApiProperty({
    description: 'Overall provisioning status',
    enum: ProvisioningStatusEnum,
    example: ProvisioningStatusEnum.IN_PROGRESS,
  })
  status!: ProvisioningStatusEnum;

  @ApiProperty({
    description: 'Current step being executed',
    example: 'github_repo_created',
    nullable: true,
  })
  currentStep?: string | null;

  @ApiProperty({
    description: 'Provisioning steps with status',
    example: {
      github_repo_created: {
        status: 'completed',
        startedAt: '2026-01-31T12:00:00Z',
        completedAt: '2026-01-31T12:00:02Z',
      },
      database_provisioned: {
        status: 'in_progress',
        startedAt: '2026-01-31T12:00:02Z',
      },
      deployment_configured: { status: 'pending' },
      project_initialized: { status: 'pending' },
    },
  })
  steps!: {
    github_repo_created: StepStatus;
    database_provisioned: StepStatus;
    deployment_configured: StepStatus;
    project_initialized: StepStatus;
  };

  @ApiProperty({
    description: 'When provisioning started',
    example: '2026-01-31T11:59:00Z',
    nullable: true,
  })
  startedAt?: Date | null;

  @ApiProperty({
    description: 'When provisioning completed or failed',
    example: null,
    nullable: true,
  })
  completedAt?: Date | null;

  @ApiProperty({
    description: 'Error message if provisioning failed',
    example: null,
    nullable: true,
  })
  errorMessage?: string | null;
}
