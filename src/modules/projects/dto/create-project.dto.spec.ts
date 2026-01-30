import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

describe('CreateProjectDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Test Project';
    dto.description = 'Test Description';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when name is empty', async () => {
    const dto = new CreateProjectDto();
    dto.name = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail validation when name is too short', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'ab';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail validation when name is too long', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'a'.repeat(101);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail validation when description is too long', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Valid Name';
    dto.description = 'a'.repeat(1001);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('description');
  });

  it('should fail validation when githubRepoUrl is not a valid URL', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Valid Name';
    dto.githubRepoUrl = 'not-a-valid-url';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('githubRepoUrl');
  });

  it('should pass validation when githubRepoUrl is a valid URL', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Valid Name';
    dto.githubRepoUrl = 'https://github.com/user/repo';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation when optional fields are undefined', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Valid Name';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when deploymentUrl is not a valid URL', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Valid Name';
    dto.deploymentUrl = 'not-a-valid-url';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('deploymentUrl');
  });
});
