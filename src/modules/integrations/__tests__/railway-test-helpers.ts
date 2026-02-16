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
 * Shared test constants for Railway E2E tests.
 * Centralises mock IDs and fixtures to avoid duplication across test files.
 */
export const MOCK_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
export const MOCK_INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
export const MOCK_PROJECT_ID = '44444444-4444-4444-4444-444444444444';
export const MOCK_RAILWAY_PROJECT_ID = 'railway-project-abc123';

export const MOCK_RAILWAY_USER = {
  id: 'railway-user-1',
  name: 'Railway User',
  email: 'test@railway.app',
  avatar: 'https://railway.app/avatar.png',
};

export const MOCK_RAILWAY_TOKEN = 'railway_test_token_secret_12345';

export const MOCK_RAILWAY_TOKEN_RESPONSE = {
  data: {
    authToken: MOCK_RAILWAY_TOKEN,
  },
};

export const MOCK_RAILWAY_USER_INFO_RESPONSE = {
  data: {
    me: MOCK_RAILWAY_USER,
  },
};

export const MOCK_RAILWAY_CONFIG: Record<string, string> = {
  RAILWAY_CLIENT_ID: 'test-railway-client-id',
  RAILWAY_CLIENT_SECRET: 'test-railway-client-secret',
  RAILWAY_CALLBACK_URL:
    'http://localhost:3001/api/v1/integrations/railway/oauth/callback',
  FRONTEND_URL: 'http://localhost:3000',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_CALLBACK_URL: '',
  VERCEL_CLIENT_ID: '',
  VERCEL_CLIENT_SECRET: '',
  VERCEL_CALLBACK_URL: '',
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
 * Mock Railway GraphQL response helpers.
 */
export const createMockProjectResponse = (overrides?: Partial<any>) => ({
  data: {
    projectCreate: {
      id: MOCK_RAILWAY_PROJECT_ID,
      name: 'my-app',
      description: 'My App',
      createdAt: '2026-02-16T00:00:00.000Z',
      environments: {
        edges: [
          { node: { id: 'env-prod-1', name: 'production' } },
          { node: { id: 'env-staging-1', name: 'staging' } },
        ],
      },
      ...overrides,
    },
  },
});

export const createMockDeploymentTriggerResponse = (overrides?: Partial<any>) => ({
  data: {
    deploymentTriggerCreate: {
      id: 'deploy-123',
      status: 'BUILDING',
      createdAt: '2026-02-16T00:00:00.000Z',
      updatedAt: '2026-02-16T00:00:00.000Z',
      environmentId: 'env-prod-1',
      meta: { branch: 'main' },
      ...overrides,
    },
  },
});

export const createMockDeploymentQueryResponse = (status = 'SUCCESS', overrides?: Partial<any>) => ({
  data: {
    deployment: {
      id: 'deploy-123',
      status,
      createdAt: '2026-02-16T00:00:00.000Z',
      updatedAt: '2026-02-16T00:01:00.000Z',
      projectId: MOCK_RAILWAY_PROJECT_ID,
      environmentId: 'env-prod-1',
      staticUrl: 'https://my-app.up.railway.app',
      meta: {},
      ...overrides,
    },
  },
});

export const createMockDeploymentListResponse = (count = 2) => ({
  data: {
    deployments: {
      edges: Array.from({ length: count }, (_, i) => ({
        node: {
          id: `deploy-${i + 1}`,
          status: 'SUCCESS',
          createdAt: '2026-02-16T00:00:00.000Z',
          updatedAt: '2026-02-16T00:01:00.000Z',
          projectId: MOCK_RAILWAY_PROJECT_ID,
          environmentId: 'env-prod-1',
          staticUrl: `https://my-app-${i + 1}.up.railway.app`,
          meta: { branch: 'main' },
        },
      })),
      pageInfo: {
        totalCount: count,
      },
    },
  },
});

export const createMockRedeployResponse = (overrides?: Partial<any>) => ({
  data: {
    deploymentRedeploy: {
      id: 'deploy-new-123',
      status: 'BUILDING',
      createdAt: '2026-02-16T00:00:00.000Z',
      updatedAt: '2026-02-16T00:00:00.000Z',
      projectId: MOCK_RAILWAY_PROJECT_ID,
      environmentId: 'env-prod-1',
      ...overrides,
    },
  },
});

/**
 * Creates a standard set of mock providers for IntegrationConnectionService tests.
 * Returns mutable mock objects so individual tests can override behaviour.
 */
export function createRailwayMockProviders() {
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
      encryptedData: 'encrypted-railway-token-data',
      iv: 'test-railway-iv-hex',
    }),
    decryptWithWorkspaceKey: jest.fn().mockReturnValue(MOCK_RAILWAY_TOKEN),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) =>
      MOCK_RAILWAY_CONFIG[key] ?? defaultValue,
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
export async function buildRailwayTestingModule(
  mocks: ReturnType<typeof createRailwayMockProviders>,
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
