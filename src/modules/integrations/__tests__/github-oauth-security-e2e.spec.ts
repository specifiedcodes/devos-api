import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { OnboardingService } from '../../onboarding/services/onboarding.service';
import { RedisService } from '../../redis/redis.service';

/**
 * GitHub OAuth Security Verification E2E Tests
 * Story 15-3: AC9 - Token Masking and Security Properties
 *
 * Verifies token never leaks, CSRF state uniqueness, TTL, and UUID format.
 */
describe('GitHub OAuth E2E - Security Verification', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;
  let mockRedisService: any;
  let mockAuditService: any;
  let mockHttpService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockIntegrationId = '33333333-3333-3333-3333-333333333333';
  const mockPlaintextToken = 'gho_test_token_12345_secret_value';

  const mockGitHubUser = {
    id: 12345,
    login: 'testuser',
    avatar_url: 'https://github.com/testuser.png',
    email: 'test@example.com',
  };

  const mockTokenResponse = {
    access_token: mockPlaintextToken,
    token_type: 'bearer',
    scope: 'repo,user:email,read:org',
  };

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: mockIntegrationId,
          ...entity,
          connectedAt: entity.connectedAt || new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    const mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockReturnValue({
        encryptedData: 'encrypted-token-data',
        iv: 'test-iv-hex',
      }),
      decryptWithWorkspaceKey: jest.fn().mockReturnValue('gho_decrypted_token'),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          GITHUB_CLIENT_ID: 'test-client-id',
          GITHUB_CLIENT_SECRET: 'test-client-secret',
          GITHUB_CALLBACK_URL:
            'http://localhost:3001/api/v1/integrations/github/oauth/callback',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockHttpService = { post: jest.fn(), get: jest.fn() };
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationConnectionService,
        {
          provide: getRepositoryToken(IntegrationConnection),
          useValue: mockRepository,
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: AuditService, useValue: mockAuditService },
        {
          provide: OnboardingService,
          useValue: { updateStep: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<IntegrationConnectionService>(
      IntegrationConnectionService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC9: Token Masking and Security', () => {
    it('should not expose plaintext token in integration list response', async () => {
      mockRepository.find.mockResolvedValue([
        {
          id: mockIntegrationId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          externalUsername: 'testuser',
          externalAvatarUrl: 'https://github.com/testuser.png',
          scopes: 'repo,user:email,read:org',
          connectedAt: new Date('2026-01-29T10:00:00Z'),
          lastUsedAt: null,
          encryptedAccessToken: 'encrypted-data',
          encryptionIV: 'iv-data',
        },
      ]);

      const result = await service.getIntegrations(mockWorkspaceId);

      // Stringify entire response and check the token is not in it
      const responseString = JSON.stringify(result);
      expect(responseString).not.toContain(mockPlaintextToken);
      expect((result[0] as any).encryptedAccessToken).toBeUndefined();
      expect((result[0] as any).encryptionIV).toBeUndefined();
    });

    it('should use unique CSRF state for each authorization request', async () => {
      const result1 = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );
      const result2 = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      const url1 = new URL(result1.authorizationUrl);
      const url2 = new URL(result2.authorizationUrl);
      const state1 = url1.searchParams.get('state');
      const state2 = url2.searchParams.get('state');

      expect(state1).toBeTruthy();
      expect(state2).toBeTruthy();
      expect(state1).not.toBe(state2);
    });

    it('should store CSRF state with correct TTL of 600 seconds', async () => {
      await service.generateAuthorizationUrl(mockUserId, mockWorkspaceId);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^github-oauth-state:/),
        expect.any(String),
        600,
      );
    });

    it('should validate CSRF state is UUID v4 format', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state');

      expect(state).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should not include token in error redirect URL', async () => {
      // Setup: successful token exchange, but user info fails
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      // Mock user info endpoint to return an RxJS error (simulates HTTP failure)
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('User info fetch failed')),
      );

      const result = await service.handleCallback('code', 'state');

      expect(result.redirectUrl).toContain('github=error');
      expect(result.redirectUrl).not.toContain(mockPlaintextToken);
    });

    it('should not include token in audit log details', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );
      mockRepository.findOne.mockResolvedValue(null);

      await service.handleCallback('valid-code', 'valid-state');

      expect(mockAuditService.log).toHaveBeenCalled();
      const auditLogCalls = mockAuditService.log.mock.calls;
      for (const call of auditLogCalls) {
        const details = call[5]; // 6th argument is the details object
        const detailString = JSON.stringify(details);
        expect(detailString).not.toContain(mockPlaintextToken);
      }
    });

    it('should generate different CSRF states across multiple requests (no reuse)', async () => {
      const states = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const result = await service.generateAuthorizationUrl(
          mockUserId,
          mockWorkspaceId,
        );
        const url = new URL(result.authorizationUrl);
        const state = url.searchParams.get('state')!;
        states.add(state);
      }

      // All 5 states should be unique
      expect(states.size).toBe(5);
    });
  });
});
