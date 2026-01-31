import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class SharedLinkResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier of the shared link',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-safe token for accessing the shared link',
    example: 'abc123def456ghi789jkl012mno345pqr678',
  })
  token!: string;

  @Expose()
  @ApiProperty({
    description: 'Full shareable URL',
    example: 'https://devos.com/share/abc123def456ghi789jkl012mno345pqr678',
  })
  url!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Expiration timestamp (null if never expires)',
    example: '2026-02-07T12:00:00Z',
  })
  expiresAt?: Date | null;

  @Expose()
  @ApiProperty({
    description: 'Whether the link is password protected',
    example: true,
  })
  hasPassword!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Whether the link is active',
    example: true,
  })
  isActive!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Number of times the link has been viewed',
    example: 42,
  })
  viewCount!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Timestamp of last view (null if never viewed)',
    example: '2026-01-31T15:30:00Z',
  })
  lastViewedAt?: Date | null;

  @Expose()
  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-01-31T12:00:00Z',
  })
  createdAt!: Date;
}
