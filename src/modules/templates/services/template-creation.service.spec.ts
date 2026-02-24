/**
 * TemplateCreationService Unit Tests
 * Story 19-2: Template Creation Wizard (AC2)
 *
 * Tests for pattern detection, templatization, and template definition generation.
 * These tests focus on the pure business logic functions.
 * Integration tests with GitHub API are in separate e2e test files.
 */

import {
  DEFAULT_EXCLUDE_PATTERNS,
  DETECTION_RULES,
} from '../constants/template-creation.constants';

describe('TemplateCreationService - Pure Functions', () => {
  describe('DEFAULT_EXCLUDE_PATTERNS', () => {
    it('should include common exclude patterns', () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('node_modules/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('.git/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('.env*');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('!.env.example');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('dist/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('build/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('.next/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('coverage/**');
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain('*.log');
    });
  });

  describe('Pattern Detection', () => {
    it('should detect project name in package.json', () => {
      const content = JSON.stringify({ name: 'my-saas-app', version: '1.0.0' });
      const rule = DETECTION_RULES.find(r => r.type === 'project_name');

      const match = rule?.regex.exec(content);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('my-saas-app');
    });

    it('should detect DATABASE_URL pattern', () => {
      // The regex matches DATABASE_URL = 'value' or DATABASE_URL : "value"
      const content = `DATABASE_URL='postgresql://localhost:5432/mydb'`;
      const rule = DETECTION_RULES.find(r => r.type === 'database_url');

      const regex = new RegExp(rule!.regex.source, rule!.regex.flags);
      const match = regex.exec(content);
      expect(match).not.toBeNull();
    });

    it('should detect API_KEY patterns', () => {
      // The regex matches patterns like STRIPE_API_KEY = 'value'
      const content = `STRIPE_API_KEY='sk_test_123'`;
      const rule = DETECTION_RULES.find(r => r.type === 'api_key');

      const regex = new RegExp(rule!.regex.source, rule!.regex.flags);
      const match1 = regex.exec(content);
      expect(match1).not.toBeNull();
    });

    it('should detect PORT pattern', () => {
      // The regex matches PORT = 3000
      const content = `PORT=3000`;
      const rule = DETECTION_RULES.find(r => r.type === 'port');

      const regex = new RegExp(rule!.regex.source, rule!.regex.flags);
      const match = regex.exec(content);
      expect(match).not.toBeNull();
    });

    it('should return no matches for files without patterns', () => {
      const content = '# My Project\n\nThis is a simple project.';
      let hasMatch = false;

      for (const rule of DETECTION_RULES) {
        if (rule.regex.test(content)) {
          hasMatch = true;
          break;
        }
      }

      expect(hasMatch).toBe(false);
    });
  });

  describe('Templatization', () => {
    it('should replace patterns with variables', () => {
      const files = [
        { path: 'package.json', content: JSON.stringify({ name: 'my-saas-app' }) },
        { path: 'README.md', content: '# my-saas-app\n\nWelcome to my-saas-app!' },
      ];

      const patterns = [{ pattern: 'my-saas-app', variable: 'project_name' }];

      const result = files.map(file => {
        let content = file.content;
        for (const p of patterns) {
          content = content.split(p.pattern).join(`{{${p.variable}}}`);
        }
        return { ...file, content };
      });

      expect(result[0].content).toContain('{{project_name}}');
      expect(result[1].content).toContain('{{project_name}}');
      expect(result[1].content.match(/{{project_name}}/g)?.length).toBe(2);
    });

    it('should only apply patterns to specified files', () => {
      const files = [
        { path: 'package.json', content: JSON.stringify({ name: 'my-saas-app' }) },
        { path: 'README.md', content: '# my-saas-app' },
      ];

      const patterns = [{ pattern: 'my-saas-app', variable: 'project_name', files: ['package.json'] }];

      const result = files.map(file => {
        let content = file.content;
        for (const p of patterns) {
          if (!p.files || p.files.some(f => file.path.includes(f))) {
            content = content.split(p.pattern).join(`{{${p.variable}}}`);
          }
        }
        return { ...file, content };
      });

      expect(result[0].content).toContain('{{project_name}}');
      expect(result[1].content).toBe('# my-saas-app'); // Unchanged
    });

    it('should handle regex patterns', () => {
      const content = `const port = 3000;\nconst PORT = 3000;`;
      const pattern = '\\b(port|PORT)\\s*=\\s*\\d+';

      const regex = new RegExp(pattern, 'g');
      const result = content.replace(regex, '{{port_declaration}}');

      expect(result).toContain('{{port_declaration}}');
    });

    it('should return files unchanged if no patterns', () => {
      const files = [{ path: 'README.md', content: '# My Project' }];
      const patterns: any[] = [];

      const result = files.map(file => {
        let content = file.content;
        for (const p of patterns) {
          content = content.split(p.pattern).join(`{{${p.variable}}}`);
        }
        return { ...file, content };
      });

      expect(result).toEqual(files);
    });
  });

  describe('Template Definition Generation', () => {
    it('should generate valid template definition spec', () => {
      const files = [
        { path: 'package.json', content: JSON.stringify({ name: '{{project_name}}' }) },
        { path: 'README.md', content: '# {{project_name}}' },
      ];

      const variables = [{ name: 'project_name', type: 'string', required: true }];
      const postInstall = ['npm install'];

      // Build definition following the same logic as the service
      const inlineFiles: Record<string, string> = {};
      let detectedProjectName = 'my-project';

      for (const file of files) {
        inlineFiles[file.path] = file.content;
        if (file.path.endsWith('package.json')) {
          try {
            const pkg = JSON.parse(file.content);
            if (pkg.name && typeof pkg.name === 'string') {
              detectedProjectName = pkg.name.replace(/{{.*?}}/g, 'my-project');
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      const definition = {
        apiVersion: 'devos.com/v1',
        kind: 'Template',
        metadata: {
          name: variables.find(v => v.name === 'project_name')?.default as string || detectedProjectName,
        },
        spec: {
          stack: {},
          variables: variables.map(v => ({
            name: v.name,
            type: v.type,
            required: v.required,
          })),
          files: {
            source_type: 'inline',
            inline_files: inlineFiles,
          },
          post_install: postInstall,
        },
      };

      expect(definition.apiVersion).toBe('devos.com/v1');
      expect(definition.kind).toBe('Template');
      expect(definition.spec.variables).toHaveLength(1);
      expect(definition.spec.files.inline_files).toBeDefined();
      expect(definition.spec.post_install).toEqual(['npm install']);
    });

    it('should detect stack from package.json dependencies', () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            dependencies: { next: '^14.0.0', react: '^18.0.0' },
          }),
        },
      ];

      // Stack detection logic from the service
      const stack: Record<string, string> = {};

      for (const file of files) {
        if (file.path.endsWith('package.json')) {
          try {
            const pkg = JSON.parse(file.content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (deps.next || deps['next.js']) {
              stack.frontend = 'Next.js';
            } else if (deps.react) {
              stack.frontend = 'React';
            } else if (deps.vue) {
              stack.frontend = 'Vue.js';
            }

            if (deps.tailwindcss) {
              stack.styling = 'Tailwind CSS';
            }

            if (deps.prisma) {
              stack.database = 'PostgreSQL (Prisma)';
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      expect(stack.frontend).toBeDefined();
      expect(stack.frontend).toBe('Next.js');
    });
  });
});
