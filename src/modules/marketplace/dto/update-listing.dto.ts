/**
 * UpdateListingDto
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * DTO for updating a marketplace listing.
 */
import { IsString, IsOptional, MaxLength, IsEnum, IsArray, IsUrl, IsBoolean, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentCategory, MarketplacePricingType } from '../../../database/entities/marketplace-agent.entity';

export class UpdateListingDto {
  @ApiPropertyOptional({ description: 'Display name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Short description (max 200 chars)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Long description (markdown supported)' })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional({ description: 'Category', enum: MarketplaceAgentCategory })
  @IsOptional()
  @IsEnum(MarketplaceAgentCategory)
  category?: MarketplaceAgentCategory;

  @ApiPropertyOptional({ description: 'Tags for discovery (max 10 tags, each up to 50 chars)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Icon URL' })
  @IsOptional()
  @IsUrl()
  iconUrl?: string;

  @ApiPropertyOptional({ description: 'Screenshot URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  screenshots?: string[];

  @ApiPropertyOptional({ description: 'Pricing type', enum: MarketplacePricingType })
  @IsOptional()
  @IsEnum(MarketplacePricingType)
  pricingType?: MarketplacePricingType;

  @ApiPropertyOptional({ description: 'Price in cents (for paid agents)' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class PublishVersionDto {
  @ApiPropertyOptional({ description: 'New version number (semver format)', example: '1.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, { message: 'Version must be in semver format (e.g., 1.0.0 or 1.0.0-beta)' })
  version?: string;

  @ApiPropertyOptional({ description: 'Changelog for the new version' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  changelog?: string;
}
