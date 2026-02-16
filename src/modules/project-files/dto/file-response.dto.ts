/**
 * File Response DTO
 * Story 16.2: File Upload/Download API (AC3)
 *
 * Response shape for file metadata endpoints.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileResponseDto {
  @ApiProperty({ description: 'File ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Original filename', example: 'design-spec.pdf' })
  filename!: string;

  @ApiProperty({ description: 'Virtual path within project', example: '/docs' })
  path!: string;

  @ApiProperty({ description: 'File size in bytes', example: 1048576 })
  sizeBytes!: number;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  mimeType!: string;

  @ApiPropertyOptional({ description: 'File description', example: 'API design specification' })
  description?: string;

  @ApiProperty({ description: 'User ID who uploaded', example: '550e8400-e29b-41d4-a716-446655440002' })
  uploadedBy!: string;

  @ApiProperty({ description: 'Upload timestamp', example: '2026-02-16T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-02-16T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Signed download URL (expires in 1 hour)', example: 'https://minio:9000/devos-uploads/...' })
  downloadUrl!: string;
}
