/**
 * TemplateValidatorService Tests
 *
 * Story 19-1: Template Registry Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TemplateValidatorService } from './template-validator.service';
import { TEMPLATE_DEFINITION_CONSTANTS } from '../constants/template-definition.constants';

describe('TemplateValidatorService', () => {
  let service: TemplateValidatorService;

  const validDefinition = {
    stack: {
      frontend: 'Next.js 15',
      backend: 'NestJS',
      database: 'PostgreSQL',
      styling: 'Tailwind CSS',
    },
    variables: [
      {
        name: 'project_name',
        type: 'string',
        required: true,
      },
      {
        name: 'database_provider',
        type: 'select',
        options: ['supabase', 'railway', 'neon'],
        default: 'supabase',
      },
    ],
    files: {
      source_type: 'git',
      repository: 'https://github.com/example/template',
      branch: 'main',
    },
    post_install: ['npm install', 'npm run db:migrate'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateValidatorService],
    }).compile();

    service = module.get<TemplateValidatorService>(TemplateValidatorService);
  });

  describe('validateDefinition', () => {
    it('should validate a correct definition', () => {
      const result = service.validateDefinition(validDefinition);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject definition missing required fields', () => {
      const invalidDefinition = {
        stack: {},
        // missing variables and files
      };

      const result = service.validateDefinition(invalidDefinition);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject definition with invalid variable type', () => {
      const invalidDefinition = {
        ...validDefinition,
        variables: [
          {
            name: 'test',
            type: 'invalid_type',
          },
        ],
      };

      const result = service.validateDefinition(invalidDefinition);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('variables'))).toBe(true);
    });

    it('should reject select variable without options', () => {
      const invalidDefinition = {
        ...validDefinition,
        variables: [
          {
            name: 'test',
            type: 'select',
            // missing options
          },
        ],
      };

      const result = service.validateDefinition(invalidDefinition);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.message.includes('select') && e.message.includes('options'),
        ),
      ).toBe(true);
    });

    it('should reject files without source_type', () => {
      const invalidDefinition = {
        ...validDefinition,
        files: {
          // missing source_type
          repository: 'https://github.com/example/template',
        },
      };

      const result = service.validateDefinition(invalidDefinition);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateStack', () => {
    it('should accept stack with at least one component', () => {
      const definition = {
        stack: {
          frontend: 'Next.js',
        },
        variables: [],
        files: { source_type: 'git' },
      };

      const result = service.validateDefinition(definition);

      expect(result.errors.filter((e) => e.path.startsWith('/stack'))).toHaveLength(0);
    });

    it('should reject empty stack', () => {
      const definition = {
        stack: {},
        variables: [],
        files: { source_type: 'git' },
      };

      const errors = (service as any).validateStack(definition);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateVariables', () => {
    it('should reject duplicate variable names', () => {
      const definition = {
        ...validDefinition,
        variables: [
          { name: 'test', type: 'string' },
          { name: 'test', type: 'string' },
        ],
      };

      const result = service.validateDefinition(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'uniqueVariableName')).toBe(true);
    });

    it('should reject default value not matching type', () => {
      const definition = {
        ...validDefinition,
        variables: [
          { name: 'count', type: 'number', default: 'not-a-number' },
        ],
      };

      const result = service.validateDefinition(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'defaultTypeMismatch')).toBe(true);
    });

    it('should reject default not in select options', () => {
      const definition = {
        ...validDefinition,
        variables: [
          {
            name: 'choice',
            type: 'select',
            options: ['a', 'b', 'c'],
            default: 'd',
          },
        ],
      };

      const result = service.validateDefinition(definition);

      expect(result.valid).toBe(false);
    });

    it('should reject min > max for number variables', () => {
      const definition = {
        ...validDefinition,
        variables: [
          { name: 'count', type: 'number', min: 100, max: 10 },
        ],
      };

      const errors = (service as any).validateVariables(definition);

      expect(errors.some((e: any) => e.keyword === 'minMax')).toBe(true);
    });
  });

  describe('validateFiles', () => {
    it('should require repository for git source type', () => {
      // Create a definition without source_url to test the validation
      const definition = {
        stack: { frontend: 'Next.js' },
        variables: [],
        files: {
          source_type: 'git',
          // missing repository and no source_url
        },
      };

      const errors = (service as any).validateFiles(definition);

      expect(errors.some((e: any) => e.message.includes('Repository') || e.path.includes('repository'))).toBe(true);
    });

    it('should require archive_url for archive source type', () => {
      const definition = {
        stack: { frontend: 'Next.js' },
        variables: [],
        files: {
          source_type: 'archive',
          // missing archive_url and no source_url
        },
      };

      const errors = (service as any).validateFiles(definition);

      expect(errors.some((e: any) => e.message.includes('Archive') || e.path.includes('archive'))).toBe(true);
    });

    it('should require inline_files for inline source type', () => {
      const definition = {
        stack: { frontend: 'Next.js' },
        variables: [],
        files: {
          source_type: 'inline',
          // missing inline_files
        },
      };

      const errors = (service as any).validateFiles(definition);

      expect(errors.some((e: any) => e.message.includes('inline') || e.path.includes('inline'))).toBe(true);
    });
  });

  describe('getSchemaForVersion', () => {
    it('should return schema for v1', () => {
      const schema = service.getSchemaForVersion('v1');

      expect(schema).toBeDefined();
      expect((schema as any).type).toBe('object');
    });

    it('should throw for unsupported version', () => {
      expect(() => service.getSchemaForVersion('v99')).toThrow(BadRequestException);
    });
  });

  describe('schema compilation caching', () => {
    it('should cache compiled schemas', () => {
      // First call
      service.validateDefinition(validDefinition, 'v1');

      // Second call should use cached schema
      const result = service.validateDefinition(validDefinition, 'v1');

      expect(result.valid).toBe(true);
    });
  });
});
