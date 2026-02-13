import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum RepoStructure {
  MONOREPO = 'monorepo',
  POLYREPO = 'polyrepo',
}

export class DefaultPreferencesDto {
  @ApiProperty({
    description: 'Repository structure preference',
    enum: RepoStructure,
    example: 'polyrepo',
  })
  @IsEnum(RepoStructure)
  repoStructure!: 'monorepo' | 'polyrepo';

  @ApiProperty({
    description: 'Code style and linting configuration',
    example: 'ESLint + Prettier',
  })
  @IsString()
  codeStyle!: string;

  @ApiProperty({
    description: 'Testing strategy and frameworks',
    example: 'Jest + RTL + Playwright',
  })
  @IsString()
  testingStrategy!: string;

  @ApiProperty({
    description: 'CI/CD platform or tool',
    example: 'GitHub Actions',
    required: false,
  })
  @IsOptional()
  @IsString()
  cicd?: string;
}
