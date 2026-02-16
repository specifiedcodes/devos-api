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
 * Shared test constants for GitHub OAuth E2E tests.
 * Centralises mock IDs and fixtures to avoid duplication across test files.
 */
export const MOCK_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
export const MOCK_INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';

export const MOCK_GITHUB_USER = {
  id: 12345,
  login: 'testuser',
  avatar_url: 'https://github.com/testuser.png',
  email: 'test@example.com',
};

export const MOCK_TOKEN_RESPONSE = {
  access_token: 'gho_test_token_12345',
  token_type: 'bearer',
  scope: 'repo,user:email,read:org',
};

export const MOCK_CONFIG: Record<string, string> = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_CALLBACK_URL:
    'http://localhost:3001/api/v1/integrations/github/oauth/callback',
  FRONTEND_URL: 'http://localhost:3000',
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
 * Creates a standard set of mock providers for IntegrationConnectionService tests.
 * Returns mutable mock objects so individual tests can override behaviour.
 */
export function createMockProviders() {
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
      encryptedData: 'encrypted-token-data',
      iv: 'test-iv-hex',
    }),
    decryptWithWorkspaceKey: jest.fn().mockReturnValue('gho_decrypted_token'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) =>
      MOCK_CONFIG[key] ?? defaultValue,
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
export async function buildTestingModule(mocks: ReturnType<typeof createMockProviders>): Promise<TestingModule> {
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
