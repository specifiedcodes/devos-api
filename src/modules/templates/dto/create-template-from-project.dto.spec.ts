/**
 * CreateTemplateFromProjectDto Tests
 * Story 19-2: Template Creation Wizard (AC3)
 *
 * Tests for DTO validation and transformation.
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTemplateFromProjectDto,
  SourceConfigDto,
  VariableDefinitionDto,
  TemplatizePatternDto,
} from './create-template-from-project.dto';
import { TemplateCategory } from '../../../database/entities/template.entity';

describe('SourceConfigDto', () => {
  it('should validate a valid project source config', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'project',
      projectId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid github_url source config', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'github_url',
      githubUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for invalid source type', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'invalid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
  });

  it('should fail for invalid projectId', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'project',
      projectId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('projectId');
  });

  it('should fail for invalid githubUrl', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'github_url',
      githubUrl: 'not-a-url',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('githubUrl');
  });

  it('should accept includePaths and excludePaths', async () => {
    const dto = plainToInstance(SourceConfigDto, {
      type: 'project',
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      includePaths: ['src/**', 'lib/**'],
      excludePaths: ['node_modules/**', 'dist/**'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.includePaths).toEqual(['src/**', 'lib/**']);
    expect(dto.excludePaths).toEqual(['node_modules/**', 'dist/**']);
  });
});

describe('VariableDefinitionDto', () => {
  it('should validate a valid string variable', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'project_name',
      type: 'string',
      displayName: 'Project Name',
      description: 'The name of the project',
      required: true,
      default: 'my-project',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid select variable with options', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'database',
      type: 'select',
      options: ['postgresql', 'mysql', 'sqlite'],
      required: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid boolean variable', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'enable_auth',
      type: 'boolean',
      default: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid number variable with min/max', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'port',
      type: 'number',
      default: 3000,
      min: 1024,
      max: 65535,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid multiselect variable', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'features',
      type: 'multiselect',
      options: ['auth', 'billing', 'analytics'],
      default: ['auth'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid secret variable', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'api_key',
      type: 'secret',
      required: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for empty name', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: '',
      type: 'string',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail for invalid name pattern', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'InvalidName',
      type: 'string',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail for invalid type', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'valid_name',
      type: 'invalid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
  });

  it('should enforce displayName max length', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'test',
      type: 'string',
      displayName: 'a'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('displayName');
  });

  it('should enforce description max length', async () => {
    const dto = plainToInstance(VariableDefinitionDto, {
      name: 'test',
      type: 'string',
      description: 'a'.repeat(501),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('description');
  });
});

describe('TemplatizePatternDto', () => {
  it('should validate a valid templatize pattern', async () => {
    const dto = plainToInstance(TemplatizePatternDto, {
      pattern: 'my-saas-app',
      variable: 'project_name',
      files: ['package.json', 'README.md'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for empty pattern', async () => {
    const dto = plainToInstance(TemplatizePatternDto, {
      pattern: '',
      variable: 'project_name',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pattern');
  });

  it('should fail for empty variable', async () => {
    const dto = plainToInstance(TemplatizePatternDto, {
      pattern: 'my-saas-app',
      variable: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('variable');
  });
});

describe('CreateTemplateFromProjectDto', () => {
  const createValidDto = (): CreateTemplateFromProjectDto => {
    return plainToInstance(CreateTemplateFromProjectDto, {
      source: {
        type: 'project',
        projectId: '123e4567-e89b-12d3-a456-426614174000',
      },
      name: 'my-template',
      displayName: 'My Template',
      description: 'A sample template',
      category: TemplateCategory.WEB_APP,
      variables: [
        {
          name: 'project_name',
          type: 'string',
          required: true,
        },
      ],
      templatizePatterns: [
        {
          pattern: 'my-saas-app',
          variable: 'project_name',
        },
      ],
      postInstall: ['npm install'],
      isDraft: false,
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
    });
  };

  it('should validate a complete valid DTO', async () => {
    const dto = createValidDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for invalid name format', async () => {
    const dto = createValidDto();
    dto.name = 'InvalidName';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail for name with leading hyphen', async () => {
    const dto = createValidDto();
    dto.name = '-invalid-name';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail for name with trailing hyphen', async () => {
    const dto = createValidDto();
    dto.name = 'invalid-name-';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail for empty displayName', async () => {
    const dto = createValidDto();
    dto.displayName = '';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('displayName');
  });

  it('should fail for displayName over max length', async () => {
    const dto = createValidDto();
    dto.displayName = 'a'.repeat(256);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('displayName');
  });

  it('should fail for description over max length', async () => {
    const dto = createValidDto();
    dto.description = 'a'.repeat(201);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('description');
  });

  it('should fail for invalid category', async () => {
    const dto = createValidDto();
    (dto as any).category = 'invalid-category';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('category');
  });

  it('should validate nested source config', async () => {
    const dto = createValidDto();
    dto.source = plainToInstance(SourceConfigDto, {
      type: 'project',
      // Missing projectId
    });
    // Nested validation requires explicit validation
    const sourceErrors = await validate(dto.source);
    expect(sourceErrors.length).toBe(0); // projectId is optional in DTO
  });

  it('should validate nested variables', async () => {
    const dto = createValidDto();
    dto.variables = [
      plainToInstance(VariableDefinitionDto, {
        name: '', // Invalid empty name
        type: 'string',
      }),
    ];
    const errors = await validate(dto);
    // Variables are validated as nested objects
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid tags', async () => {
    const dto = createValidDto();
    dto.tags = ['typescript', 'nextjs', 'saas'];
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid icon', async () => {
    const dto = createValidDto();
    dto.icon = 'layout-dashboard';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept longDescription', async () => {
    const dto = createValidDto();
    dto.longDescription = '# My Template\n\nThis is a detailed description.';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept github_url source', async () => {
    const dto = createValidDto();
    dto.source = plainToInstance(SourceConfigDto, {
      type: 'github_url',
      githubUrl: 'https://github.com/owner/repo',
      branch: 'develop',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept optional workspaceId', async () => {
    const dto = createValidDto();
    dto.workspaceId = undefined;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for invalid workspaceId', async () => {
    const dto = createValidDto();
    dto.workspaceId = 'not-a-uuid';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('workspaceId');
  });
});
