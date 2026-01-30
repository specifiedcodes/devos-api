import { validate } from 'class-validator';
import {
  ProjectPreferences,
  RepositoryStructure,
  CodeStyle,
  GitWorkflow,
  TestingStrategy,
} from './project-preferences.entity';

describe('ProjectPreferences Entity', () => {
  it('should create a valid project preferences entity', () => {
    const preferences = new ProjectPreferences();
    preferences.id = '550e8400-e29b-41d4-a716-446655440000';
    preferences.projectId = '550e8400-e29b-41d4-a716-446655440001';
    preferences.repositoryStructure = RepositoryStructure.MONOREPO;
    preferences.codeStyle = CodeStyle.FUNCTIONAL;
    preferences.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    preferences.testingStrategy = TestingStrategy.BALANCED;

    expect(preferences).toBeDefined();
    expect(preferences.repositoryStructure).toBe(RepositoryStructure.MONOREPO);
    expect(preferences.codeStyle).toBe(CodeStyle.FUNCTIONAL);
  });

  it('should fail validation when projectId is not a valid UUID', async () => {
    const preferences = new ProjectPreferences();
    preferences.id = '550e8400-e29b-41d4-a716-446655440000';
    preferences.projectId = 'invalid-uuid';
    preferences.repositoryStructure = RepositoryStructure.MONOREPO;
    preferences.codeStyle = CodeStyle.FUNCTIONAL;
    preferences.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    preferences.testingStrategy = TestingStrategy.BALANCED;

    const errors = await validate(preferences);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'projectId')).toBe(true);
  });

  it('should accept all RepositoryStructure enum values', () => {
    const preferences = new ProjectPreferences();

    preferences.repositoryStructure = RepositoryStructure.MONOREPO;
    expect(preferences.repositoryStructure).toBe('monorepo');

    preferences.repositoryStructure = RepositoryStructure.POLYREPO;
    expect(preferences.repositoryStructure).toBe('polyrepo');
  });

  it('should accept all CodeStyle enum values', () => {
    const preferences = new ProjectPreferences();

    preferences.codeStyle = CodeStyle.FUNCTIONAL;
    expect(preferences.codeStyle).toBe('functional');

    preferences.codeStyle = CodeStyle.OOP;
    expect(preferences.codeStyle).toBe('oop');
  });

  it('should accept all GitWorkflow enum values', () => {
    const preferences = new ProjectPreferences();

    preferences.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    expect(preferences.gitWorkflow).toBe('github_flow');

    preferences.gitWorkflow = GitWorkflow.GIT_FLOW;
    expect(preferences.gitWorkflow).toBe('git_flow');
  });

  it('should accept all TestingStrategy enum values', () => {
    const preferences = new ProjectPreferences();

    preferences.testingStrategy = TestingStrategy.UNIT_HEAVY;
    expect(preferences.testingStrategy).toBe('unit_heavy');

    preferences.testingStrategy = TestingStrategy.BALANCED;
    expect(preferences.testingStrategy).toBe('balanced');

    preferences.testingStrategy = TestingStrategy.E2E_HEAVY;
    expect(preferences.testingStrategy).toBe('e2e_heavy');
  });

  it('should pass validation with all valid fields', async () => {
    const preferences = new ProjectPreferences();
    preferences.id = '550e8400-e29b-41d4-a716-446655440000';
    preferences.projectId = '550e8400-e29b-41d4-a716-446655440001';
    preferences.repositoryStructure = RepositoryStructure.MONOREPO;
    preferences.codeStyle = CodeStyle.FUNCTIONAL;
    preferences.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    preferences.testingStrategy = TestingStrategy.BALANCED;

    const errors = await validate(preferences);
    expect(errors.length).toBe(0);
  });
});
