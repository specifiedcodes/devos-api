/**
 * Review Report DTOs
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * DTOs for reporting reviews for moderation.
 */
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewReportReason } from '../../../database/entities/review-report.entity';

export class ReportReviewDto {
  @ApiProperty({
    description: 'Reason for reporting the review',
    enum: ReviewReportReason,
    example: ReviewReportReason.SPAM,
  })
  @IsEnum(ReviewReportReason)
  @IsNotEmpty()
  reason!: ReviewReportReason;

  @ApiPropertyOptional({ description: 'Additional details about the report', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
