import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CloneCustomRoleDto {
  @ApiProperty({
    description: 'Unique name for the cloned role',
    example: 'senior-qa-lead',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Name must contain only lowercase alphanumeric characters, hyphens, and underscores',
  })
  name!: string;

  @ApiProperty({
    description: 'Display name for the cloned role',
    example: 'Senior QA Lead',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Description for the cloned role',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
