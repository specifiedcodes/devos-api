import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  IsIn,
  Length,
  Matches,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Pull Request DTOs
 * Story 6.4: GitHub Pull Request Creation
 *
 * Request/response DTOs for pull request CRUD and merge operations.
 */

// ============ Request DTOs ============

export class CreatePullRequestDto {
  @ApiProperty({
    description: 'Pull request title',
    example: 'Story 1.2: User Login',
    minLength: 1,
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  title!: string;

  @ApiProperty({
    description: 'Head branch name (source branch)',
    example: 'feature/1-2-user-login',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Head branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  head!: string;

  @ApiPropertyOptional({
    description: 'Base branch name (target branch)',
    default: 'main',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Base branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  base?: string = 'main';

  @ApiPropertyOptional({
    description: 'Pull request body/description',
    example: '## Story\nUser Login\n\n## Changes\n- Added login endpoint',
    maxLength: 65536,
  })
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  body?: string;

  @ApiPropertyOptional({
    description: 'Labels to apply to the pull request',
    example: ['ai-generated', 'feat'],
    maxItems: 10,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @Length(1, 50, { each: true, message: 'Each label must be between 1 and 50 characters' })
  labels?: string[];

  @ApiPropertyOptional({
    description: 'Whether to create as a draft PR',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  draft?: boolean = false;
}

export class UpdatePullRequestDto {
  @ApiPropertyOptional({
    description: 'Updated pull request title',
    minLength: 1,
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated pull request body/description',
    maxLength: 65536,
  })
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  body?: string;

  @ApiPropertyOptional({
    description: 'Pull request state',
    enum: ['open', 'closed'],
  })
  @IsOptional()
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';

  @ApiPropertyOptional({
    description: 'Base branch name',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._/-]+$/, {
    message:
      'Base branch name can only contain alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  base?: string;
}

export class MergePullRequestDto {
  @ApiPropertyOptional({
    description: 'Merge method',
    enum: ['merge', 'squash', 'rebase'],
    default: 'squash',
  })
  @IsOptional()
  @IsIn(['merge', 'squash', 'rebase'])
  mergeMethod?: 'merge' | 'squash' | 'rebase' = 'squash';

  @ApiPropertyOptional({
    description: 'Commit title for the merge commit',
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  commitTitle?: string;

  @ApiPropertyOptional({
    description: 'Commit message for the merge commit',
    maxLength: 65536,
  })
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  commitMessage?: string;
}

export class PullRequestListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by PR state',
    enum: ['open', 'closed', 'all'],
    default: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  state?: 'open' | 'closed' | 'all' = 'open';

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['created', 'updated', 'popularity'],
    default: 'created',
  })
  @IsOptional()
  @IsIn(['created', 'updated', 'popularity'])
  sort?: 'created' | 'updated' | 'popularity' = 'created';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc' = 'desc';

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
}

// ============ Response DTOs ============

export class PullRequestResponseDto {
  @ApiProperty({ description: 'GitHub PR ID', example: 1 })
  id!: number;

  @ApiProperty({ description: 'PR number', example: 42 })
  number!: number;

  @ApiProperty({ description: 'PR title', example: 'Story 1.2: User Login' })
  title!: string;

  @ApiPropertyOptional({ description: 'PR body/description' })
  body?: string;

  @ApiProperty({ description: 'PR state', example: 'open' })
  state!: string;

  @ApiProperty({
    description: 'PR HTML URL',
    example: 'https://github.com/owner/repo/pull/42',
  })
  htmlUrl!: string;

  @ApiProperty({ description: 'Head branch info' })
  head!: { ref: string; sha: string };

  @ApiProperty({ description: 'Base branch info' })
  base!: { ref: string; sha: string };

  @ApiProperty({ description: 'Whether this is a draft PR', example: false })
  draft!: boolean;

  @ApiProperty({ description: 'Labels', example: ['ai-generated', 'feat'] })
  labels!: string[];

  @ApiProperty({ description: 'PR author info' })
  user!: { login: string; avatarUrl: string };

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: 'Mergeable state' })
  mergeableState?: string;

  @ApiPropertyOptional({ description: 'Whether PR is mergeable' })
  mergeable?: boolean;

  @ApiPropertyOptional({ description: 'Diff URL' })
  diffUrl?: string;

  @ApiPropertyOptional({ description: 'Number of additions' })
  additions?: number;

  @ApiPropertyOptional({ description: 'Number of deletions' })
  deletions?: number;

  @ApiPropertyOptional({ description: 'Number of changed files' })
  changedFiles?: number;
}

export class PullRequestListResponseDto {
  @ApiProperty({
    description: 'List of pull requests',
    type: [PullRequestResponseDto],
  })
  pullRequests!: PullRequestResponseDto[];

  @ApiProperty({ description: 'Number of pull requests returned on this page (not total across all pages)', example: 1 })
  total!: number;
}

export class MergePullRequestResponseDto {
  @ApiProperty({ description: 'Whether merge was successful', example: true })
  merged!: boolean;

  @ApiProperty({ description: 'Merge commit SHA', example: 'abc123def456' })
  sha!: string;

  @ApiProperty({
    description: 'Merge result message',
    example: 'Pull Request successfully merged',
  })
  message!: string;
}
