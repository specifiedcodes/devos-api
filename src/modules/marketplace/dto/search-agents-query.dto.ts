/**
 * SearchAgentsQueryDto
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Query parameters for full-text search on marketplace agents.
 */
import { IsNotEmpty, IsOptional, IsInt, Min, Max, IsString, IsEnum, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentCategory, MarketplacePricingType } from '../../../database/entities/marketplace-agent.entity';
import { SortBy } from './browse-agents-query.dto';

/**
 * Sanitizes a search query string for PostgreSQL full-text search.
 * Removes tsquery special characters that could cause syntax errors.
 */
function sanitizeSearchQuery(value: string): string {
  if (!value) return '';
  // Remove tsquery special operators: & | ! : * ( ) < >
  // Keep alphanumeric, spaces, hyphens, and underscores
  return value.replace(/[&|!:*()<>]/g, '').trim().substring(0, 200);
}

export class SearchAgentsQueryDto {
  @ApiProperty({ description: 'Search query string', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => sanitizeSearchQuery(value))
  q: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by category', enum: MarketplaceAgentCategory })
  @IsOptional()
  @IsEnum(MarketplaceAgentCategory)
  category?: MarketplaceAgentCategory;

  @ApiPropertyOptional({ description: 'Filter by pricing type', enum: MarketplacePricingType })
  @IsOptional()
  @IsEnum(MarketplacePricingType)
  pricingType?: MarketplacePricingType;

  @ApiPropertyOptional({ description: 'Sort by', enum: SortBy, default: SortBy.POPULARITY })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.POPULARITY;
}
