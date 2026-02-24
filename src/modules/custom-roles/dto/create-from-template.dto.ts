import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleFromTemplateDto {
  @ApiProperty({
    description: 'Template ID to create the role from',
    example: 'qa_lead',
  })
  @IsNotEmpty()
  @IsString()
  templateId!: string;

  @ApiPropertyOptional({
    description: 'Override the template default name (slug format)',
    example: 'qa-lead-team-a',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Name must contain only lowercase alphanumeric characters, hyphens, and underscores',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Override the template display name',
    example: 'QA Lead (Team A)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Override the template description',
    example: 'Customized QA Lead role for Team A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Override the template color (hex code)',
    example: '#8b5cf6',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Color must be a valid hex color code (e.g., #8b5cf6)',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Override the template icon name',
    example: 'check-circle',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description:
      'Permission customizations on top of template defaults. Keys are resource types, values are permission maps.',
    example: { deployments: { trigger: true } },
  })
  @IsOptional()
  customizations?: Record<string, Record<string, boolean>>;
}
