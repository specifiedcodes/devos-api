/**
 * BrowseAgentsQueryDto
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Query parameters for browsing marketplace agents.
 */
import { IsOptional, IsInt, Min, Max, IsEnum, IsString, IsBooleanString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentCategory, MarketplacePricingType } from '../../../database/entities/marketplace-agent.entity';

export enum SortBy {
  POPULARITY = 'popularity',
  RATING = 'rating',
  RECENT = 'recent',
  NAME = 'name',
}

export class BrowseAgentsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Only verified agents' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBooleanString()
  verifiedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Sort by', enum: SortBy, default: SortBy.POPULARITY })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.POPULARITY;
}
