import { validate } from 'class-validator';
import { Project, ProjectStatus } from './project.entity';

describe('Project Entity', () => {
  it('should create a valid project entity', () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = 'Test Project';
    project.description = 'Test Description';
    project.workspaceId = '550e8400-e29b-41d4-a716-446655440001';
    project.createdByUserId = '550e8400-e29b-41d4-a716-446655440002';
    project.status = ProjectStatus.ACTIVE;

    expect(project).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.status).toBe(ProjectStatus.ACTIVE);
  });

  it('should fail validation when name is empty', async () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = '';
    project.workspaceId = '550e8400-e29b-41d4-a716-446655440001';
    project.createdByUserId = '550e8400-e29b-41d4-a716-446655440002';

    const errors = await validate(project);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail validation when workspaceId is not a valid UUID', async () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = 'Test Project';
    project.workspaceId = 'invalid-uuid';
    project.createdByUserId = '550e8400-e29b-41d4-a716-446655440002';

    const errors = await validate(project);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'workspaceId')).toBe(true);
  });

  it('should fail validation when createdByUserId is not a valid UUID', async () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = 'Test Project';
    project.workspaceId = '550e8400-e29b-41d4-a716-446655440001';
    project.createdByUserId = 'invalid-uuid';

    const errors = await validate(project);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'createdByUserId')).toBe(true);
  });

  it('should fail validation when githubRepoUrl is not a valid URL', async () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = 'Test Project';
    project.workspaceId = '550e8400-e29b-41d4-a716-446655440001';
    project.createdByUserId = '550e8400-e29b-41d4-a716-446655440002';
    project.githubRepoUrl = 'not-a-valid-url';

    const errors = await validate(project);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'githubRepoUrl')).toBe(true);
  });

  it('should pass validation when githubRepoUrl is a valid URL', async () => {
    const project = new Project();
    project.id = '550e8400-e29b-41d4-a716-446655440000';
    project.name = 'Test Project';
    project.workspaceId = '550e8400-e29b-41d4-a716-446655440001';
    project.createdByUserId = '550e8400-e29b-41d4-a716-446655440002';
    project.githubRepoUrl = 'https://github.com/user/repo';
    project.status = ProjectStatus.ACTIVE;

    const errors = await validate(project);
    const githubErrors = errors.filter((e) => e.property === 'githubRepoUrl');
    expect(githubErrors.length).toBe(0);
  });

  it('should accept valid ProjectStatus enum values', () => {
    const project = new Project();
    project.status = ProjectStatus.ACTIVE;
    expect(project.status).toBe('active');

    project.status = ProjectStatus.ARCHIVED;
    expect(project.status).toBe('archived');

    project.status = ProjectStatus.DELETED;
    expect(project.status).toBe('deleted');
  });
});
