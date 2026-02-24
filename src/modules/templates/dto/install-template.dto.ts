/**
 * InstallTemplateDto and related DTOs
 *
 * Story 19-6: Template Installation Flow
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsObject,
  MaxLength,
  Matches,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstallationStatus } from '../../../database/entities/template-installation.entity';

export class InstallTemplateDto {
  @ApiProperty({ description: 'Target project name (slug format)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message: 'projectName must be a valid slug (lowercase alphanumeric with hyphens)',
  })
  projectName!: string;

  @ApiProperty({ description: 'Target workspace ID' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ description: 'User-provided variable values', type: Object })
  @IsObject()
  variables!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Existing GitHub repo ID' })
  @IsOptional()
  githubRepoId?: number;

  @ApiPropertyOptional({ description: 'If true, creates new repo', default: true })
  @IsOptional()
  @IsBoolean()
  createNewRepo?: boolean;

  @ApiPropertyOptional({ description: 'Name for new repo (defaults to projectName)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  repoName?: string;

  @ApiPropertyOptional({ description: 'Private repo', default: true })
  @IsOptional()
  @IsBoolean()
  repoPrivate?: boolean;

  @ApiPropertyOptional({ description: 'Repo description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  repoDescription?: string;

  @ApiPropertyOptional({ description: 'Skip post-install scripts', default: false })
  @IsOptional()
  @IsBoolean()
  skipPostInstall?: boolean;
}

export class InstallationJobDto {
  @ApiProperty({ description: 'Installation job ID' })
  id!: string;

  @ApiProperty({ description: 'Template ID' })
  templateId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({ description: 'Project name' })
  projectName!: string;

  @ApiProperty({ description: 'Installation status' })
  status!: string;

  @ApiProperty({ description: 'Current step' })
  currentStep!: string;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progress!: number;

  @ApiProperty({ description: 'Error message if failed', nullable: true })
  error!: string | null;

  @ApiProperty({ description: 'GitHub repo URL', nullable: true })
  githubRepoUrl!: string | null;

  @ApiProperty({ description: 'Created project ID', nullable: true })
  projectId!: string | null;

  @ApiProperty({ description: 'Total files to process' })
  totalFiles!: number;

  @ApiProperty({ description: 'Files processed so far' })
  processedFiles!: number;

  @ApiProperty({ description: 'Job creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Job completion timestamp', nullable: true })
  completedAt!: string | null;
}

export class InstallationJobCreatedDto {
  @ApiProperty({ description: 'Job ID for tracking' })
  jobId!: string;

  @ApiProperty({ description: 'Initial status' })
  status!: string;

  @ApiProperty({ description: 'Status message' })
  message!: string;

  @ApiProperty({ description: 'URL to check job status' })
  statusUrl!: string;
}

export class InstallationListQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by status', enum: InstallationStatus })
  @IsOptional()
  @IsEnum(InstallationStatus)
  status?: InstallationStatus;

  @ApiPropertyOptional({ description: 'Filter by template ID' })
  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class InstallationListDto {
  @ApiProperty({ description: 'List of installations', type: [InstallationJobDto] })
  items!: InstallationJobDto[];

  @ApiProperty({ description: 'Total count' })
  total!: number;

  @ApiProperty({ description: 'Current page' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;
}
