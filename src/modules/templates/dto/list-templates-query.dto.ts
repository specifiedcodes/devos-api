/**
 * ListTemplatesQueryDto
 *
 * Story 19-1: Template Registry Backend
 *
 * DTO for query parameters when listing templates.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TemplateCategory } from '../../../database/entities/template.entity';
import { TEMPLATE_DEFINITION_CONSTANTS } from '../constants/template-definition.constants';

// Extract sort field and order types from constants
type SortField = typeof TEMPLATE_DEFINITION_CONSTANTS.SORT_FIELDS[number];
type SortOrder = typeof TEMPLATE_DEFINITION_CONSTANTS.SORT_ORDERS[number];

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: TemplateCategory,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Filter by tag',
    example: 'typescript',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Search query for name and description',
    example: 'saas',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter official templates only',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true')
  @IsBoolean()
  isOfficial?: boolean;

  @ApiPropertyOptional({
    description: 'Filter published templates only',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true')
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Filter active templates only',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by workspace ID (internal use)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: TEMPLATE_DEFINITION_CONSTANTS.SORT_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsEnum(TEMPLATE_DEFINITION_CONSTANTS.SORT_FIELDS)
  sortBy?: SortField;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: TEMPLATE_DEFINITION_CONSTANTS.SORT_ORDERS,
    default: 'DESC',
  })
  @IsOptional()
  @IsEnum(TEMPLATE_DEFINITION_CONSTANTS.SORT_ORDERS)
  sortOrder?: SortOrder;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  })
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
