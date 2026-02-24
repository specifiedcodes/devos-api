/**
 * TemplateEngineService Unit Tests
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * Tests for template syntax processing including variable substitution,
 * conditionals, iterations, transformations, and helper functions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplateEngineService } from './template-engine.service';

describe('TemplateEngineService', () => {
  let service: TemplateEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateEngineService],
    }).compile();

    service = module.get<TemplateEngineService>(TemplateEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== Variable Substitution Tests ====================
  describe('render - variable substitution', () => {
    it('should replace simple variables', () => {
      const template = 'const appName = "{{project_name}}";';
      const result = service.render(template, { project_name: 'MyApp' });
      expect(result).toBe('const appName = "MyApp";');
    });

    it('should replace multiple variables', () => {
      const template = '{{greeting}}, {{name}}! Welcome to {{project}}.';
      const result = service.render(template, {
        greeting: 'Hello',
        name: 'World',
        project: 'DevOS',
      });
      expect(result).toBe('Hello, World! Welcome to DevOS.');
    });

    it('should handle nested object access', () => {
      const template = 'const dbHost = "{{database.host}}"; const dbPort = {{database.port}};';
      const result = service.render(template, {
        database: { host: 'localhost', port: 5432 },
      });
      expect(result).toBe('const dbHost = "localhost"; const dbPort = 5432;');
    });

    it('should handle deeply nested objects', () => {
      const template = '{{config.server.database.credentials.username}}';
      const result = service.render(template, {
        config: {
          server: {
            database: {
              credentials: {
                username: 'admin',
              },
            },
          },
        },
      });
      expect(result).toBe('admin');
    });

    it('should handle missing variables by leaving them as-is', () => {
      const template = 'Value: {{missing_var}}';
      const result = service.render(template, {});
      expect(result).toBe('Value: {{missing_var}}');
    });

    it('should handle undefined values', () => {
      const template = 'Value: {{value}}';
      const result = service.render(template, { value: undefined });
      expect(result).toBe('Value: {{value}}');
    });

    it('should handle null values', () => {
      const template = 'Value: {{value}}';
      const result = service.render(template, { value: null });
      expect(result).toBe('Value: ');
    });

    it('should handle numeric values', () => {
      const template = 'const port = {{port}};';
      const result = service.render(template, { port: 3000 });
      expect(result).toBe('const port = 3000;');
    });

    it('should handle boolean values', () => {
      const template = 'const enabled = {{enabled}};';
      const result = service.render(template, { enabled: true });
      expect(result).toBe('const enabled = true;');
    });
  });

  // ==================== Default Values Tests ====================
  describe('render - default values', () => {
    it('should apply default value when variable is missing', () => {
      const template = 'const timeout = "{{timeout|default:30000}}";';
      const result = service.render(template, {});
      expect(result).toBe('const timeout = "30000";');
    });

    it('should use actual value when variable is provided', () => {
      const template = 'const timeout = "{{timeout|default:30000}}";';
      const result = service.render(template, { timeout: '60000' });
      expect(result).toBe('const timeout = "60000";');
    });

    it('should handle default with empty string', () => {
      const template = 'const name = "{{name|default:Untitled}}";';
      const result = service.render(template, { name: '' });
      expect(result).toBe('const name = "Untitled";');
    });

    it('should handle default with spaces in value', () => {
      const template = 'const title = "{{title|default:Hello World}}";';
      const result = service.render(template, {});
      expect(result).toBe('const title = "Hello World";');
    });
  });

  // ==================== String Transformations Tests ====================
  describe('render - string transformations', () => {
    it('should apply pascalCase transformation', () => {
      const template = 'const className = "{{model_name|pascalCase}}";';
      const result = service.render(template, { model_name: 'user-profile' });
      expect(result).toBe('const className = "UserProfile";');
    });

    it('should apply camelCase transformation', () => {
      const template = 'const varName = "{{model_name|camelCase}}";';
      const result = service.render(template, { model_name: 'user-profile' });
      expect(result).toBe('const varName = "userProfile";');
    });

    it('should apply kebabCase transformation', () => {
      const template = 'const kebabName = "{{model_name|kebabCase}}";';
      const result = service.render(template, { model_name: 'UserProfile' });
      expect(result).toBe('const kebabName = "user-profile";');
    });

    it('should apply snakeCase transformation', () => {
      const template = 'const snakeName = "{{model_name|snakeCase}}";';
      const result = service.render(template, { model_name: 'user-profile' });
      expect(result).toBe('const snakeName = "user_profile";');
    });

    it('should apply upperCase transformation', () => {
      const template = 'const upper = "{{name|upperCase}}";';
      const result = service.render(template, { name: 'hello' });
      expect(result).toBe('const upper = "HELLO";');
    });

    it('should apply lowerCase transformation', () => {
      const template = 'const lower = "{{name|lowerCase}}";';
      const result = service.render(template, { name: 'HELLO' });
      expect(result).toBe('const lower = "hello";');
    });

    it('should apply capitalize transformation', () => {
      const template = 'const cap = "{{name|capitalize}}";';
      const result = service.render(template, { name: 'hello world' });
      expect(result).toBe('const cap = "Hello world";');
    });

    it('should chain transformation with default', () => {
      const template = 'const name = "{{name|default:my-model|pascalCase}}";';
      const result = service.render(template, {});
      expect(result).toBe('const name = "MyModel";');
    });
  });

  // ==================== Conditional Blocks Tests ====================
  describe('render - conditionals', () => {
    it('should render content when {{#if}} is truthy', () => {
      const template = '{{#if include_stripe}}import Stripe from "stripe";{{/if}}';
      const result = service.render(template, { include_stripe: true });
      expect(result).toBe('import Stripe from "stripe";');
    });

    it('should remove content when {{#if}} is falsy', () => {
      const template = '{{#if include_stripe}}import Stripe from "stripe";{{/if}}';
      const result = service.render(template, { include_stripe: false });
      expect(result).toBe('');
    });

    it('should remove content when {{#if}} variable is missing', () => {
      const template = '{{#if include_stripe}}import Stripe from "stripe";{{/if}}';
      const result = service.render(template, {});
      expect(result).toBe('');
    });

    it('should handle {{#if}} with string value', () => {
      const template = '{{#if auth_strategy}}// Auth for {{auth_strategy}}{{/if}}';
      const result = service.render(template, { auth_strategy: 'jwt' });
      expect(result).toBe('// Auth for jwt');
    });

    it('should handle {{#if}} with empty string (falsy)', () => {
      const template = '{{#if value}}content{{/if}}';
      const result = service.render(template, { value: '' });
      expect(result).toBe('');
    });

    it('should handle {{#if}} with array (truthy when non-empty)', () => {
      const template = '{{#if items}}has items{{/if}}';
      const result = service.render(template, { items: [1, 2, 3] });
      expect(result).toBe('has items');
    });

    it('should handle {{#if}} with empty array (falsy)', () => {
      const template = '{{#if items}}has items{{/if}}';
      const result = service.render(template, { items: [] });
      expect(result).toBe('');
    });

    it('should handle {{#unless}} (inverse of if)', () => {
      const template = '{{#unless skip_tests}}import { test } from "vitest";{{/unless}}';
      const result = service.render(template, { skip_tests: false });
      expect(result).toBe('import { test } from "vitest";');
    });

    it('should remove content when {{#unless}} is truthy', () => {
      const template = '{{#unless skip_tests}}import { test } from "vitest";{{/unless}}';
      const result = service.render(template, { skip_tests: true });
      expect(result).toBe('');
    });

    it('should handle {{#if}} with {{else}} block', () => {
      const template = '{{#if enabled}}enabled{{else}}disabled{{/if}}';
      const resultTruthy = service.render(template, { enabled: true });
      expect(resultTruthy).toBe('enabled');

      const resultFalsy = service.render(template, { enabled: false });
      expect(resultFalsy).toBe('disabled');
    });

    it('should handle nested conditionals', () => {
      const template = '{{#if a}}A{{#if b}}B{{/if}}{{/if}}';
      const result = service.render(template, { a: true, b: true });
      expect(result).toBe('AB');
    });
  });

  // ==================== Iteration Tests ====================
  describe('render - iterations', () => {
    it('should iterate over arrays with {{#each}}', () => {
      const template = '{{#each features}}Feature: {{this}}\n{{/each}}';
      const result = service.render(template, { features: ['auth', 'logging', 'cache'] });
      expect(result).toBe('Feature: auth\nFeature: logging\nFeature: cache\n');
    });

    it('should handle empty arrays', () => {
      const template = '{{#each items}}Item: {{this}}{{/each}}';
      const result = service.render(template, { items: [] });
      expect(result).toBe('');
    });

    it('should handle missing arrays', () => {
      const template = '{{#each items}}Item: {{this}}{{/each}}';
      const result = service.render(template, {});
      expect(result).toBe('');
    });

    it('should access {{this}} in iteration', () => {
      const template = '{{#each names}}Hello {{this}}! {{/each}}';
      const result = service.render(template, { names: ['Alice', 'Bob'] });
      expect(result).toBe('Hello Alice! Hello Bob! ');
    });

    it('should handle {{@index}} in iteration', () => {
      const template = '{{#each items}}{{@index}}: {{this}} {{/each}}';
      const result = service.render(template, { items: ['a', 'b', 'c'] });
      expect(result).toBe('0: a 1: b 2: c ');
    });

    it('should handle nested properties in iteration', () => {
      const template = '{{#each users}}{{name}}: {{email}}\n{{/each}}';
      const result = service.render(template, {
        users: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
      });
      expect(result).toBe('Alice: alice@example.com\nBob: bob@example.com\n');
    });
  });

  // ==================== Binary Files Tests ====================
  describe('shouldSkipFile', () => {
    it('should return false for text content', () => {
      expect(service.shouldSkipFile('console.log("hello");', {})).toBe(false);
    });

    it('should return true for binary content starting with null bytes', () => {
      const binaryContent = '\x00\x00\x00\x00PNG';
      expect(service.shouldSkipFile(binaryContent, {})).toBe(true);
    });

    it('should return false for JSON content', () => {
      const jsonContent = '{"name": "test"}';
      expect(service.shouldSkipFile(jsonContent, {})).toBe(false);
    });

    it('should return false for HTML content', () => {
      const htmlContent = '<!DOCTYPE html><html></html>';
      expect(service.shouldSkipFile(htmlContent, {})).toBe(false);
    });
  });

  // ==================== Extract Variables Tests ====================
  describe('extractVariables', () => {
    it('should extract simple variables', () => {
      const template = '{{name}} and {{age}}';
      const result = service.extractVariables(template);
      expect(result).toEqual(expect.arrayContaining(['name', 'age']));
    });

    it('should extract nested variables', () => {
      const template = '{{db.host}} and {{db.port}}';
      const result = service.extractVariables(template);
      expect(result).toEqual(expect.arrayContaining(['db.host', 'db.port']));
    });

    it('should extract variables with transformations', () => {
      const template = '{{name|pascalCase}} and {{title|default:Untitled}}';
      const result = service.extractVariables(template);
      expect(result).toEqual(expect.arrayContaining(['name', 'title']));
    });

    it('should not extract variables from conditionals', () => {
      const template = '{{#if show}}content{{/if}}';
      const result = service.extractVariables(template);
      expect(result).not.toContain('if');
    });

    it('should deduplicate variables', () => {
      const template = '{{name}} and {{name}} again';
      const result = service.extractVariables(template);
      expect(result.filter((v) => v === 'name')).toHaveLength(1);
    });
  });

  // ==================== Custom Helpers Tests ====================
  describe('registerHelper', () => {
    it('should register and use custom helper', () => {
      service.registerHelper('reverse', (value: unknown) =>
        String(value).split('').reverse().join(''),
      );

      const template = '{{name|reverse}}';
      const result = service.render(template, { name: 'hello' });
      expect(result).toBe('olleh');
    });

    it('should override built-in helper', () => {
      service.registerHelper('upperCase', () => 'CUSTOM');

      const template = '{{name|upperCase}}';
      const result = service.render(template, { name: 'hello' });
      expect(result).toBe('CUSTOM');
    });
  });

  // ==================== Render File Tests ====================
  describe('renderFile', () => {
    it('should process file content and return processed file', () => {
      const sourceFile = {
        path: 'src/config.ts',
        content: 'const appName = "{{project_name}}";',
      };

      const result = service.renderFile(sourceFile, { project_name: 'MyApp' });

      expect(result.path).toBe('src/config.ts');
      expect(result.content).toBe('const appName = "MyApp";');
    });

    it('should rename file if path contains variables', () => {
      const sourceFile = {
        path: 'src/{{model_name}}.ts',
        content: '// Model file',
      };

      const result = service.renderFile(sourceFile, { model_name: 'user' });

      expect(result.path).toBe('src/user.ts');
    });

    it('should apply transformations in filename', () => {
      const sourceFile = {
        path: 'src/components/{{name|pascalCase}}.tsx',
        content: '// Component',
      };

      const result = service.renderFile(sourceFile, { name: 'user-profile' });

      expect(result.path).toBe('src/components/UserProfile.tsx');
    });
  });

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle empty template', () => {
      expect(service.render('', {})).toBe('');
    });

    it('should handle template with no variables', () => {
      const template = 'const x = 1;';
      expect(service.render(template, {})).toBe('const x = 1;');
    });

    it('should handle special characters in variable values', () => {
      const template = 'const str = "{{value}}";';
      const result = service.render(template, { value: 'hello "world"' });
      expect(result).toBe('const str = "hello \\"world\\"";');
    });

    it('should handle newlines in content', () => {
      const template = 'line1\n{{value}}\nline3';
      const result = service.render(template, { value: 'line2' });
      expect(result).toBe('line1\nline2\nline3');
    });

    it('should handle Windows-style newlines', () => {
      const template = 'line1\r\n{{value}}\r\nline3';
      const result = service.render(template, { value: 'line2' });
      expect(result).toBe('line1\r\nline2\r\nline3');
    });

    it('should handle very long variable values', () => {
      const longValue = 'x'.repeat(10000);
      const template = '{{value}}';
      const result = service.render(template, { value: longValue });
      expect(result).toBe(longValue);
    });

    it('should handle unicode in variable values', () => {
      const template = 'const msg = "{{value}}";';
      const result = service.render(template, { value: 'Hello 你好 🌍' });
      expect(result).toBe('const msg = "Hello 你好 🌍";');
    });
  });

  // ==================== Complex Templates Tests ====================
  describe('complex templates', () => {
    it('should handle real-world config template', () => {
      const template = `
{
  "name": "{{project_name}}",
  "version": "{{version|default:1.0.0}}",
  {{#if description}}
  "description": "{{description}}",
  {{/if}}
  "scripts": {
    {{#each scripts}}
    "{{@key}}": "{{this}}",
    {{/each}}
  }
}`;
      const result = service.render(template, {
        project_name: 'my-app',
        version: '2.0.0',
        description: 'My awesome app',
        scripts: {
          start: 'node index.js',
          test: 'jest',
        },
      });

      expect(result).toContain('"name": "my-app"');
      expect(result).toContain('"version": "2.0.0"');
      expect(result).toContain('"description": "My awesome app"');
    });

    it('should handle TypeScript interface template', () => {
      const template = `
export interface {{model_name|pascalCase}} {
  {{#each fields}}
  {{name}}: {{type}};
  {{/each}}
}`;

      const result = service.render(template, {
        model_name: 'user-profile',
        fields: [
          { name: 'id', type: 'string' },
          { name: 'email', type: 'string' },
          { name: 'age', type: 'number' },
        ],
      });

      expect(result).toContain('export interface UserProfile');
      expect(result).toContain('id: string');
      expect(result).toContain('email: string');
      expect(result).toContain('age: number');
    });
  });
});
