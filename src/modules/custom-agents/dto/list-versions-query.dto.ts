/**
 * ListVersionsQueryDto
 *
 * Story 18-4: Agent Versioning
 *
 * Query DTO for listing agent versions with pagination and filtering.
 */
import { IsOptional, IsInt, Min, Max, IsBooleanString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListVersionsQueryDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number (1-indexed)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Only return published versions' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBooleanString()
  publishedOnly?: boolean;
}
