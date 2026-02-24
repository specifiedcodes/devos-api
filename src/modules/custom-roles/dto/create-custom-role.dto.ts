import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseRole } from '../../../database/entities/custom-role.entity';

export class CreateCustomRoleDto {
  @ApiProperty({
    description:
      'Unique role name (lowercase, alphanumeric, hyphens, underscores)',
    example: 'qa-lead',
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
    description: 'Human-readable display name',
    example: 'QA Lead',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Role description',
    example: 'Quality assurance team lead with test management access',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Hex color code for visual identification',
    example: '#6366f1',
    default: '#6366f1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Color must be a valid hex color code',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Icon name from predefined set',
    example: 'shield',
    default: 'shield',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Base role to inherit permissions from',
    enum: BaseRole,
  })
  @IsOptional()
  @IsEnum(BaseRole)
  baseRole?: BaseRole;
}
