/**
 * Marketplace Response DTOs
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Response DTOs for marketplace agent data.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentCategory, MarketplacePricingType, MarketplaceAgentStatus } from '../../../database/entities/marketplace-agent.entity';

export class MarketplaceAgentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  shortDescription!: string;

  @ApiProperty()
  category!: MarketplaceAgentCategory;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @ApiPropertyOptional()
  iconUrl?: string;

  @ApiProperty()
  latestVersion!: string;

  @ApiProperty()
  totalInstalls!: number;

  @ApiProperty()
  avgRating!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  pricingType!: MarketplacePricingType;

  @ApiPropertyOptional()
  priceCents?: number;

  @ApiProperty()
  publisherName!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class MarketplaceAgentDetailDto extends MarketplaceAgentSummaryDto {
  @ApiProperty()
  longDescription!: string;

  @ApiPropertyOptional({ type: [String] })
  screenshots?: string[];

  @ApiProperty()
  status!: MarketplaceAgentStatus;

  @ApiPropertyOptional()
  publishedAt?: Date;
}

export class MarketplaceAgentResponseDto extends MarketplaceAgentDetailDto {
  @ApiProperty()
  agentDefinitionId!: string;

  @ApiProperty()
  publisherUserId!: string;

  @ApiProperty()
  publisherWorkspaceId!: string;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedAgentListDto {
  @ApiProperty({ type: [MarketplaceAgentSummaryDto] })
  items!: MarketplaceAgentSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class CategoryWithCountDto {
  @ApiProperty({ enum: MarketplaceAgentCategory })
  category!: MarketplaceAgentCategory;

  @ApiProperty()
  count!: number;
}
