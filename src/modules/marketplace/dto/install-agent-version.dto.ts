/**
 * Install Agent Version DTOs
 *
 * Story 18-8: Agent Installation Flow
 *
 * DTOs for version selection during agent installation.
 */
import {
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstallAgentVersionDto {
  @ApiProperty({ description: 'Target workspace ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({
    description: 'Specific version to install (defaults to latest)',
    example: '1.2.0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;

  @ApiPropertyOptional({
    description: 'Enable auto-update for this agent',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoUpdate?: boolean;

  @ApiPropertyOptional({
    description: 'Skip dependency checks during installation',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skipDependencyCheck?: boolean;

  @ApiPropertyOptional({
    description: 'Force install even with conflicts (for bypassable conflicts only)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceInstall?: boolean;
}

export class AgentVersionSummaryDto {
  @ApiProperty({
    description: 'Version number (semver)',
    example: '1.2.0',
  })
  @IsString()
  version!: string;

  @ApiProperty({
    description: 'Changelog or release notes for this version',
    example: 'Added new code analysis features and bug fixes',
  })
  @IsString()
  changelog!: string;

  @ApiProperty({
    description: 'Date when this version was published',
  })
  publishedAt!: Date;

  @ApiProperty({
    description: 'Whether this is the latest version',
    example: true,
  })
  isLatest!: boolean;

  @ApiProperty({
    description: 'Whether this version contains breaking changes',
    example: false,
  })
  isBreaking!: boolean;
}
