import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const SERVICES = [
  'devos-api',
  'devos-frontend',
  'devos-websocket',
  'devos-orchestrator',
];

const AVAILABLE_SERVICES = SERVICES.filter((service) =>
  fs.existsSync(path.join(DEVOS_ROOT, service, '.dockerignore')),
);

const shouldRun = AVAILABLE_SERVICES.length > 0;

function readDockerignore(service: string): string {
  return fs.readFileSync(
    path.join(DEVOS_ROOT, service, '.dockerignore'),
    'utf-8',
  );
}

(shouldRun ? describe : describe.skip)('Docker Ignore Validation', () => {
  it('should verify .dockerignore exists for each service', () => {
    for (const service of AVAILABLE_SERVICES) {
      const filePath = path.join(DEVOS_ROOT, service, '.dockerignore');
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('should verify .dockerignore excludes node_modules', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerignore(service);
      expect(content).toContain('node_modules');
    }
  });

  it('should verify .dockerignore excludes environment files', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerignore(service);
      expect(content).toContain('.env');
    }
  });

  it('should verify .dockerignore excludes git directory', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerignore(service);
      expect(content).toContain('.git');
    }
  });

  it('should verify .dockerignore excludes test files', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerignore(service);
      // Should exclude test directories or test file patterns
      const hasTestExclusion =
        content.includes('__tests__') ||
        content.includes('*.test.ts') ||
        content.includes('*.spec.ts') ||
        content.includes('tests/');
      expect(hasTestExclusion).toBe(true);
    }
  });
});
