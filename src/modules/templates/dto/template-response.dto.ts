import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TechStackDto } from './tech-stack.dto';
import { DefaultPreferencesDto } from './default-preferences.dto';
import { TemplateCategory } from '../constants/template-registry.constant';

export class TemplateResponseDto {
  @ApiProperty({
    description: 'Unique template identifier',
    example: 'nextjs-saas-starter',
  })
  @IsString()
  id!: string;

  @ApiProperty({
    description: 'Display name of the template',
    example: 'Next.js SaaS Starter',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Detailed description of what the template provides',
    example:
      'Full-stack SaaS template with authentication, billing, dashboard, and multi-tenancy. Includes user management, subscription handling, and analytics integration. Perfect for B2B or B2C SaaS products.',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.SAAS,
  })
  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @ApiProperty({
    description: 'Technology stack details',
    type: TechStackDto,
  })
  @ValidateNested()
  @Type(() => TechStackDto)
  techStack!: TechStackDto;

  @ApiProperty({
    description: 'Default project preferences',
    type: DefaultPreferencesDto,
  })
  @ValidateNested()
  @Type(() => DefaultPreferencesDto)
  defaultPreferences!: DefaultPreferencesDto;

  @ApiProperty({
    description: 'Icon identifier for UI display',
    example: 'rocket',
    required: false,
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({
    description: 'Whether this template is recommended/featured',
    example: true,
  })
  @IsBoolean()
  recommended!: boolean;

  @ApiProperty({
    description: 'Tags for filtering and search',
    example: ['saas', 'fullstack', 'nextjs', 'typescript', 'tailwind'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}
