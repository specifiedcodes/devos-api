/**
 * Update File DTO
 * Story 16.2: File Upload/Download API (AC3)
 *
 * Validates optional metadata updates for an existing file.
 */

import { IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFileDto {
  @ApiPropertyOptional({
    description: 'Updated file description',
    example: 'Updated API design specification document v2',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Move file to new path',
    example: '/archive/docs',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/^\/[a-zA-Z0-9_\-\/\.]*$/, {
    message: 'Path must start with / and contain only alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  path?: string;
}
