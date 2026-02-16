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
 * Shared test constants for Supabase E2E tests.
 * Centralises mock IDs and fixtures to avoid duplication across test files.
 */
export const MOCK_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
export const MOCK_INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
export const MOCK_PROJECT_ID = '44444444-4444-4444-4444-444444444444';
export const MOCK_SUPABASE_PROJECT_REF = 'supabase-ref-abc123';

export const MOCK_SUPABASE_TOKEN = 'supabase_test_token_secret_12345';
export const MOCK_ENCRYPTED_SUPABASE_TOKEN = 'encrypted-supabase-token-data';
export const MOCK_SUPABASE_IV = 'test-supabase-iv-hex';

export const MOCK_SUPABASE_TOKEN_RESPONSE = {
  access_token: MOCK_SUPABASE_TOKEN,
  token_type: 'Bearer',
  refresh_token: 'supabase_refresh_token_xyz',
};

export const MOCK_SUPABASE_CONFIG: Record<string, string> = {
  SUPABASE_CLIENT_ID: 'test-supabase-client-id',
  SUPABASE_CLIENT_SECRET: 'test-supabase-client-secret',
  SUPABASE_CALLBACK_URL:
    'http://localhost:3001/api/v1/integrations/supabase/oauth/callback',
  FRONTEND_URL: 'http://localhost:3000',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_CALLBACK_URL: '',
  RAILWAY_CLIENT_ID: '',
  RAILWAY_CLIENT_SECRET: '',
  RAILWAY_CALLBACK_URL: '',
  VERCEL_CLIENT_ID: '',
  VERCEL_CLIENT_SECRET: '',
  VERCEL_CALLBACK_URL: '',
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
 * Mock Supabase REST API response helpers.
 */
export const createMockSupabaseProjectResponse = (overrides?: Record<string, any>) => ({
  id: MOCK_SUPABASE_PROJECT_REF,
  name: 'my-app-db',
  organization_id: 'org-uuid-1',
  region: 'us-east-1',
  status: 'COMING_UP',
  created_at: '2026-02-16T00:00:00.000Z',
  ...overrides,
});

export const createMockSupabaseApiKeysResponse = () => [
  { name: 'anon', api_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon' },
  { name: 'service_role', api_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role' },
];

export const createMockSupabaseOrganizationsResponse = () => [
  { id: 'org-1', name: 'My Organization' },
  { id: 'org-2', name: 'Another Organization' },
];

/**
 * Creates a standard set of mock providers for IntegrationConnectionService tests.
 * Returns mutable mock objects so individual tests can override behaviour.
 */
export function createSupabaseMockProviders() {
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
      encryptedData: MOCK_ENCRYPTED_SUPABASE_TOKEN,
      iv: MOCK_SUPABASE_IV,
    }),
    decryptWithWorkspaceKey: jest.fn().mockReturnValue(MOCK_SUPABASE_TOKEN),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) =>
      MOCK_SUPABASE_CONFIG[key] ?? defaultValue,
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
export async function buildSupabaseTestingModule(
  mocks: ReturnType<typeof createSupabaseMockProviders>,
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
