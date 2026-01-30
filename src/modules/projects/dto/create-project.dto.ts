import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Project name',
    example: 'My Awesome Project',
    minLength: 3,
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'A description of my awesome project',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Template ID used to create the project',
    example: 'nextjs-typescript-template',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @ApiPropertyOptional({
    description: 'GitHub repository URL',
    example: 'https://github.com/user/repo',
  })
  @IsOptional()
  @IsUrl()
  githubRepoUrl?: string;

  @ApiPropertyOptional({
    description: 'Deployment URL',
    example: 'https://myproject.vercel.app',
  })
  @IsOptional()
  @IsUrl()
  deploymentUrl?: string;
}
