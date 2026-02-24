/**
 * Publish Template Version DTO
 *
 * Story 19-7: Template Versioning
 */
import { IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublishTemplateVersionDto {
  @ApiProperty({
    description: 'Version number in semver format',
    example: '1.1.0',
    pattern: '^\\d+\\.\\d+\\.\\d+$',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version!: string;

  @ApiPropertyOptional({
    description: 'Changelog for this version (markdown supported)',
    example: '## New Features\n- Added dark mode support\n\n## Bug Fixes\n- Fixed login redirect',
  })
  @IsOptional()
  @IsString()
  changelog?: string;
}
