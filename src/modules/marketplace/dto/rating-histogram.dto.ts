/**
 * Rating Histogram DTOs
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * DTOs for rating histogram and breakdown data.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RatingBreakdownDto {
  @ApiProperty({ description: 'Rating value (1-5)' })
  rating!: number;

  @ApiProperty({ description: 'Number of reviews with this rating' })
  count!: number;

  @ApiProperty({ description: 'Percentage of total reviews' })
  percentage!: number;
}

export class RatingHistogramDto {
  @ApiProperty({ type: [RatingBreakdownDto], description: 'Breakdown by rating (5 to 1)' })
  breakdown!: RatingBreakdownDto[];

  @ApiProperty({ description: 'Average rating across all reviews' })
  avgRating!: number;

  @ApiProperty({ description: 'Total number of reviews' })
  totalReviews!: number;
}
