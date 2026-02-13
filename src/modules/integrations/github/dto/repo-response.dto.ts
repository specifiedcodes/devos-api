import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  Matches,
  IsBoolean,
} from 'class-validator';

/**
 * GitHubRepoResponseDto
 * Story 6.2: GitHub Repository Creation
 *
 * Typed response for GitHub repository operations.
 * Maps from GitHub API snake_case to camelCase.
 */
export class GitHubRepoResponseDto {
  @ApiProperty({ description: 'GitHub repository ID', example: 123456789 })
  id!: number;

  @ApiProperty({ description: 'Repository name', example: 'my-project' })
  name!: string;

  @ApiProperty({
    description: 'Full repository name (owner/repo)',
    example: 'username/my-project',
  })
  fullName!: string;

  @ApiProperty({
    description: 'GitHub HTML URL',
    example: 'https://github.com/username/my-project',
  })
  htmlUrl!: string;

  @ApiProperty({
    description: 'Clone URL (HTTPS)',
    example: 'https://github.com/username/my-project.git',
  })
  cloneUrl!: string;

  @ApiProperty({
    description: 'SSH URL',
    example: 'git@github.com:username/my-project.git',
  })
  sshUrl!: string;

  @ApiProperty({ description: 'Whether the repository is private', example: true })
  private!: boolean;

  @ApiProperty({ description: 'Default branch name', example: 'main' })
  defaultBranch!: string;

  @ApiPropertyOptional({
    description: 'Repository description',
    example: 'An awesome project built with DevOS',
  })
  description!: string | null;
}

/**
 * LinkRepoDto
 * Story 6.2: GitHub Repository Creation
 *
 * DTO for linking an existing GitHub repository to a project.
 */
export class LinkRepoDto {
  @ApiProperty({
    description: 'GitHub repository URL',
    example: 'https://github.com/username/existing-repo',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, {
    message: 'Must be a valid GitHub repository URL (https://github.com/owner/repo)',
  })
  repoUrl!: string;
}

/**
 * LinkRepoResponseDto
 * Story 6.2: GitHub Repository Creation
 *
 * Response DTO for linking an existing GitHub repository.
 */
export class LinkRepoResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  @IsBoolean()
  success!: boolean;

  @ApiProperty({
    description: 'The linked GitHub repository URL',
    example: 'https://github.com/username/existing-repo',
  })
  @IsString()
  githubRepoUrl!: string;
}
