import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsEnum, IsUUID } from 'class-validator';
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
}
