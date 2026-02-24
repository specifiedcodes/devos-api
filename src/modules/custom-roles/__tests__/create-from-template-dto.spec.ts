import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRoleFromTemplateDto } from '../dto/create-from-template.dto';

describe('CreateRoleFromTemplateDto', () => {
  function createDto(overrides: Partial<CreateRoleFromTemplateDto> = {}): CreateRoleFromTemplateDto {
    const base = { templateId: 'qa_lead' };
    return plainToInstance(CreateRoleFromTemplateDto, { ...base, ...overrides });
  }

  it('should pass with valid templateId only', async () => {
    const dto = createDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when templateId is empty', async () => {
    const dto = createDto({ templateId: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const templateErrors = errors.find((e) => e.property === 'templateId');
    expect(templateErrors).toBeDefined();
  });

  it('should fail when templateId is missing', async () => {
    const dto = plainToInstance(CreateRoleFromTemplateDto, {});
    const errors = await validate(dto);
    const templateErrors = errors.find((e) => e.property === 'templateId');
    expect(templateErrors).toBeDefined();
  });

  it('should pass with valid optional name', async () => {
    const dto = createDto({ name: 'my-custom-role' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when name contains uppercase', async () => {
    const dto = createDto({ name: 'MyRole' });
    const errors = await validate(dto);
    const nameErrors = errors.find((e) => e.property === 'name');
    expect(nameErrors).toBeDefined();
  });

  it('should fail when name is too short', async () => {
    const dto = createDto({ name: 'a' });
    const errors = await validate(dto);
    const nameErrors = errors.find((e) => e.property === 'name');
    expect(nameErrors).toBeDefined();
  });

  it('should pass with valid color hex', async () => {
    const dto = createDto({ color: '#ff5500' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid color format', async () => {
    const dto = createDto({ color: 'red' });
    const errors = await validate(dto);
    const colorErrors = errors.find((e) => e.property === 'color');
    expect(colorErrors).toBeDefined();
  });

  it('should pass with all optional fields', async () => {
    const dto = createDto({
      name: 'custom-qa',
      displayName: 'Custom QA',
      description: 'A custom QA role',
      color: '#8b5cf6',
      icon: 'check-circle',
      customizations: { projects: { read: true } },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass when optional fields are omitted', async () => {
    const dto = createDto({
      name: undefined,
      displayName: undefined,
      description: undefined,
      color: undefined,
      icon: undefined,
      customizations: undefined,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
