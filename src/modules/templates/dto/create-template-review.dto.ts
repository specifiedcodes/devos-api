/**
 * Create Template Review DTO
 *
 * Story 19-5: Template Rating & Reviews
 */
import {
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateTemplateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  rating!: number;

  @MaxLength(100)
  @IsOptional()
  title?: string;

  @IsNotEmpty()
  @MinLength(50)
  @MaxLength(5000)
  body!: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsUUID()
  @IsNotEmpty()
  templateId!: string;
}
