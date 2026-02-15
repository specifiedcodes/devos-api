/**
 * E2E Test Configuration Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Tests for the createE2ETestConfig factory function.
 */

import { createE2ETestConfig } from './e2e-test-config';
import {
  DEFAULT_FULL_TIMEOUT_MS,
  DEFAULT_MOCK_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
  DEFAULT_MEMORY_CHECK_INTERVAL_MS,
} from './e2e-pipeline.interfaces';

describe('E2E Test Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all E2E env vars
    delete process.env.E2E_TIMEOUT_MS;
    delete process.env.E2E_GITHUB_TOKEN;
    delete process.env.E2E_ANTHROPIC_API_KEY;
    delete process.env.E2E_GITHUB_REPO_OWNER;
    delete process.env.E2E_GITHUB_REPO_NAME;
    delete process.env.E2E_DEPLOYMENT_PLATFORM;
    delete process.env.E2E_MEMORY_CHECK_ENABLED;
    delete process.env.E2E_MEMORY_MAX_HEAP_GROWTH_MB;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createE2ETestConfig("full")', () => {
    it('should set 30-minute timeout', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'test-key';
      process.env.E2E_GITHUB_TOKEN = 'test-token';

      const config = createE2ETestConfig('full');

      expect(config.timeoutMs).toBe(DEFAULT_FULL_TIMEOUT_MS);
      expect(config.timeoutMs).toBe(1_800_000);
    });

    it('should use real deployment platform', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'test-key';
      process.env.E2E_GITHUB_TOKEN = 'test-token';

      const config = createE2ETestConfig('full');

      expect(config.deployment.platform).toBe('railway');
      expect(config.deployment.environment).toBe('staging');
    });

    it('should use real API key from env', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'sk-ant-real-key';
      process.env.E2E_GITHUB_TOKEN = 'ghp-real-token';

      const config = createE2ETestConfig('full');

      expect(config.workspace.apiKey).toBe('sk-ant-real-key');
      expect(config.github.githubToken).toBe('ghp-real-token');
    });

    it('should throw when E2E_ANTHROPIC_API_KEY is missing', () => {
      process.env.E2E_GITHUB_TOKEN = 'test-token';

      expect(() => createE2ETestConfig('full')).toThrow(
        'E2E_ANTHROPIC_API_KEY',
      );
    });

    it('should throw when E2E_GITHUB_TOKEN is missing', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'test-key';

      expect(() => createE2ETestConfig('full')).toThrow('E2E_GITHUB_TOKEN');
    });

    it('should throw descriptive error listing all missing vars', () => {
      expect(() => createE2ETestConfig('full')).toThrow(
        /E2E_ANTHROPIC_API_KEY.*E2E_GITHUB_TOKEN/,
      );
    });
  });

  describe('createE2ETestConfig("mock")', () => {
    it('should set 5-minute timeout', () => {
      const config = createE2ETestConfig('mock');

      expect(config.timeoutMs).toBe(DEFAULT_MOCK_TIMEOUT_MS);
      expect(config.timeoutMs).toBe(300_000);
    });

    it('should use mock deployment', () => {
      const config = createE2ETestConfig('mock');

      expect(config.deployment.platform).toBe('mock');
      expect(config.deployment.environment).toBe('test');
    });

    it('should use dummy API keys', () => {
      const config = createE2ETestConfig('mock');

      expect(config.workspace.apiKey).toBe('dummy-api-key-for-testing');
      expect(config.github.githubToken).toBe(
        'dummy-github-token-for-testing',
      );
    });

    it('should not require E2E_ANTHROPIC_API_KEY', () => {
      expect(() => createE2ETestConfig('mock')).not.toThrow();
    });
  });

  describe('createE2ETestConfig("smoke")', () => {
    it('should set 2-minute timeout', () => {
      const config = createE2ETestConfig('smoke');

      expect(config.timeoutMs).toBe(DEFAULT_SMOKE_TIMEOUT_MS);
      expect(config.timeoutMs).toBe(120_000);
    });

    it('should use mock deployment', () => {
      const config = createE2ETestConfig('smoke');

      expect(config.deployment.platform).toBe('mock');
    });

    it('should not override memory check defaults', () => {
      const config = createE2ETestConfig('smoke');

      expect(config.memoryCheck.enabled).toBe(true);
      expect(config.memoryCheck.maxHeapGrowthMB).toBe(
        DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
      );
      expect(config.memoryCheck.checkIntervalMs).toBe(
        DEFAULT_MEMORY_CHECK_INTERVAL_MS,
      );
    });
  });

  describe('Environment variable overrides', () => {
    it('should apply E2E_TIMEOUT_MS override', () => {
      process.env.E2E_TIMEOUT_MS = '60000';

      const config = createE2ETestConfig('mock');

      expect(config.timeoutMs).toBe(60_000);
    });

    it('should apply E2E_MEMORY_CHECK_ENABLED override', () => {
      process.env.E2E_MEMORY_CHECK_ENABLED = 'false';

      const config = createE2ETestConfig('mock');

      expect(config.memoryCheck.enabled).toBe(false);
    });

    it('should apply E2E_MEMORY_MAX_HEAP_GROWTH_MB override', () => {
      process.env.E2E_MEMORY_MAX_HEAP_GROWTH_MB = '100';

      const config = createE2ETestConfig('mock');

      expect(config.memoryCheck.maxHeapGrowthMB).toBe(100);
    });

    it('should apply E2E_GITHUB_REPO_OWNER override', () => {
      process.env.E2E_GITHUB_REPO_OWNER = 'custom-org';

      const config = createE2ETestConfig('mock');

      expect(config.github.repoOwner).toBe('custom-org');
    });

    it('should apply E2E_GITHUB_REPO_NAME override', () => {
      process.env.E2E_GITHUB_REPO_NAME = 'custom-repo';

      const config = createE2ETestConfig('mock');

      expect(config.github.repoName).toBe('custom-repo');
    });

    it('should apply E2E_DEPLOYMENT_PLATFORM override in full mode', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'test-key';
      process.env.E2E_GITHUB_TOKEN = 'test-token';
      process.env.E2E_DEPLOYMENT_PLATFORM = 'vercel';

      const config = createE2ETestConfig('full');

      expect(config.deployment.platform).toBe('vercel');
    });
  });

  describe('Default config values', () => {
    it('should set project defaults', () => {
      const config = createE2ETestConfig('mock');

      expect(config.project.name).toBe('e2e-test-project');
      expect(config.project.template).toBe('nestjs-api');
      expect(config.project.techStack).toBe(
        'NestJS + TypeScript + PostgreSQL',
      );
    });

    it('should set default github org and repo', () => {
      const config = createE2ETestConfig('mock');

      expect(config.github.repoOwner).toBe('test-org');
      expect(config.github.repoName).toBe('e2e-test-repo');
    });

    it('should generate unique workspace IDs', () => {
      const config1 = createE2ETestConfig('mock');
      // Wait briefly to ensure different timestamp
      const config2 = createE2ETestConfig('mock');

      expect(config1.workspace.workspaceId).toMatch(/^ws-e2e-mock-/);
      expect(config1.workspace.userId).toBe('user-e2e-mock');
    });

    it('should set mode correctly', () => {
      process.env.E2E_ANTHROPIC_API_KEY = 'test-key';
      process.env.E2E_GITHUB_TOKEN = 'test-token';
      expect(createE2ETestConfig('full').mode).toBe('full');
      expect(createE2ETestConfig('mock').mode).toBe('mock');
      expect(createE2ETestConfig('smoke').mode).toBe('smoke');
    });
  });
});
