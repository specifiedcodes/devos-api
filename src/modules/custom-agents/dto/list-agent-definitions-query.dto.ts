import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListAgentDefinitionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : value === 'true'))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by published status' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : value === 'true'))
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Search by name or display name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Filter by creator user ID' })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt', enum: ['createdAt', 'updatedAt', 'name', 'displayName'] })
  @IsString()
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'name', 'displayName'])
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'displayName';

  @ApiPropertyOptional({ description: 'Sort order', default: 'DESC', enum: ['ASC', 'DESC'] })
  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
