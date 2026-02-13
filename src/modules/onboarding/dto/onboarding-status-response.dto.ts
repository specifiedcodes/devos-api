import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStatusEnum } from '../../../database/entities/onboarding-status.entity';

export class OnboardingStatusResponseDto {
  @ApiProperty({ description: 'Onboarding status record ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({
    enum: OnboardingStatusEnum,
    description: 'Overall onboarding status',
    example: OnboardingStatusEnum.IN_PROGRESS,
  })
  status!: OnboardingStatusEnum;

  @ApiProperty({
    description: 'Individual step completion flags',
    example: {
      accountCreated: true,
      githubConnected: false,
      deploymentConfigured: false,
      databaseConfigured: false,
      aiKeyAdded: true,
      firstProjectCreated: false,
      tutorialCompleted: false,
    },
  })
  steps!: {
    accountCreated: boolean;
    githubConnected: boolean;
    deploymentConfigured: boolean;
    databaseConfigured: boolean;
    aiKeyAdded: boolean;
    firstProjectCreated: boolean;
    tutorialCompleted: boolean;
  };

  @ApiProperty({
    description: 'Current onboarding step',
    example: 'service_connections',
  })
  currentStep!: string;

  @ApiProperty({
    description: 'Next recommended step for user',
    example: 'create_project',
  })
  nextStep!: string;

  @ApiProperty({
    description: 'Completion percentage (0-100)',
    example: 42,
  })
  completionPercentage!: number;

  @ApiProperty({
    description: 'Whether onboarding is fully complete',
    example: false,
  })
  isComplete!: boolean;

  @ApiProperty({
    description: 'Timestamp when onboarding started',
    example: '2025-02-03T10:00:00Z',
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiProperty({
    description: 'Timestamp when onboarding completed',
    example: null,
    nullable: true,
  })
  completedAt!: Date | null;
}
