/**
 * Upload File DTO
 * Story 16.2: File Upload/Download API (AC3)
 *
 * Validates multipart form data fields for file upload.
 */

import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({
    description: 'Destination path within project (e.g., /src, /docs, /assets)',
    example: '/docs',
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/^\/[a-zA-Z0-9_\-\/\.]*$/, {
    message: 'Path must start with / and contain only alphanumeric characters, hyphens, underscores, dots, and slashes',
  })
  path!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the file',
    example: 'API design specification document',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
