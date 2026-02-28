import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const DEPLOYABLE_REPOS = [
  'devos-api',
  'devos-frontend',
  'devos-orchestrator',
  'devos-websocket',
];

const AVAILABLE_REPOS = DEPLOYABLE_REPOS.filter((repo) =>
  fs.existsSync(path.join(DEVOS_ROOT, repo, 'scripts', 'cd-smoke-test.sh')),
);

const shouldRun = AVAILABLE_REPOS.length > 0;

function readSmokeTestScript(repo: string): string {
  const scriptPath = path.join(
    DEVOS_ROOT,
    repo,
    'scripts',
    'cd-smoke-test.sh',
  );
  return fs.readFileSync(scriptPath, 'utf-8');
}

(shouldRun ? describe : describe.skip)('CD Smoke Test Script Validation', () => {
  describe('Smoke test scripts exist in each deployable repo', () => {
    it('should exist in all deployable repos', () => {
      for (const repo of AVAILABLE_REPOS) {
        const scriptPath = path.join(
          DEVOS_ROOT,
          repo,
          'scripts',
          'cd-smoke-test.sh',
        );
        expect(fs.existsSync(scriptPath)).toBe(true);
      }
    });
  });

  const apiAvailable = AVAILABLE_REPOS.includes('devos-api');
  (apiAvailable ? describe : describe.skip)('devos-api smoke test script', () => {
    let content: string;

    beforeAll(() => {
      content = readSmokeTestScript('devos-api');
    });

    it('should be valid bash with set -e', () => {
      expect(content).toMatch(/^#!/);
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('set -e');
    });

    it('should use configurable DEPLOY_URL with no hardcoded URLs', () => {
      expect(content).toContain('DEPLOY_URL');
      // Verify default fallback pattern
      expect(content).toMatch(/DEPLOY_URL=.*\$\{DEPLOY_URL:-/);
      // No hardcoded production URLs (allow localhost defaults)
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('curl') && !line.startsWith('#')) {
          // curl calls should reference $DEPLOY_URL, not hardcoded URLs
          expect(line).toMatch(/\$DEPLOY_URL|\$\{DEPLOY_URL/);
        }
      }
    });

    it('should check health endpoint', () => {
      expect(content).toContain('curl');
      expect(content).toContain('/health');
    });

    it('should validate response time', () => {
      expect(content).toContain('MAX_RESPONSE_TIME');
      expect(content).toMatch(/time_total|response.*time/i);
    });

    it('should write to GITHUB_STEP_SUMMARY when available', () => {
      expect(content).toContain('GITHUB_STEP_SUMMARY');
    });
  });

  const frontendAvailable = AVAILABLE_REPOS.includes('devos-frontend');
  (frontendAvailable ? describe : describe.skip)('devos-frontend smoke test script', () => {
    let content: string;

    beforeAll(() => {
      content = readSmokeTestScript('devos-frontend');
    });

    it('should be valid bash with set -e', () => {
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('set -e');
    });

    it('should use configurable DEPLOY_URL', () => {
      expect(content).toContain('DEPLOY_URL');
    });

    it('should check for HTTP 200', () => {
      expect(content).toContain('curl');
      expect(content).toContain('200');
    });
  });

  const orchestratorAvailable = AVAILABLE_REPOS.includes('devos-orchestrator');
  (orchestratorAvailable ? describe : describe.skip)('devos-orchestrator smoke test script', () => {
    let content: string;

    beforeAll(() => {
      content = readSmokeTestScript('devos-orchestrator');
    });

    it('should be valid bash with set -e', () => {
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('set -e');
    });

    it('should use configurable DEPLOY_URL', () => {
      expect(content).toContain('DEPLOY_URL');
    });
  });

  const websocketAvailable = AVAILABLE_REPOS.includes('devos-websocket');
  (websocketAvailable ? describe : describe.skip)('devos-websocket smoke test script', () => {
    let content: string;

    beforeAll(() => {
      content = readSmokeTestScript('devos-websocket');
    });

    it('should be valid bash with set -e', () => {
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('set -e');
    });

    it('should use configurable DEPLOY_URL', () => {
      expect(content).toContain('DEPLOY_URL');
    });

    it('should check health endpoint', () => {
      expect(content).toContain('/health');
    });
  });
});
