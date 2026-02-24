/**
 * Featured Template DTOs
 *
 * Story 19-8: Featured Templates Curation
 *
 * DTOs for featured template management.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsArray,
  IsString,
  IsUUID,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateTestStatus } from '../../../database/entities/template.entity';

/**
 * Constants for featured templates
 */
export const FEATURED_TEMPLATES_CONSTANTS = {
  MAX_FEATURED_TEMPLATES: 8,
  MIN_FEATURED_ORDER: 0,
  MAX_FEATURED_ORDER: 7,
} as const;

/**
 * DTO for featuring a template
 */
export class FeatureTemplateDto {
  @ApiPropertyOptional({
    description: 'Position in featured list (0-7). If not provided, template is added to the end.',
    minimum: 0,
    maximum: 7,
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  featuredOrder?: number;
}

/**
 * Individual template item for reordering
 */
export class ReorderTemplateItem {
  @ApiProperty({
    description: 'Template ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: 'New position in featured list (0-7)',
    minimum: 0,
    maximum: 7,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Max(7)
  featuredOrder!: number;
}

/**
 * DTO for reordering featured templates
 */
export class ReorderFeaturedTemplatesDto {
  @ApiProperty({
    description: 'Array of template IDs in their new order',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    minItems: 1,
    maxItems: 8,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one template ID is required' })
  @ArrayMaxSize(8, { message: 'Maximum 8 featured templates allowed' })
  @IsString({ each: true })
  templateIds!: string[];

  @ApiPropertyOptional({
    description: 'Alternative: provide template items with explicit positions',
    type: [ReorderTemplateItem],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one template item is required when using items' })
  @ArrayMaxSize(8, { message: 'Maximum 8 featured templates allowed' })
  @ValidateNested({ each: true })
  @Type(() => ReorderTemplateItem)
  items?: ReorderTemplateItem[];
}

/**
 * Response DTO for a featured template
 */
export class FeaturedTemplateResponseDto {
  @ApiProperty({ description: 'Template ID' })
  id!: string;

  @ApiProperty({ description: 'Template slug name' })
  name!: string;

  @ApiProperty({ description: 'Template display name' })
  displayName!: string;

  @ApiPropertyOptional({ description: 'Short description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Icon name' })
  icon?: string;

  @ApiProperty({ description: 'Whether this is an official template' })
  isOfficial!: boolean;

  @ApiProperty({ description: 'Whether this template is featured' })
  isFeatured!: boolean;

  @ApiPropertyOptional({ description: 'Position in featured list (0-7)' })
  featuredOrder?: number;

  @ApiPropertyOptional({ description: 'Last test run timestamp' })
  lastTestRunAt?: string;

  @ApiProperty({
    description: 'Test status',
    enum: TemplateTestStatus,
    example: TemplateTestStatus.PASSING,
  })
  testStatus!: TemplateTestStatus;

  @ApiProperty({ description: 'Total usage count' })
  totalUses!: number;

  @ApiProperty({ description: 'Average rating (0-5)' })
  avgRating!: number;

  @ApiProperty({ description: 'Number of ratings' })
  ratingCount!: number;

  @ApiPropertyOptional({ description: 'Category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Screenshots', type: [String] })
  screenshots?: string[];

  @ApiPropertyOptional({ description: 'Stack summary' })
  stackSummary?: Record<string, unknown>;
}

/**
 * Response DTO for featured templates list
 */
export class FeaturedTemplatesListResponseDto {
  @ApiProperty({
    description: 'List of featured templates',
    type: [FeaturedTemplateResponseDto],
  })
  templates!: FeaturedTemplateResponseDto[];

  @ApiProperty({ description: 'Total count of featured templates' })
  total!: number;

  @ApiProperty({ description: 'Maximum allowed featured templates' })
  maxAllowed!: number;
}

/**
 * DTO for updating test status (internal use)
 */
export class UpdateTestStatusDto {
  @ApiProperty({
    description: 'Test status',
    enum: TemplateTestStatus,
  })
  @IsBoolean()
  passing!: boolean;

  @ApiPropertyOptional({
    description: 'Error message if test failed',
  })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

/**
 * Query DTO for listing featured templates (admin)
 */
export class ListFeaturedTemplatesQueryDto {
  @ApiPropertyOptional({
    description: 'Include test status details',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeTestStatus?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by test status',
    enum: TemplateTestStatus,
  })
  @IsOptional()
  @IsString()
  testStatus?: TemplateTestStatus;
}
