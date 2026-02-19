/**
 * Review Vote DTOs
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * DTOs for helpful voting on reviews.
 */
import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoteReviewDto {
  @ApiProperty({ description: 'Whether the review was helpful' })
  @IsBoolean()
  @IsNotEmpty()
  isHelpful!: boolean;
}

export class ReviewVoteResponseDto {
  @ApiProperty({ description: 'Number of helpful votes' })
  helpfulCount!: number;

  @ApiProperty({ description: 'Number of not helpful votes' })
  notHelpfulCount!: number;

  @ApiProperty({ description: 'Current user vote status', enum: ['helpful', 'not_helpful', null], nullable: true })
  userVote!: 'helpful' | 'not_helpful' | null;
}
