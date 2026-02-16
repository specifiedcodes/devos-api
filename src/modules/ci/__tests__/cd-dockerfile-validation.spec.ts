import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const DEPLOYABLE_REPOS = [
  'devos-api',
  'devos-frontend',
  'devos-orchestrator',
  'devos-websocket',
];

function readDockerfile(repo: string): string {
  const dockerfilePath = path.join(DEVOS_ROOT, repo, 'Dockerfile');
  return fs.readFileSync(dockerfilePath, 'utf-8');
}

function readDockerignore(repo: string): string {
  const dockerignorePath = path.join(DEVOS_ROOT, repo, '.dockerignore');
  return fs.readFileSync(dockerignorePath, 'utf-8');
}

describe('CD Dockerfile Validation', () => {
  describe('devos-api Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readDockerfile('devos-api');
    });

    it('should exist and use multi-stage build', () => {
      const dockerfilePath = path.join(
        DEVOS_ROOT,
        'devos-api',
        'Dockerfile',
      );
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      // Count FROM instructions (at least 3 for deps, builder, production)
      const fromCount = (content.match(/^FROM /gm) || []).length;
      expect(fromCount).toBeGreaterThanOrEqual(3);
    });

    it('should have AS production target', () => {
      expect(content).toContain('AS production');
    });

    it('should use node:20-alpine base image', () => {
      expect(content).toContain('node:20-alpine');
    });

    it('should have USER instruction for non-root execution', () => {
      expect(content).toMatch(/^USER\s+/m);
    });

    it('should have HEALTHCHECK instruction', () => {
      expect(content).toMatch(/^HEALTHCHECK\s+/m);
    });
  });

  describe('devos-frontend Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readDockerfile('devos-frontend');
    });

    it('should exist and use multi-stage build', () => {
      const dockerfilePath = path.join(
        DEVOS_ROOT,
        'devos-frontend',
        'Dockerfile',
      );
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const fromCount = (content.match(/^FROM /gm) || []).length;
      expect(fromCount).toBeGreaterThanOrEqual(3);
    });

    it('should have AS production target', () => {
      expect(content).toContain('AS production');
    });

    it('should use node:20-alpine base image', () => {
      expect(content).toContain('node:20-alpine');
    });

    it('should have NEXT_TELEMETRY_DISABLED env', () => {
      expect(content).toContain('NEXT_TELEMETRY_DISABLED');
    });

    it('should have build ARGs for NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL', () => {
      expect(content).toContain('ARG NEXT_PUBLIC_API_URL');
      expect(content).toContain('ARG NEXT_PUBLIC_WS_URL');
    });

    it('should have USER instruction for non-root execution', () => {
      expect(content).toMatch(/^USER\s+/m);
    });

    it('should have HEALTHCHECK instruction', () => {
      expect(content).toMatch(/^HEALTHCHECK\s+/m);
    });
  });

  describe('devos-orchestrator Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readDockerfile('devos-orchestrator');
    });

    it('should exist and use multi-stage build', () => {
      const dockerfilePath = path.join(
        DEVOS_ROOT,
        'devos-orchestrator',
        'Dockerfile',
      );
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const fromCount = (content.match(/^FROM /gm) || []).length;
      expect(fromCount).toBeGreaterThanOrEqual(3);
    });

    it('should have AS production target', () => {
      expect(content).toContain('AS production');
    });

    it('should use node:20-alpine base image', () => {
      expect(content).toContain('node:20-alpine');
    });

    it('should install git and openssh-client in production stage', () => {
      expect(content).toContain('git');
      expect(content).toContain('openssh-client');
    });

    it('should have USER instruction for non-root execution', () => {
      expect(content).toMatch(/^USER\s+/m);
    });
  });

  describe('devos-websocket Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readDockerfile('devos-websocket');
    });

    it('should exist and use multi-stage build', () => {
      const dockerfilePath = path.join(
        DEVOS_ROOT,
        'devos-websocket',
        'Dockerfile',
      );
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const fromCount = (content.match(/^FROM /gm) || []).length;
      expect(fromCount).toBeGreaterThanOrEqual(3);
    });

    it('should have AS production target', () => {
      expect(content).toContain('AS production');
    });

    it('should use node:20-alpine base image', () => {
      expect(content).toContain('node:20-alpine');
    });

    it('should have USER instruction for non-root execution', () => {
      expect(content).toMatch(/^USER\s+/m);
    });

    it('should have HEALTHCHECK instruction', () => {
      expect(content).toMatch(/^HEALTHCHECK\s+/m);
    });
  });

  describe('All Dockerfiles use non-root user', () => {
    it('should have USER instruction in each Dockerfile', () => {
      for (const repo of DEPLOYABLE_REPOS) {
        const content = readDockerfile(repo);
        expect(content).toMatch(/^USER\s+/m);
      }
    });
  });

  describe('All deployable repos have .dockerignore', () => {
    it('should have .dockerignore excluding node_modules, .git, .env, coverage', () => {
      for (const repo of DEPLOYABLE_REPOS) {
        const dockerignorePath = path.join(
          DEVOS_ROOT,
          repo,
          '.dockerignore',
        );
        expect(fs.existsSync(dockerignorePath)).toBe(true);

        const content = readDockerignore(repo);
        expect(content).toContain('node_modules');
        expect(content).toContain('.git');
        expect(content).toContain('.env');
        expect(content).toContain('coverage');
      }
    });
  });
});
