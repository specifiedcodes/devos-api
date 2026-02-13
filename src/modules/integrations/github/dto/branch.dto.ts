import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Length,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

/**
 * Branch DTOs
 * Story 6.3: GitHub Branch Management
 *
 * Request/response DTOs for branch CRUD operations.
 */

// ============ Request DTOs ============

export class CreateBranchDto {
  @ApiProperty({
    description: 'Branch name (valid git branch name)',
    example: 'feature/1-2-user-login',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  branchName!: string;

  @ApiPropertyOptional({
    description: 'Source branch to create from',
    default: 'main',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Source branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  fromBranch?: string;
}

export class DeleteBranchDto {
  @ApiProperty({
    description: 'Branch name to delete',
    example: 'feature/1-2-user-login',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  branchName!: string;
}

export class BranchListQueryDto {
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
    default: 30,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 30;

  @ApiPropertyOptional({
    description: 'Filter protected branches only',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '') return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  protected?: boolean;
}

// ============ Response DTOs ============

export class BranchResponseDto {
  @ApiProperty({ description: 'Branch name', example: 'feature/1-2-user-login' })
  branchName!: string;

  @ApiProperty({ description: 'Commit SHA', example: 'abc123def456' })
  sha!: string;

  @ApiProperty({ description: 'Git ref', example: 'refs/heads/feature/1-2-user-login' })
  ref!: string;

  @ApiProperty({
    description: 'API URL',
    example: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/1-2-user-login',
  })
  url!: string;
}

export class BranchDetailResponseDto {
  @ApiProperty({ description: 'Branch name', example: 'feature/1-2-user-login' })
  name!: string;

  @ApiProperty({ description: 'Commit SHA', example: 'def456' })
  sha!: string;

  @ApiProperty({ description: 'Whether branch is protected', example: false })
  protected!: boolean;

  @ApiProperty({
    description: 'Branch URL',
    example: 'https://api.github.com/repos/owner/repo/branches/feature/1-2-user-login',
  })
  url!: string;

  @ApiPropertyOptional({
    description: 'Latest commit details',
  })
  commit?: {
    sha: string;
    message: string;
    author: string;
    date: string;
  };
}

export class BranchListResponseDto {
  @ApiProperty({ description: 'List of branches', type: [BranchDetailResponseDto] })
  branches!: BranchDetailResponseDto[];

  @ApiProperty({ description: 'Total number of branches returned', example: 2 })
  total!: number;
}

export class DeleteBranchResponseDto {
  @ApiProperty({ description: 'Whether deletion was successful', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Name of deleted branch', example: 'feature/1-2-user-login' })
  deletedBranch!: string;
}
