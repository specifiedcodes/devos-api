/**
 * Dismiss Update DTO
 *
 * Story 19-7: Template Versioning
 */
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DismissUpdateDto {
  @ApiProperty({
    description: 'Version number to dismiss',
    example: '1.1.0',
    pattern: '^\\d+\\.\\d+\\.\\d+$',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version!: string;
}
