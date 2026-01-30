import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  RepositoryStructure,
  CodeStyle,
  GitWorkflow,
  TestingStrategy,
} from '../../../database/entities/project-preferences.entity';

export class CreateProjectPreferencesDto {
  @ApiPropertyOptional({
    description: 'Repository structure preference',
    example: 'monorepo',
    enum: RepositoryStructure,
    default: RepositoryStructure.MONOREPO,
  })
  @IsOptional()
  @IsEnum(RepositoryStructure)
  repositoryStructure?: RepositoryStructure;

  @ApiPropertyOptional({
    description: 'Code style preference',
    example: 'functional',
    enum: CodeStyle,
    default: CodeStyle.FUNCTIONAL,
  })
  @IsOptional()
  @IsEnum(CodeStyle)
  codeStyle?: CodeStyle;

  @ApiPropertyOptional({
    description: 'Git workflow preference',
    example: 'github_flow',
    enum: GitWorkflow,
    default: GitWorkflow.GITHUB_FLOW,
  })
  @IsOptional()
  @IsEnum(GitWorkflow)
  gitWorkflow?: GitWorkflow;

  @ApiPropertyOptional({
    description: 'Testing strategy preference',
    example: 'balanced',
    enum: TestingStrategy,
    default: TestingStrategy.BALANCED,
  })
  @IsOptional()
  @IsEnum(TestingStrategy)
  testingStrategy?: TestingStrategy;
}
