/**
 * CreateTemplateDto
 *
 * Story 19-1: Template Registry Backend
 *
 * DTO for creating a new template.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
  IsEnum,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  IsUrl,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';
import { TEMPLATE_DEFINITION_CONSTANTS } from '../constants/template-definition.constants';

class StackDto {
  @ApiPropertyOptional({ example: 'Next.js 15' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  frontend?: string;

  @ApiPropertyOptional({ example: 'NestJS' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  backend?: string;

  @ApiPropertyOptional({ example: 'PostgreSQL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  database?: string;

  @ApiPropertyOptional({ example: 'JWT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  auth?: string;

  @ApiPropertyOptional({ example: 'Tailwind CSS' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  styling?: string;

  @ApiPropertyOptional({ example: 'Vercel' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deployment?: string;
}

class FilesDto {
  @ApiProperty({ enum: TemplateSourceType, example: TemplateSourceType.GIT })
  @IsEnum(TemplateSourceType)
  source_type!: TemplateSourceType;

  @ApiPropertyOptional({ example: 'https://github.com/example/template' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  repository?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({ example: 'https://example.com/template.tar.gz' })
  @IsOptional()
  @IsUrl()
  @MaxLength(1000)
  archive_url?: string;

  @ApiPropertyOptional({ example: { 'README.md': '# My Template' } })
  @IsOptional()
  @IsObject()
  inline_files?: Record<string, string>;
}

class TemplateDefinitionDto {
  @ApiProperty({ type: StackDto })
  @ValidateNested()
  @Type(() => StackDto)
  stack!: StackDto;

  @ApiProperty({ type: [Object], description: 'Array of template variable definitions' })
  @IsArray()
  @IsObject({ each: true })
  variables!: Record<string, unknown>[];

  @ApiProperty({ type: FilesDto })
  @ValidateNested()
  @Type(() => FilesDto)
  files!: FilesDto;

  @ApiPropertyOptional({ type: [String], description: 'Post-installation commands' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  post_install?: string[];
}

class StackSummaryDto {
  @ApiPropertyOptional({ example: 'Next.js 15' })
  @IsOptional()
  @IsString()
  frontend?: string;

  @ApiPropertyOptional({ example: 'NestJS' })
  @IsOptional()
  @IsString()
  backend?: string;

  @ApiPropertyOptional({ example: 'PostgreSQL' })
  @IsOptional()
  @IsString()
  database?: string;

  @ApiPropertyOptional({ example: 'JWT' })
  @IsOptional()
  @IsString()
  auth?: string;

  @ApiPropertyOptional({ example: 'Tailwind CSS' })
  @IsOptional()
  @IsString()
  styling?: string;

  @ApiPropertyOptional({ example: 'Vercel' })
  @IsOptional()
  @IsString()
  deployment?: string;
}

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Machine-readable slug for the template',
    example: 'nextjs-saas-starter',
    maxLength: TEMPLATE_DEFINITION_CONSTANTS.MAX_NAME_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_DEFINITION_CONSTANTS.MAX_NAME_LENGTH)
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message: 'name must be a valid slug (lowercase alphanumeric with hyphens)',
  })
  name!: string;

  @ApiProperty({
    description: 'Human-friendly display name',
    example: 'Next.js SaaS Starter',
    maxLength: TEMPLATE_DEFINITION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_DEFINITION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Short description',
    example: 'Full-stack SaaS template with authentication and billing',
    maxLength: TEMPLATE_DEFINITION_CONSTANTS.MAX_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_DEFINITION_CONSTANTS.MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    description: 'Detailed markdown description',
    example: '# Features\n\n- Authentication\n- Billing\n- Dashboard',
    maxLength: TEMPLATE_DEFINITION_CONSTANTS.MAX_LONG_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_DEFINITION_CONSTANTS.MAX_LONG_DESCRIPTION_LENGTH)
  longDescription?: string;

  @ApiPropertyOptional({
    description: 'Semantic version',
    example: '1.0.0',
    default: '1.0.0',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version?: string;

  @ApiProperty({
    description: 'Template definition including stack, variables, and files config',
    type: TemplateDefinitionDto,
  })
  @ValidateNested()
  @Type(() => TemplateDefinitionDto)
  definition!: TemplateDefinitionDto;

  @ApiPropertyOptional({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.WEB_APP,
    default: TemplateCategory.WEB_APP,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Tags for filtering and search',
    example: ['saas', 'nextjs', 'typescript'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Icon identifier',
    example: 'layout-dashboard',
    default: 'layout-dashboard',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Screenshot URLs',
    example: ['https://example.com/screenshot1.png'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  screenshots?: string[];

  @ApiPropertyOptional({
    description: 'Stack summary for quick reference',
    type: StackSummaryDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StackSummaryDto)
  stackSummary?: StackSummaryDto;

  @ApiPropertyOptional({
    description: 'Template variable definitions',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  variables?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description: 'Source type for template files',
    enum: TemplateSourceType,
    example: TemplateSourceType.GIT,
    default: TemplateSourceType.GIT,
  })
  @IsOptional()
  @IsEnum(TemplateSourceType)
  sourceType?: TemplateSourceType;

  @ApiPropertyOptional({
    description: 'Source repository or archive URL',
    example: 'https://github.com/devos-templates/nextjs-saas',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(1000)
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Git branch name',
    example: 'main',
    default: 'main',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceBranch?: string;

  @ApiPropertyOptional({
    description: 'Whether this is an official DevOS template',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the template is published to marketplace',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the template is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
