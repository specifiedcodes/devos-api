import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class SharedProjectViewDto {
  @Expose()
  @ApiProperty({
    description: 'Project unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @Expose()
  @ApiProperty({
    description: 'Project name',
    example: 'My Awesome Project',
  })
  name!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Project description',
    example: 'A comprehensive description of the project',
  })
  description?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Deployment URL if available',
    example: 'https://myproject.vercel.app',
  })
  deploymentUrl?: string;

  @Expose()
  @ApiProperty({
    description: 'Project status',
    example: 'active',
  })
  status!: string;

  @Expose()
  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2026-01-31T12:00:00Z',
  })
  updatedAt!: Date;

  @Expose()
  @ApiProperty({
    description: 'Branding footer',
    example: 'Powered by DevOS',
  })
  poweredBy!: string;
}
