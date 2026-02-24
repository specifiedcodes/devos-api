/**
 * Template Review Query DTO
 *
 * Story 19-5: Template Rating & Reviews
 */
import { IsOptional, IsInt, Min, Max, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReviewSortOption {
  MOST_HELPFUL = 'most_helpful',
  MOST_RECENT = 'most_recent',
  HIGHEST_RATING = 'highest_rating',
  LOWEST_RATING = 'lowest_rating',
}

export class TemplateReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ReviewSortOption)
  sortBy?: ReviewSortOption = ReviewSortOption.MOST_HELPFUL;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  ratingFilter?: number;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
