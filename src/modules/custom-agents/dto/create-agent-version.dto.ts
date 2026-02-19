/**
 * CreateAgentVersionDto
 *
 * Story 18-4: Agent Versioning
 *
 * DTO for creating a new agent version.
 */
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, Matches, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum VersionIncrementType {
  MAJOR = 'major',
  MINOR = 'minor',
  PATCH = 'patch',
}

export class CreateAgentVersionDto {
  @ApiPropertyOptional({
    description: 'Explicit version number (semver). If not provided, auto-increments based on incrementType.',
    example: '1.2.0',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, {
    message: 'version must follow semver format (e.g., 1.0.0, 1.0.0-beta.1)',
  })
  version?: string;

  @ApiPropertyOptional({
    description: 'How to auto-increment version if version not specified',
    enum: VersionIncrementType,
    default: 'patch',
    example: 'patch',
  })
  @IsOptional()
  @IsEnum(VersionIncrementType)
  incrementType?: VersionIncrementType;

  @ApiPropertyOptional({
    description: 'Changelog describing changes in this version',
    maxLength: 5000,
    example: 'Added new tool permissions for file system access',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  changelog?: string;
}
