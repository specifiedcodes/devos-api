/**
 * E2E Test Configuration Factory
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Builds E2ETestConfig instances based on test mode and environment variables.
 * Full mode requires real API keys; mock and smoke modes use dummy values.
 */

import {
  E2ETestConfig,
  DEFAULT_FULL_TIMEOUT_MS,
  DEFAULT_MOCK_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
  DEFAULT_MEMORY_CHECK_INTERVAL_MS,
} from './e2e-pipeline.interfaces';

/**
 * Environment variable keys for E2E test configuration.
 */
export const E2E_ENV_VARS = {
  E2E_TEST_MODE: 'mock',
  E2E_TIMEOUT_MS: '',
  E2E_GITHUB_TOKEN: '',
  E2E_ANTHROPIC_API_KEY: '',
  E2E_GITHUB_REPO_OWNER: '',
  E2E_GITHUB_REPO_NAME: '',
  E2E_DEPLOYMENT_PLATFORM: 'mock',
  E2E_MEMORY_CHECK_ENABLED: 'true',
  E2E_MEMORY_MAX_HEAP_GROWTH_MB: '50',
} as const;

/**
 * Creates an E2ETestConfig for the given test mode.
 * Reads environment variables for overrides and validates required values.
 *
 * @param mode - Test mode: 'full', 'mock', or 'smoke'
 * @returns Fully populated E2ETestConfig
 * @throws Error if required environment variables are missing for full mode
 */
export function createE2ETestConfig(
  mode: 'full' | 'mock' | 'smoke',
): E2ETestConfig {
  // Determine timeout
  const defaultTimeout = getDefaultTimeout(mode);
  const envTimeout = process.env.E2E_TIMEOUT_MS;
  const timeoutMs = envTimeout ? parseInt(envTimeout, 10) : defaultTimeout;

  // Validate full mode requirements
  if (mode === 'full') {
    const missingVars: string[] = [];
    if (!process.env.E2E_ANTHROPIC_API_KEY) {
      missingVars.push('E2E_ANTHROPIC_API_KEY');
    }
    if (!process.env.E2E_GITHUB_TOKEN) {
      missingVars.push('E2E_GITHUB_TOKEN');
    }
    if (missingVars.length > 0) {
      throw new Error(
        `Full mode E2E tests require the following environment variables: ${missingVars.join(', ')}. ` +
          'These are needed for real Claude API calls and GitHub operations.',
      );
    }
  }

  // Build deployment config
  const deploymentPlatform = getDeploymentPlatform(mode);
  const deploymentEnvironment =
    mode === 'full' ? 'staging' : 'test';

  // Build memory check config
  const memoryEnabled =
    (process.env.E2E_MEMORY_CHECK_ENABLED || 'true') === 'true';
  const maxHeapGrowthMB = parseInt(
    process.env.E2E_MEMORY_MAX_HEAP_GROWTH_MB ||
      String(DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB),
    10,
  );

  return {
    mode,
    timeoutMs,
    project: {
      name: 'e2e-test-project',
      template: 'nestjs-api',
      techStack: 'NestJS + TypeScript + PostgreSQL',
    },
    workspace: {
      workspaceId: `ws-e2e-${mode}-${Date.now()}`,
      userId: `user-e2e-${mode}`,
      apiKey:
        mode === 'full'
          ? process.env.E2E_ANTHROPIC_API_KEY || ''
          : 'dummy-api-key-for-testing',
    },
    github: {
      repoOwner:
        process.env.E2E_GITHUB_REPO_OWNER || 'test-org',
      repoName:
        process.env.E2E_GITHUB_REPO_NAME || 'e2e-test-repo',
      githubToken:
        mode === 'full'
          ? process.env.E2E_GITHUB_TOKEN || ''
          : 'dummy-github-token-for-testing',
    },
    deployment: {
      platform: deploymentPlatform,
      environment: deploymentEnvironment,
    },
    memoryCheck: {
      enabled: memoryEnabled,
      maxHeapGrowthMB,
      checkIntervalMs: DEFAULT_MEMORY_CHECK_INTERVAL_MS,
    },
  };
}

/**
 * Returns the default timeout for a given test mode.
 */
function getDefaultTimeout(mode: 'full' | 'mock' | 'smoke'): number {
  switch (mode) {
    case 'full':
      return DEFAULT_FULL_TIMEOUT_MS;
    case 'mock':
      return DEFAULT_MOCK_TIMEOUT_MS;
    case 'smoke':
      return DEFAULT_SMOKE_TIMEOUT_MS;
  }
}

/**
 * Returns the deployment platform for a given test mode.
 */
function getDeploymentPlatform(
  mode: 'full' | 'mock' | 'smoke',
): 'railway' | 'vercel' | 'mock' {
  if (mode === 'full') {
    const envPlatform = process.env.E2E_DEPLOYMENT_PLATFORM;
    if (envPlatform === 'railway' || envPlatform === 'vercel') {
      return envPlatform;
    }
    return 'railway';
  }
  return 'mock';
}
