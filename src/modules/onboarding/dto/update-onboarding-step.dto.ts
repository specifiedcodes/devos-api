import { IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOnboardingStepDto {
  @ApiProperty({
    description: 'Boolean value indicating whether the step is complete',
    example: true,
  })
  @IsBoolean()
  value!: boolean;
}

// Valid step names
export const VALID_STEP_NAMES = [
  'githubConnected',
  'deploymentConfigured',
  'databaseConfigured',
  'aiKeyAdded',
  'firstProjectCreated',
  'tutorialCompleted',
] as const;

export type ValidStepName = (typeof VALID_STEP_NAMES)[number];
