import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationConnection } from '../../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { OnboardingService } from '../../onboarding/services/onboarding.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Shared test constants for Vercel E2E tests.
 * Centralises mock IDs and fixtures to avoid duplication across test files.
 */
export const MOCK_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
export const MOCK_INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
export const MOCK_PROJECT_ID = '44444444-4444-4444-4444-444444444444';
export const MOCK_VERCEL_PROJECT_ID = 'prj_vercel_abc123';

export const MOCK_VERCEL_USER = {
  id: 'vercel-user-1',
  username: 'VercelUser',
  name: 'Vercel User',
  avatar: 'https://vercel.com/avatar.png',
};

export const MOCK_VERCEL_TOKEN = 'vercel_test_token_secret_12345';

export const MOCK_VERCEL_TOKEN_RESPONSE = {
  access_token: MOCK_VERCEL_TOKEN,
  token_type: 'Bearer',
};

export const MOCK_VERCEL_USER_INFO_RESPONSE = {
  user: MOCK_VERCEL_USER,
};

export const MOCK_VERCEL_CONFIG: Record<string, string> = {
  VERCEL_CLIENT_ID: 'test-vercel-client-id',
  VERCEL_CLIENT_SECRET: 'test-vercel-client-secret',
  VERCEL_CALLBACK_URL:
    'http://localhost:3001/api/v1/integrations/vercel/oauth/callback',
  FRONTEND_URL: 'http://localhost:3000',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_CALLBACK_URL: '',
  RAILWAY_CLIENT_ID: '',
  RAILWAY_CLIENT_SECRET: '',
  RAILWAY_CALLBACK_URL: '',
  SUPABASE_CLIENT_ID: '',
  SUPABASE_CLIENT_SECRET: '',
  SUPABASE_CALLBACK_URL: '',
};

/**
 * Helper to create a typed AxiosResponse from raw data.
 */
export const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig,
});

/**
 * Mock Vercel REST API response helpers.
 */
export const createMockVercelProjectResponse = (overrides?: Record<string, any>) => ({
  id: MOCK_VERCEL_PROJECT_ID,
  name: 'my-app',
  framework: 'nextjs',
  createdAt: Date.now(),
  latestDeployments: [],
  ...overrides,
});

export const createMockVercelDeploymentResponse = (
  readyState = 'BUILDING',
  overrides?: Record<string, any>,
) => ({
  id: 'dpl_vercel_deploy_123',
  readyState,
  projectId: MOCK_VERCEL_PROJECT_ID,
  url: 'my-app-abc123.vercel.app',
  target: 'production',
  meta: { githubCommitRef: 'main' },
  createdAt: Date.now(),
  ready: readyState === 'READY' ? Date.now() : undefined,
  ...overrides,
});

export const createMockVercelDeploymentListResponse = (count = 2) => ({
  deployments: Array.from({ length: count }, (_, i) => ({
    uid: `dpl_vercel_${i + 1}`,
    readyState: 'READY',
    url: `my-app-${i + 1}.vercel.app`,
    target: 'production',
    meta: { githubCommitRef: 'main' },
    createdAt: Date.now(),
  })),
  pagination: {
    count,
  },
});

export const createMockVercelRedeployResponse = (overrides?: Record<string, any>) => ({
  id: 'dpl_vercel_redeploy_123',
  readyState: 'BUILDING',
  projectId: MOCK_VERCEL_PROJECT_ID,
  url: 'my-app-redeploy.vercel.app',
  target: 'production',
  createdAt: Date.now(),
  ...overrides,
});

/**
 * Creates a standard set of mock providers for IntegrationConnectionService tests.
 * Returns mutable mock objects so individual tests can override behaviour.
 */
export function createVercelMockProviders() {
  const mockRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((entity: any) =>
      Promise.resolve({
        id: MOCK_INTEGRATION_ID,
        ...entity,
        connectedAt: entity.connectedAt || new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    create: jest.fn().mockImplementation((data: any) => ({ ...data })),
  };

  const mockEncryptionService = {
    encryptWithWorkspaceKey: jest.fn().mockReturnValue({
      encryptedData: 'encrypted-vercel-token-data',
      iv: 'test-vercel-iv-hex',
    }),
    decryptWithWorkspaceKey: jest.fn().mockReturnValue(MOCK_VERCEL_TOKEN),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) =>
      MOCK_VERCEL_CONFIG[key] ?? defaultValue,
    ),
  };

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockOnboardingService = {
    updateStep: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
  };

  return {
    mockRepository,
    mockEncryptionService,
    mockConfigService,
    mockHttpService,
    mockAuditService,
    mockOnboardingService,
    mockRedisService,
  };
}

/**
 * Builds and compiles a TestingModule for IntegrationConnectionService
 * using the provided mocks.
 */
export async function buildVercelTestingModule(
  mocks: ReturnType<typeof createVercelMockProviders>,
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      IntegrationConnectionService,
      {
        provide: getRepositoryToken(IntegrationConnection),
        useValue: mocks.mockRepository,
      },
      { provide: EncryptionService, useValue: mocks.mockEncryptionService },
      { provide: ConfigService, useValue: mocks.mockConfigService },
      { provide: HttpService, useValue: mocks.mockHttpService },
      { provide: AuditService, useValue: mocks.mockAuditService },
      { provide: OnboardingService, useValue: mocks.mockOnboardingService },
      { provide: RedisService, useValue: mocks.mockRedisService },
    ],
  }).compile();
}
