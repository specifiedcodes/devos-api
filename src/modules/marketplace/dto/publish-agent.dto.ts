/**
 * PublishAgentDto
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * DTO for publishing an agent to the marketplace.
 */
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, IsArray, IsUrl, IsUUID, Min, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentCategory, MarketplacePricingType } from '../../../database/entities/marketplace-agent.entity';

export class PublishAgentDto {
  @ApiProperty({ description: 'Agent definition ID to publish' })
  @IsUUID()
  @IsNotEmpty()
  agentDefinitionId: string;

  @ApiProperty({ description: 'Workspace ID where agent is defined' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({ description: 'Unique slug for marketplace URL', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Display name', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiProperty({ description: 'Short description (max 200 chars)', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  shortDescription: string;

  @ApiProperty({ description: 'Long description (markdown supported)' })
  @IsString()
  @IsNotEmpty()
  longDescription: string;

  @ApiProperty({ description: 'Category', enum: MarketplaceAgentCategory })
  @IsEnum(MarketplaceAgentCategory)
  category: MarketplaceAgentCategory;

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

  @ApiProperty({ description: 'Pricing type', enum: MarketplacePricingType, default: MarketplacePricingType.FREE })
  @IsEnum(MarketplacePricingType)
  pricingType: MarketplacePricingType;

  @ApiPropertyOptional({ description: 'Price in cents (for paid agents)' })
  @IsOptional()
  @IsInt()
  @Min(100) // Minimum $1.00
  priceCents?: number;
}
