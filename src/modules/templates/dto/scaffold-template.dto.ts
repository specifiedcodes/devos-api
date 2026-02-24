/**
 * ScaffoldTemplateDto and related DTOs
 *
 * Story 19-3: Parameterized Scaffolding
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsObject,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScaffoldTemplateDto {
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
  @IsNumber()
  githubRepoId?: number;

  @ApiPropertyOptional({ description: 'If true, creates new repo', default: false })
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

  @ApiPropertyOptional({ description: 'Preview without creating', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ScaffoldPreviewDto {
  @ApiProperty({ description: 'Template ID' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({ description: 'Variable values for preview', type: Object })
  @IsObject()
  variables!: Record<string, unknown>;
}

export class ScaffoldJobStatusDto {
  @ApiProperty({ description: 'Job ID' })
  id!: string;

  @ApiProperty({ description: 'Job status', enum: ['pending', 'fetching', 'processing', 'installing', 'complete', 'failed', 'cancelled'] })
  status!: string;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progress!: number;

  @ApiProperty({ description: 'Current step description' })
  currentStep!: string;

  @ApiProperty({ description: 'Total number of files' })
  totalFiles!: number;

  @ApiProperty({ description: 'Number of processed files' })
  processedFiles!: number;

  @ApiProperty({ description: 'Error message if failed', nullable: true })
  error!: string | null;

  @ApiProperty({ description: 'Job creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Job start timestamp', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ description: 'Job completion timestamp', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ description: 'Created project ID', nullable: true })
  projectId!: string | null;

  @ApiProperty({ description: 'Created project URL', nullable: true })
  projectUrl!: string | null;
}

export class ValidateVariablesDto {
  @ApiProperty({ description: 'Variable values to validate', type: Object })
  @IsObject()
  variables!: Record<string, unknown>;
}

export class ValidationResultDto {
  @ApiProperty({ description: 'Whether validation passed' })
  valid!: boolean;

  @ApiProperty({ description: 'Validation errors', type: [Object] })
  errors!: Array<{ field: string; message: string }>;

  @ApiProperty({ description: 'Resolved variables with defaults', type: Object })
  resolved!: Record<string, unknown>;
}

export class ScaffoldPreviewResultDto {
  @ApiProperty({ description: 'Number of files to be generated' })
  fileCount!: number;

  @ApiProperty({ description: 'Preview of generated files' })
  files!: Array<{
    path: string;
    content: string;
    size: number;
  }>;

  @ApiProperty({ description: 'Post-install scripts to run' })
  postInstallScripts!: string[];

  @ApiProperty({ description: 'Estimated time to complete' })
  estimatedTime!: string;
}

export class ScaffoldJobCreatedDto {
  @ApiProperty({ description: 'Job ID' })
  jobId!: string;

  @ApiProperty({ description: 'Job status' })
  status!: string;

  @ApiProperty({ description: 'Status message' })
  message!: string;

  @ApiProperty({ description: 'URL to check job status' })
  statusUrl!: string;
}
