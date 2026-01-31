import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsEnum, IsUUID, IsString } from 'class-validator';
import { Project } from './project.entity';

export enum RepositoryStructure {
  MONOREPO = 'monorepo',
  POLYREPO = 'polyrepo',
}

export enum CodeStyle {
  FUNCTIONAL = 'functional',
  OOP = 'oop',
}

export enum GitWorkflow {
  GITHUB_FLOW = 'github_flow',
  GIT_FLOW = 'git_flow',
}

export enum TestingStrategy {
  UNIT_HEAVY = 'unit_heavy',
  BALANCED = 'balanced',
  E2E_HEAVY = 'e2e_heavy',
}

export enum AiProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
}

/**
 * Valid model identifiers per AI provider.
 * Used for validation when setting per-project AI configuration.
 */
export const VALID_MODELS_BY_PROVIDER: Record<AiProvider, string[]> = {
  [AiProvider.ANTHROPIC]: [
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-5-20251101',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
  ],
  [AiProvider.OPENAI]: [
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
};

export const DEFAULT_AI_PROVIDER = AiProvider.ANTHROPIC;
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-5-20250929';

@Entity('project_preferences')
export class ProjectPreferences {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id', unique: true })
  @IsUUID()
  projectId!: string;

  @OneToOne(() => Project, (project) => project.preferences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({
    type: 'enum',
    enum: RepositoryStructure,
    default: RepositoryStructure.MONOREPO,
    name: 'repository_structure',
  })
  @IsEnum(RepositoryStructure)
  repositoryStructure!: RepositoryStructure;

  @Column({
    type: 'enum',
    enum: CodeStyle,
    default: CodeStyle.FUNCTIONAL,
    name: 'code_style',
  })
  @IsEnum(CodeStyle)
  codeStyle!: CodeStyle;

  @Column({
    type: 'enum',
    enum: GitWorkflow,
    default: GitWorkflow.GITHUB_FLOW,
    name: 'git_workflow',
  })
  @IsEnum(GitWorkflow)
  gitWorkflow!: GitWorkflow;

  @Column({
    type: 'enum',
    enum: TestingStrategy,
    default: TestingStrategy.BALANCED,
    name: 'testing_strategy',
  })
  @IsEnum(TestingStrategy)
  testingStrategy!: TestingStrategy;

  @Column({
    type: 'varchar',
    length: 20,
    default: DEFAULT_AI_PROVIDER,
    name: 'ai_provider',
  })
  @IsString()
  aiProvider!: string;

  @Column({
    type: 'varchar',
    length: 100,
    default: DEFAULT_AI_MODEL,
    name: 'ai_model',
  })
  @IsString()
  aiModel!: string;
}
