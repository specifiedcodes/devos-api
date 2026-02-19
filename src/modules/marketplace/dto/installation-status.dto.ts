/**
 * Installation Status DTOs
 *
 * Story 18-8: Agent Installation Flow
 *
 * DTOs for installation progress tracking.
 */
import {
  IsUUID,
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum InstallationStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  DOWNLOADING = 'downloading',
  RESOLVING_DEPENDENCIES = 'resolving_dependencies',
  INSTALLING = 'installing',
  CONFIGURING = 'configuring',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export enum InstallationStep {
  PRE_CHECK = 'pre_check',
  VALIDATE_PERMISSIONS = 'validate_permissions',
  CHECK_DEPENDENCIES = 'check_dependencies',
  CHECK_CONFLICTS = 'check_conflicts',
  COPY_DEFINITION = 'copy_definition',
  INSTALL_DEPENDENCIES = 'install_dependencies',
  CONFIGURE_AGENT = 'configure_agent',
  VERIFY_INSTALLATION = 'verify_installation',
  COMPLETE = 'complete',
}

class StepInfoDto {
  @ApiProperty({ description: 'Step identifier', enum: InstallationStep })
  @IsString()
  step!: string;

  @ApiProperty({
    description: 'Step status',
    enum: ['pending', 'in_progress', 'completed', 'failed'],
  })
  @IsString()
  status!: 'pending' | 'in_progress' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'When this step started' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'When this step completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Error message if step failed' })
  @IsOptional()
  @IsString()
  error?: string;
}

export class InstallationStatusDto {
  @ApiProperty({ description: 'Installation ID', format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Workspace ID', format: 'uuid' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ description: 'Marketplace agent ID', format: 'uuid' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ApiProperty({ description: 'Agent display name' })
  @IsString()
  agentName!: string;

  @ApiProperty({ description: 'Target version being installed' })
  @IsString()
  targetVersion!: string;

  @ApiProperty({ description: 'Current installation status', enum: InstallationStatus })
  @IsEnum(InstallationStatus)
  status!: InstallationStatus;

  @ApiPropertyOptional({ description: 'Current step being executed', enum: InstallationStep })
  @IsOptional()
  @IsString()
  currentStep?: string;

  @ApiProperty({ description: 'Progress percentage (0-100)', example: 50 })
  @IsNumber()
  progressPercentage!: number;

  @ApiPropertyOptional({
    description: 'Detailed step information',
    type: [StepInfoDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepInfoDto)
  steps?: StepInfoDto[];

  @ApiPropertyOptional({ description: 'Error message if installation failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Installed agent ID if completed', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  installedAgentId?: string;

  @ApiProperty({ description: 'When installation started' })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ description: 'When installation completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
