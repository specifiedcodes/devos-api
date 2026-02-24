/**
 * List Versions Query DTO
 *
 * Story 19-7: Template Versioning
 */
import { IsOptional, IsInt, Min, Max, IsEnum, IsBooleanString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum VersionSortBy {
  VERSION = 'version',
  PUBLISHED_AT = 'publishedAt',
  DOWNLOAD_COUNT = 'downloadCount',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListVersionsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: VersionSortBy,
    default: VersionSortBy.PUBLISHED_AT,
  })
  @IsOptional()
  @IsEnum(VersionSortBy)
  sortBy?: VersionSortBy = VersionSortBy.PUBLISHED_AT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: 'Filter to show only latest version',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBooleanString()
  latestOnly?: boolean = false;
}
