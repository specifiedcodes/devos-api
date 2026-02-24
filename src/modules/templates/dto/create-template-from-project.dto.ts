/**
 * CreateTemplateFromProjectDto
 *
 * Story 19-2: Template Creation Wizard (AC3)
 *
 * DTOs for creating templates from existing projects or GitHub repositories.
 * Supports source configuration, variable definitions, and templatization patterns.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUrl,
  IsArray,
  IsBoolean,
  IsUUID,
  ValidateNested,
  MaxLength,
  Matches,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateCategory } from '../../../database/entities/template.entity';

/**
 * Source type for template creation
 */
export type SourceType = 'project' | 'github_url';

/**
 * Source configuration for the template
 */
export class SourceConfigDto {
  @ApiProperty({
    description: 'Source type for template creation',
    enum: ['project', 'github_url'],
    example: 'project',
  })
  @IsEnum(['project', 'github_url'])
  type!: SourceType;

  @ApiPropertyOptional({
    description: 'Project ID (required if type is "project")',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'GitHub repository URL (required if type is "github_url")',
    example: 'https://github.com/owner/repo',
  })
  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional({
    description: 'Git branch name',
    default: 'main',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({
    description: 'Glob patterns for files to include',
    type: [String],
    example: ['src/**', 'lib/**'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePaths?: string[];

  @ApiPropertyOptional({
    description: 'Glob patterns for files to exclude',
    type: [String],
    example: ['node_modules/**', 'dist/**'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];
}

/**
 * Variable type for template parameters
 */
export type VariableType = 'string' | 'select' | 'boolean' | 'number' | 'multiselect' | 'secret';

/**
 * Variable definition for template parameters
 */
export class VariableDefinitionDto {
  @ApiProperty({
    description: 'Variable name (snake_case)',
    example: 'project_name',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Variable name must be in snake_case format (lowercase letters, numbers, underscores)',
  })
  name!: string;

  @ApiProperty({
    description: 'Variable type',
    enum: ['string', 'select', 'boolean', 'number', 'multiselect', 'secret'],
    example: 'string',
  })
  @IsEnum(['string', 'select', 'boolean', 'number', 'multiselect', 'secret'])
  type!: VariableType;

  @ApiPropertyOptional({
    description: 'Human-readable display name',
    example: 'Project Name',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Variable description',
    example: 'The name of the project',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the variable is required',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Default value for the variable',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  @IsOptional()
  default?: string | number | boolean | string[];

  @ApiPropertyOptional({
    description: 'Options for select/multiselect types',
    type: [String],
    example: ['postgresql', 'mysql', 'sqlite'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({
    description: 'Regex validation pattern for string type',
    example: '^[a-z][a-z0-9-]+$',
  })
  @IsOptional()
  @IsString()
  validation?: string;

  @ApiPropertyOptional({
    description: 'Minimum value for number type',
    example: 1024,
  })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({
    description: 'Maximum value for number type',
    example: 65535,
  })
  @IsOptional()
  @IsNumber()
  max?: number;
}

/**
 * Pattern for templatization (replacing values with variables)
 */
export class TemplatizePatternDto {
  @ApiProperty({
    description: 'Pattern to find (regex or string)',
    example: 'my-saas-app',
  })
  @IsString()
  @IsNotEmpty()
  pattern!: string;

  @ApiProperty({
    description: 'Variable name to replace pattern with',
    example: 'project_name',
  })
  @IsString()
  @IsNotEmpty()
  variable!: string;

  @ApiPropertyOptional({
    description: 'File globs to apply pattern to (default: all)',
    type: [String],
    example: ['package.json', 'README.md'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}

/**
 * Request DTO for creating a template from an existing project or GitHub repository
 */
export class CreateTemplateFromProjectDto {
  @ApiProperty({
    description: 'Source configuration',
    type: SourceConfigDto,
  })
  @ValidateNested()
  @Type(() => SourceConfigDto)
  source!: SourceConfigDto;

  @ApiProperty({
    description: 'Template name (slug format)',
    example: 'my-saas-template',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message: 'Name must be a valid slug (lowercase alphanumeric with hyphens, no leading/trailing hyphens)',
  })
  name!: string;

  @ApiProperty({
    description: 'Human-readable display name',
    example: 'My SaaS Template',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Short description',
    example: 'Full-stack SaaS template with authentication and billing',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description: 'Detailed markdown description',
    example: '# Features\n\n- Authentication\n- Billing\n- Dashboard',
  })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiProperty({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.WEB_APP,
  })
  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Tags for filtering and search',
    type: [String],
    example: ['saas', 'nextjs', 'typescript'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Icon identifier',
    example: 'layout-dashboard',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({
    description: 'Variable definitions',
    type: [VariableDefinitionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariableDefinitionDto)
  variables!: VariableDefinitionDto[];

  @ApiPropertyOptional({
    description: 'Patterns to templatize',
    type: [TemplatizePatternDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplatizePatternDto)
  templatizePatterns?: TemplatizePatternDto[];

  @ApiPropertyOptional({
    description: 'Post-installation commands',
    type: [String],
    example: ['npm install', 'npm run setup'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  postInstall?: string[];

  @ApiPropertyOptional({
    description: 'Save as unpublished draft',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @ApiPropertyOptional({
    description: 'Workspace ID (required for project source)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
