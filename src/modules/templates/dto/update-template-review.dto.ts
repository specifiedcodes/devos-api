/**
 * Update Template Review DTO
 *
 * Story 19-5: Template Rating & Reviews
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateReviewDto } from './create-template-review.dto';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsArray,
} from 'class-validator';

export class UpdateTemplateReviewDto extends PartialType(
  CreateTemplateReviewDto,
) {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @MinLength(50)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
