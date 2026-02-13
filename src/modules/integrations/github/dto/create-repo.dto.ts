import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CreateRepoDto
 * Story 6.2: GitHub Repository Creation
 *
 * DTO for creating a GitHub repository via the DevOS API.
 */
export class CreateRepoDto {
  @ApiProperty({
    description: 'Repository name (valid GitHub repo name)',
    example: 'my-project',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Repository name can only contain alphanumeric characters, hyphens, underscores, and dots',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Repository description',
    example: 'An awesome project built with DevOS',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the repository is private',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to auto-initialize with a README',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoInit?: boolean;

  @ApiPropertyOptional({
    description: 'Gitignore template to use',
    enum: ['Node', 'Python', 'Java', 'Go', 'Ruby', 'Rust'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['Node', 'Python', 'Java', 'Go', 'Ruby', 'Rust'])
  gitignoreTemplate?: string;

  @ApiPropertyOptional({
    description: 'License template to use',
    enum: ['mit', 'apache-2.0', 'gpl-3.0'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['mit', 'apache-2.0', 'gpl-3.0'])
  licenseTemplate?: string;
}
