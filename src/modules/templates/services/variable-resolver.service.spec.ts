/**
 * VariableResolverService Unit Tests
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * Tests for variable validation and resolution against template definitions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { VariableResolverService, VariableDefinition, ValidationResult } from './variable-resolver.service';

describe('VariableResolverService', () => {
  let service: VariableResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VariableResolverService],
    }).compile();

    service = module.get<VariableResolverService>(VariableResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== String Type Validation Tests ====================
  describe('validate - string type', () => {
    it('should pass for valid string value', () => {
      const definitions: VariableDefinition[] = [
        { name: 'project_name', type: 'string', required: true },
      ];
      const values = { project_name: 'my-app' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for missing required string', () => {
      const definitions: VariableDefinition[] = [
        { name: 'project_name', type: 'string', required: true },
      ];
      const values = {};

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'project_name', message: expect.stringContaining('required') }),
      );
    });

    it('should pass for missing optional string', () => {
      const definitions: VariableDefinition[] = [
        { name: 'description', type: 'string', required: false },
      ];
      const values = {};

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should validate string with regex pattern', () => {
      const definitions: VariableDefinition[] = [
        { name: 'project_name', type: 'string', validation: '^[a-z][a-z0-9-]*$' },
      ];

      const validResult = service.validate(definitions, { project_name: 'my-app' });
      expect(validResult.valid).toBe(true);

      const invalidResult = service.validate(definitions, { project_name: 'My App!' });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].message).toContain('pattern');
    });
  });

  // ==================== Select Type Validation Tests ====================
  describe('validate - select type', () => {
    it('should pass for valid select option', () => {
      const definitions: VariableDefinition[] = [
        { name: 'database', type: 'select', options: ['postgres', 'mysql', 'mongodb'] },
      ];
      const values = { database: 'postgres' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should fail for invalid select option', () => {
      const definitions: VariableDefinition[] = [
        { name: 'database', type: 'select', options: ['postgres', 'mysql', 'mongodb'] },
      ];
      const values = { database: 'oracle' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('one of');
    });

    it('should be case-sensitive for select options', () => {
      const definitions: VariableDefinition[] = [
        { name: 'framework', type: 'select', options: ['React', 'Vue'] },
      ];
      const values = { framework: 'react' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
    });
  });

  // ==================== Boolean Type Validation Tests ====================
  describe('validate - boolean type', () => {
    it('should pass for true boolean', () => {
      const definitions: VariableDefinition[] = [
        { name: 'include_tests', type: 'boolean' },
      ];
      const values = { include_tests: true };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should pass for false boolean', () => {
      const definitions: VariableDefinition[] = [
        { name: 'include_tests', type: 'boolean' },
      ];
      const values = { include_tests: false };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should fail for non-boolean value', () => {
      const definitions: VariableDefinition[] = [
        { name: 'include_tests', type: 'boolean' },
      ];
      const values = { include_tests: 'yes' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('boolean');
    });
  });

  // ==================== Number Type Validation Tests ====================
  describe('validate - number type', () => {
    it('should pass for valid number', () => {
      const definitions: VariableDefinition[] = [
        { name: 'port', type: 'number' },
      ];
      const values = { port: 3000 };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should fail for non-number value', () => {
      const definitions: VariableDefinition[] = [
        { name: 'port', type: 'number' },
      ];
      const values = { port: 'three thousand' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('number');
    });

    it('should enforce min constraint', () => {
      const definitions: VariableDefinition[] = [
        { name: 'port', type: 'number', min: 1024 },
      ];
      const values = { port: 80 };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at least 1024');
    });

    it('should enforce max constraint', () => {
      const definitions: VariableDefinition[] = [
        { name: 'port', type: 'number', max: 65535 },
      ];
      const values = { port: 70000 };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at most 65535');
    });

    it('should pass for number within bounds', () => {
      const definitions: VariableDefinition[] = [
        { name: 'port', type: 'number', min: 1024, max: 65535 },
      ];
      const values = { port: 3000 };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should handle zero correctly', () => {
      const definitions: VariableDefinition[] = [
        { name: 'offset', type: 'number', min: 0 },
      ];
      const values = { offset: 0 };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });
  });

  // ==================== Multiselect Type Validation Tests ====================
  describe('validate - multiselect type', () => {
    it('should pass for valid multiselect array', () => {
      const definitions: VariableDefinition[] = [
        {
          name: 'features',
          type: 'multiselect',
          options: ['auth', 'logging', 'cache', 'queue'],
        },
      ];
      const values = { features: ['auth', 'logging'] };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should pass for empty array', () => {
      const definitions: VariableDefinition[] = [
        { name: 'features', type: 'multiselect', options: ['auth', 'logging'] },
      ];
      const values = { features: [] };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should fail for non-array value', () => {
      const definitions: VariableDefinition[] = [
        { name: 'features', type: 'multiselect', options: ['auth', 'logging'] },
      ];
      const values = { features: 'auth' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('array');
    });

    it('should fail for invalid option in array', () => {
      const definitions: VariableDefinition[] = [
        { name: 'features', type: 'multiselect', options: ['auth', 'logging'] },
      ];
      const values = { features: ['auth', 'invalid'] };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('invalid');
    });
  });

  // ==================== Secret Type Validation Tests ====================
  describe('validate - secret type', () => {
    it('should pass for valid secret value', () => {
      const definitions: VariableDefinition[] = [
        { name: 'api_key', type: 'secret', required: true },
      ];
      const values = { api_key: 'sk-123456' };

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });

    it('should fail for missing required secret', () => {
      const definitions: VariableDefinition[] = [
        { name: 'api_key', type: 'secret', required: true },
      ];
      const values = {};

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(false);
    });

    it('should pass for optional missing secret', () => {
      const definitions: VariableDefinition[] = [
        { name: 'api_key', type: 'secret', required: false },
      ];
      const values = {};

      const result = service.validate(definitions, values);

      expect(result.valid).toBe(true);
    });
  });

  // ==================== Resolve Tests ====================
  describe('resolve', () => {
    it('should apply default values for missing optional variables', () => {
      const definitions: VariableDefinition[] = [
        { name: 'name', type: 'string', default: 'Untitled' },
        { name: 'port', type: 'number', default: 3000 },
      ];
      const values = {};

      const result = service.resolve(definitions, values);

      expect(result.name).toBe('Untitled');
      expect(result.port).toBe(3000);
    });

    it('should not override user-provided values with defaults', () => {
      const definitions: VariableDefinition[] = [
        { name: 'name', type: 'string', default: 'Untitled' },
      ];
      const values = { name: 'MyApp' };

      const result = service.resolve(definitions, values);

      expect(result.name).toBe('MyApp');
    });

    it('should preserve values without defaults', () => {
      const definitions: VariableDefinition[] = [
        { name: 'name', type: 'string' },
      ];
      const values = { name: 'MyApp' };

      const result = service.resolve(definitions, values);

      expect(result.name).toBe('MyApp');
    });

    it('should handle mixed defaults and provided values', () => {
      const definitions: VariableDefinition[] = [
        { name: 'project_name', type: 'string', required: true },
        { name: 'port', type: 'number', default: 3000 },
        { name: 'debug', type: 'boolean', default: false },
      ];
      const values = { project_name: 'my-app' };

      const result = service.resolve(definitions, values);

      expect(result.project_name).toBe('my-app');
      expect(result.port).toBe(3000);
      expect(result.debug).toBe(false);
    });

    it('should handle array defaults', () => {
      const definitions: VariableDefinition[] = [
        { name: 'features', type: 'multiselect', default: ['auth'] },
      ];
      const values = {};

      const result = service.resolve(definitions, values);

      expect(result.features).toEqual(['auth']);
    });
  });

  // ==================== ShouldShow Tests ====================
  describe('shouldShow', () => {
    it('should return true when no dependency', () => {
      const definition: VariableDefinition = {
        name: 'feature',
        type: 'string',
      };
      const currentValues = {};

      const result = service.shouldShow(definition, currentValues);

      expect(result).toBe(true);
    });

    it('should return true when dependency is satisfied', () => {
      const definition: VariableDefinition = {
        name: 'database_url',
        type: 'string',
        dependsOn: 'use_database',
      };
      const currentValues = { use_database: true };

      const result = service.shouldShow(definition, currentValues);

      expect(result).toBe(true);
    });

    it('should return false when dependency is not satisfied', () => {
      const definition: VariableDefinition = {
        name: 'database_url',
        type: 'string',
        dependsOn: 'use_database',
      };
      const currentValues = { use_database: false };

      const result = service.shouldShow(definition, currentValues);

      expect(result).toBe(false);
    });

    it('should return false when dependency value is missing', () => {
      const definition: VariableDefinition = {
        name: 'database_url',
        type: 'string',
        dependsOn: 'use_database',
      };
      const currentValues = {};

      const result = service.shouldShow(definition, currentValues);

      expect(result).toBe(false);
    });

    it('should treat truthy string as satisfied', () => {
      const definition: VariableDefinition = {
        name: 'stripe_key',
        type: 'secret',
        dependsOn: 'payment_provider',
      };
      const currentValues = { payment_provider: 'stripe' };

      const result = service.shouldShow(definition, currentValues);

      expect(result).toBe(true);
    });
  });

  // ==================== ToTemplateValue Tests ====================
  describe('toTemplateValue', () => {
    it('should convert string value correctly', () => {
      const definition: VariableDefinition = { name: 'name', type: 'string' };
      const result = service.toTemplateValue(definition, 'my-app');
      expect(result).toBe('my-app');
    });

    it('should convert number value correctly', () => {
      const definition: VariableDefinition = { name: 'port', type: 'number' };
      const result = service.toTemplateValue(definition, 3000);
      expect(result).toBe(3000);
    });

    it('should convert boolean true correctly', () => {
      const definition: VariableDefinition = { name: 'enabled', type: 'boolean' };
      const result = service.toTemplateValue(definition, true);
      expect(result).toBe(true);
    });

    it('should convert boolean false correctly', () => {
      const definition: VariableDefinition = { name: 'enabled', type: 'boolean' };
      const result = service.toTemplateValue(definition, false);
      expect(result).toBe(false);
    });

    it('should convert multiselect to array', () => {
      const definition: VariableDefinition = { name: 'features', type: 'multiselect' };
      const result = service.toTemplateValue(definition, ['auth', 'logging']);
      expect(result).toEqual(['auth', 'logging']);
    });

    it('should handle null value', () => {
      const definition: VariableDefinition = { name: 'name', type: 'string' };
      const result = service.toTemplateValue(definition, null);
      expect(result).toBe('');
    });

    it('should handle undefined value', () => {
      const definition: VariableDefinition = { name: 'name', type: 'string' };
      const result = service.toTemplateValue(definition, undefined);
      expect(result).toBe('');
    });
  });

  // ==================== Integration Tests ====================
  describe('integration - full validation and resolution', () => {
    it('should validate and resolve a complete template configuration', () => {
      const definitions: VariableDefinition[] = [
        { name: 'project_name', type: 'string', required: true, validation: '^[a-z][a-z0-9-]*$' },
        { name: 'database', type: 'select', options: ['postgres', 'mysql'], default: 'postgres' },
        { name: 'port', type: 'number', default: 3000, min: 1024, max: 65535 },
        { name: 'include_auth', type: 'boolean', default: true },
        { name: 'features', type: 'multiselect', options: ['logging', 'cache'], default: [] },
        { name: 'api_key', type: 'secret', required: false },
      ];

      const values = {
        project_name: 'my-awesome-app',
        port: 8080,
        features: ['logging'],
      };

      // Validate
      const validationResult = service.validate(definitions, values);
      expect(validationResult.valid).toBe(true);

      // Resolve
      const resolved = service.resolve(definitions, values);
      expect(resolved.project_name).toBe('my-awesome-app');
      expect(resolved.database).toBe('postgres');
      expect(resolved.port).toBe(8080);
      expect(resolved.include_auth).toBe(true);
      expect(resolved.features).toEqual(['logging']);
      expect(resolved.api_key).toBeUndefined();
    });
  });
});
