/**
 * Kanban Preferences DTOs
 * Story 7.8: Kanban Board Customization
 */

import { IsString, IsBoolean, IsNumber, IsArray, IsOptional, ValidateNested, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Valid story status values
 */
export enum StoryStatusValue {
  BACKLOG = 'backlog',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
}

/**
 * Column configuration DTO
 */
export class ColumnConfigDto {
  @ApiProperty({ enum: StoryStatusValue, description: 'Story status this column represents' })
  @IsEnum(StoryStatusValue)
  status!: StoryStatusValue;

  @ApiProperty({ description: 'Whether the column is visible' })
  @IsBoolean()
  visible!: boolean;

  @ApiProperty({ description: 'Custom display name for the column' })
  @IsString()
  displayName!: string;

  @ApiProperty({ description: 'Order of the column (0-based)' })
  @IsNumber()
  order!: number;
}

/**
 * Card display configuration DTO
 */
export class CardDisplayConfigDto {
  @ApiProperty({ description: 'Show story points on cards' })
  @IsBoolean()
  showStoryPoints!: boolean;

  @ApiProperty({ description: 'Show tags on cards' })
  @IsBoolean()
  showTags!: boolean;

  @ApiProperty({ description: 'Show dates on cards' })
  @IsBoolean()
  showDates!: boolean;

  @ApiProperty({ description: 'Show priority indicator on cards' })
  @IsBoolean()
  showPriority!: boolean;

  @ApiProperty({ description: 'Show epic label on cards' })
  @IsBoolean()
  showEpic!: boolean;

  @ApiProperty({ description: 'Show assigned agent on cards' })
  @IsBoolean()
  showAssignedAgent!: boolean;
}

/**
 * Partial card display configuration for updates
 */
export class PartialCardDisplayConfigDto {
  @ApiPropertyOptional({ description: 'Show story points on cards' })
  @IsOptional()
  @IsBoolean()
  showStoryPoints?: boolean;

  @ApiPropertyOptional({ description: 'Show tags on cards' })
  @IsOptional()
  @IsBoolean()
  showTags?: boolean;

  @ApiPropertyOptional({ description: 'Show dates on cards' })
  @IsOptional()
  @IsBoolean()
  showDates?: boolean;

  @ApiPropertyOptional({ description: 'Show priority indicator on cards' })
  @IsOptional()
  @IsBoolean()
  showPriority?: boolean;

  @ApiPropertyOptional({ description: 'Show epic label on cards' })
  @IsOptional()
  @IsBoolean()
  showEpic?: boolean;

  @ApiPropertyOptional({ description: 'Show assigned agent on cards' })
  @IsOptional()
  @IsBoolean()
  showAssignedAgent?: boolean;
}

/**
 * Full Kanban preferences response
 */
export class KanbanPreferencesResponseDto {
  @ApiProperty({ type: [ColumnConfigDto], description: 'Column configurations' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnConfigDto)
  columns!: ColumnConfigDto[];

  @ApiProperty({ type: CardDisplayConfigDto, description: 'Card display configuration' })
  @ValidateNested()
  @Type(() => CardDisplayConfigDto)
  cardDisplay!: CardDisplayConfigDto;

  @ApiProperty({ description: 'Theme preference: light, dark, or system', enum: ['light', 'dark', 'system'] })
  @IsIn(['light', 'dark', 'system'])
  theme!: string;
}

/**
 * Update Kanban preferences request
 */
export class UpdateKanbanPreferencesDto {
  @ApiPropertyOptional({ type: [ColumnConfigDto], description: 'Column configurations' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnConfigDto)
  columns?: ColumnConfigDto[];

  @ApiPropertyOptional({ type: PartialCardDisplayConfigDto, description: 'Card display configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialCardDisplayConfigDto)
  cardDisplay?: PartialCardDisplayConfigDto;

  @ApiPropertyOptional({ description: 'Theme preference: light, dark, or system', enum: ['light', 'dark', 'system'] })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;
}
