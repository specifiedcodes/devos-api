/**
 * TemplateResponseDto
 *
 * Story 19-1: Template Registry Backend
 *
 * Response DTO for template data with all fields.
 * Maintains backward compatibility with Story 4.2 response format.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsNumber,
  IsUUID,
  IsDateString,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateCategory, TemplateTestStatus } from '../../../database/entities/template.entity';
import { TechStackDto } from './tech-stack.dto';
import { DefaultPreferencesDto } from './default-preferences.dto';

/**
 * Stack summary for quick reference in response
 */
class StackSummaryResponseDto {
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

/**
 * Template definition in response
 */
class TemplateDefinitionResponseDto {
  @ApiPropertyOptional({ type: StackSummaryResponseDto })
  @ValidateNested()
  @Type(() => StackSummaryResponseDto)
  stack?: StackSummaryResponseDto;

  @ApiPropertyOptional({ type: [Object], description: 'Template variable definitions' })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  variables?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, description: 'File source configuration' })
  @IsOptional()
  @IsObject()
  files?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], description: 'Post-install commands' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  post_install?: string[];
}

export class TemplateResponseDto {
  // Primary ID (UUID from database)
  @ApiProperty({
    description: 'Unique template identifier (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id!: string;

  // Legacy ID field for backward compatibility (same as id for new templates)
  @ApiPropertyOptional({
    description: 'Legacy template identifier (slug, for backward compatibility)',
    example: 'nextjs-saas-starter',
  })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiProperty({
    description: 'Machine-readable slug name',
    example: 'nextjs-saas-starter',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Human-friendly display name',
    example: 'Next.js SaaS Starter',
  })
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Short description of the template',
    example:
      'Full-stack SaaS template with authentication, billing, dashboard, and multi-tenancy.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Detailed markdown description',
    example: '# Features\n\n- Authentication\n- Billing\n- Dashboard',
  })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional({
    description: 'Semantic version',
    example: '1.0.0',
    default: '1.0.0',
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({
    description: 'Schema version for forward compatibility',
    example: 'v1',
    default: 'v1',
  })
  @IsOptional()
  @IsString()
  schemaVersion?: string;

  @ApiProperty({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.WEB_APP,
  })
  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Icon identifier for UI display',
    example: 'layout-dashboard',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Tags for filtering and search',
    example: ['saas', 'fullstack', 'nextjs', 'typescript', 'tailwind'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Screenshot URLs',
    example: ['https://example.com/screenshot1.png'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  screenshots?: string[];

  // New field: Full template definition
  @ApiPropertyOptional({
    description: 'Complete template definition (stack, variables, files)',
    type: TemplateDefinitionResponseDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateDefinitionResponseDto)
  definition?: TemplateDefinitionResponseDto;

  // New field: Stack summary for quick reference
  @ApiPropertyOptional({
    description: 'Quick reference stack info',
    type: StackSummaryResponseDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StackSummaryResponseDto)
  stackSummary?: StackSummaryResponseDto;

  // New field: Source information
  @ApiPropertyOptional({
    description: 'Source type (git, archive, or inline)',
    example: 'git',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Source repository or archive URL',
    example: 'https://github.com/devos-templates/nextjs-saas',
  })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Git branch name',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  sourceBranch?: string;

  // New fields: Status flags
  @ApiPropertyOptional({
    description: 'Whether this is an official DevOS template',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the template is published to marketplace',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the template is active',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Recommended flag (from Story 4.2)
  @ApiPropertyOptional({
    description: 'Whether this template is recommended/featured',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  recommended?: boolean;

  // Story 19-8: Featured Templates Curation
  @ApiPropertyOptional({
    description: 'Whether this template is featured in the marketplace',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Position in featured templates list (0-7)',
    example: 0,
    minimum: 0,
    maximum: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  featuredOrder?: number;

  @ApiPropertyOptional({
    description: 'Test status for featured templates',
    enum: TemplateTestStatus,
    example: TemplateTestStatus.UNKNOWN,
  })
  @IsOptional()
  @IsEnum(TemplateTestStatus)
  testStatus?: TemplateTestStatus;

  @ApiPropertyOptional({
    description: 'Last test run timestamp for featured templates',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  lastTestRunAt?: string;

  // New fields: Usage statistics
  @ApiPropertyOptional({
    description: 'Total number of projects created from this template',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  totalUses?: number;

  @ApiPropertyOptional({
    description: 'Average rating (0.00 to 5.00)',
    example: 0.0,
    default: 0.0,
  })
  @IsOptional()
  @IsNumber()
  avgRating?: number;

  @ApiPropertyOptional({
    description: 'Number of ratings received',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  ratingCount?: number;

  // Legacy fields for backward compatibility with Story 4.2
  @ApiPropertyOptional({
    description: 'Technology stack details (legacy format)',
    type: TechStackDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TechStackDto)
  techStack?: TechStackDto;

  @ApiPropertyOptional({
    description: 'Default project preferences (legacy format)',
    type: DefaultPreferencesDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultPreferencesDto)
  defaultPreferences?: DefaultPreferencesDto;

  // Timestamps
  @ApiPropertyOptional({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

/**
 * Response DTO for paginated template list
 */
export class TemplateListResponseDto {
  @ApiProperty({ type: [TemplateResponseDto] })
  items!: TemplateResponseDto[];

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

/**
 * Response DTO for category counts
 */
export class TemplateCategoriesResponseDto {
  @ApiProperty({
    type: [Object],
    example: [{ category: 'web-app', count: 5 }],
  })
  categories!: Array<{ category: string; count: number }>;
}
