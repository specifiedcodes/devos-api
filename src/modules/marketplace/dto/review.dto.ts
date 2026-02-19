/**
 * Review DTOs
 *
 * Story 18-5: Agent Marketplace Backend
 * Story 18-7: Agent Rating & Reviews (sorting, filtering, enhanced response)
 *
 * DTOs for marketplace agent reviews.
 */
import { IsUUID, IsNotEmpty, IsOptional, IsInt, Min, Max, MaxLength, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReviewSortBy {
  RECENT = 'recent',
  HIGHEST_RATED = 'highest_rated',
  LOWEST_RATED = 'lowest_rated',
  MOST_HELPFUL = 'most_helpful',
}

export class SubmitReviewDto {
  @ApiProperty({ description: 'Workspace ID (must have agent installed)' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiProperty({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Review text (max 2000 chars)', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review?: string;

  @ApiPropertyOptional({ description: 'Version being reviewed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  versionReviewed?: string;
}

export class ReviewResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  marketplaceAgentId!: string;

  @ApiProperty()
  reviewerUserId!: string;

  @ApiProperty()
  reviewerName!: string;

  @ApiProperty()
  rating!: number;

  @ApiPropertyOptional()
  review?: string;

  @ApiPropertyOptional()
  versionReviewed?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  // Story 18-7: Voting info
  @ApiProperty({ description: 'Number of helpful votes' })
  helpfulCount!: number;

  @ApiProperty({ description: 'Number of not helpful votes' })
  notHelpfulCount!: number;

  @ApiPropertyOptional({
    description: 'Current user vote status',
    enum: ['helpful', 'not_helpful', null],
    nullable: true,
  })
  userVote?: 'helpful' | 'not_helpful' | null;

  // Story 18-7: Publisher reply
  @ApiPropertyOptional({ description: 'Publisher reply text', nullable: true })
  publisherReply?: string | null;

  @ApiPropertyOptional({ description: 'Publisher reply timestamp', nullable: true })
  publisherReplyAt?: Date | null;

  @ApiPropertyOptional({ description: 'Publisher reply author ID', nullable: true })
  publisherReplyBy?: string | null;
}

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  // Story 18-7: Sorting and filtering
  @ApiPropertyOptional({ description: 'Filter by rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    description: 'Sort by',
    enum: ReviewSortBy,
    default: ReviewSortBy.RECENT,
  })
  @IsOptional()
  @IsEnum(ReviewSortBy)
  sortBy?: ReviewSortBy = ReviewSortBy.RECENT;
}

export class PaginatedReviewListDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  items!: ReviewResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
