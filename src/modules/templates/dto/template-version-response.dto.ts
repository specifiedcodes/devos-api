/**
 * Template Version Response DTO
 *
 * Story 19-7: Template Versioning
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateDefinitionSpec } from '../../../database/entities/template.entity';

export class TemplateVersionResponseDto {
  @ApiProperty({
    description: 'Version ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @ApiProperty({
    description: 'Template ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  templateId!: string;

  @ApiProperty({
    description: 'Version number in semver format',
    example: '1.1.0',
  })
  version!: string;

  @ApiPropertyOptional({
    description: 'Changelog for this version',
    example: '## New Features\n- Added dark mode',
  })
  changelog?: string | null;

  @ApiProperty({
    description: 'Template definition snapshot at this version',
  })
  definition!: TemplateDefinitionSpec;

  @ApiProperty({
    description: 'Whether this is the latest version',
    example: true,
  })
  isLatest!: boolean;

  @ApiProperty({
    description: 'Number of times this version was downloaded/used',
    example: 150,
  })
  downloadCount!: number;

  @ApiPropertyOptional({
    description: 'User ID who published this version',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  publishedBy?: string | null;

  @ApiProperty({
    description: 'When this version was published',
    example: '2024-01-15T10:30:00Z',
  })
  publishedAt!: Date;

  @ApiProperty({
    description: 'When this version record was created',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt!: Date;
}

export class TemplateVersionListResponseDto {
  @ApiProperty({
    description: 'List of template versions',
    type: [TemplateVersionResponseDto],
  })
  items!: TemplateVersionResponseDto[];

  @ApiProperty({
    description: 'Total count of versions',
    example: 15,
  })
  total!: number;

  @ApiProperty({
    description: 'Current page',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Items per page',
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: 'Whether there are more pages',
    example: false,
  })
  hasMore!: boolean;
}

export class TemplateUpdateStatusDto {
  @ApiProperty({
    description: 'Project ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Template ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  templateId!: string;

  @ApiProperty({
    description: 'Currently installed version',
    example: '1.0.0',
  })
  installedVersion!: string;

  @ApiPropertyOptional({
    description: 'Latest available version',
    example: '1.1.0',
  })
  latestVersion?: string | null;

  @ApiProperty({
    description: 'Whether an update is available',
    example: true,
  })
  updateAvailable!: boolean;

  @ApiPropertyOptional({
    description: 'Type of update available',
    enum: ['patch', 'minor', 'major'],
    example: 'minor',
  })
  updateType?: 'patch' | 'minor' | 'major' | null;

  @ApiPropertyOptional({
    description: 'When update status was last checked',
    example: '2024-01-15T10:30:00Z',
  })
  lastCheckedAt?: Date;

  @ApiPropertyOptional({
    description: 'Changelog for the available update',
    example: '## New Features\n- Added dark mode',
  })
  changelog?: string | null;

  @ApiPropertyOptional({
    description: 'Version that was dismissed by user',
    example: '1.0.5',
  })
  dismissedVersion?: string | null;
}

export class ProjectTemplateVersionDto {
  @ApiProperty({
    description: 'Record ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @ApiProperty({
    description: 'Project ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Template ID',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  templateId!: string;

  @ApiProperty({
    description: 'Template name',
    example: 'nextjs-saas-starter',
  })
  templateName?: string;

  @ApiProperty({
    description: 'Template display name',
    example: 'Next.js SaaS Starter',
  })
  templateDisplayName?: string;

  @ApiProperty({
    description: 'Installed version',
    example: '1.0.0',
  })
  installedVersion!: string;

  @ApiPropertyOptional({
    description: 'Latest available version',
    example: '1.1.0',
  })
  latestVersion?: string | null;

  @ApiProperty({
    description: 'Whether an update is available',
    example: true,
  })
  updateAvailable!: boolean;

  @ApiPropertyOptional({
    description: 'Type of update available',
    enum: ['patch', 'minor', 'major'],
    example: 'minor',
  })
  updateType?: 'patch' | 'minor' | 'major' | null;

  @ApiPropertyOptional({
    description: 'When update status was last checked',
    example: '2024-01-15T10:30:00Z',
  })
  lastCheckedAt?: Date;

  @ApiPropertyOptional({
    description: 'Version that was dismissed',
    example: '1.0.5',
  })
  dismissedVersion?: string | null;

  @ApiProperty({
    description: 'When the project was created from template',
    example: '2024-01-10T08:00:00Z',
  })
  createdAt!: Date;
}
