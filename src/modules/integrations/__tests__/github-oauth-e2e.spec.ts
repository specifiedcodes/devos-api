import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ForbiddenException } from '@nestjs/common';
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
 * GitHub OAuth E2E Verification Tests
 * Story 15-3: AC1 (Authorization URL), AC2 (Callback/Token Exchange), AC3 (Error Handling)
 *
 * Tests the complete OAuth authorization flow with mocked dependencies.
 */
describe('GitHub OAuth E2E - Authorization, Callback & Error Handling', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;
  let mockEncryptionService: any;
  let mockConfigService: any;
  let mockHttpService: any;
  let mockAuditService: any;
  let mockOnboardingService: any;
  let mockRedisService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockIntegrationId = '33333333-3333-3333-3333-333333333333';

  const mockGitHubUser = {
    id: 12345,
    login: 'testuser',
    avatar_url: 'https://github.com/testuser.png',
    email: 'test@example.com',
  };

  const mockTokenResponse = {
    access_token: 'gho_test_token_12345',
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

    mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockReturnValue({
        encryptedData: 'encrypted-token-data',
        iv: 'test-iv-hex',
      }),
      decryptWithWorkspaceKey: jest.fn().mockReturnValue('gho_decrypted_token'),
    };

    mockConfigService = {
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

    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockOnboardingService = {
      updateStep: jest.fn().mockResolvedValue(undefined),
    };

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
        { provide: OnboardingService, useValue: mockOnboardingService },
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

  // ======================== AC1: Authorization URL Generation ========================

  describe('AC1: OAuth Authorization URL Generation', () => {
    it('should return an object with authorizationUrl field', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(typeof result.authorizationUrl).toBe('string');
    });

    it('should generate URL starting with https://github.com/login/oauth/authorize', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toMatch(
        /^https:\/\/github\.com\/login\/oauth\/authorize/,
      );
    });

    it('should contain client_id parameter matching GITHUB_CLIENT_ID config', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toContain('client_id=test-client-id');
    });

    it('should contain scope parameter with repo,user:email,read:org', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      // URLSearchParams encodes commas as %2C and colons as %3A
      const url = new URL(result.authorizationUrl);
      const scope = url.searchParams.get('scope');
      expect(scope).toBe('repo,user:email,read:org');
    });

    it('should contain state parameter in UUID format', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
      expect(state).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should contain redirect_uri parameter matching GITHUB_CALLBACK_URL config', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      const url = new URL(result.authorizationUrl);
      const redirectUri = url.searchParams.get('redirect_uri');
      expect(redirectUri).toBe(
        'http://localhost:3001/api/v1/integrations/github/oauth/callback',
      );
    });

    it('should store CSRF state in Redis with key github-oauth-state:{state} and TTL 600', async () => {
      await service.generateAuthorizationUrl(mockUserId, mockWorkspaceId);

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, , ttl] = mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^github-oauth-state:[0-9a-f-]+$/);
      expect(ttl).toBe(600);
    });

    it('should store Redis state value containing userId and workspaceId as JSON', async () => {
      await service.generateAuthorizationUrl(mockUserId, mockWorkspaceId);

      const [, value] = mockRedisService.set.mock.calls[0];
      const parsedValue = JSON.parse(value);
      expect(parsedValue).toEqual({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
      });
    });
  });

  // ======================== AC2: Callback and Token Exchange ========================

  describe('AC2: OAuth Callback and Token Exchange', () => {
    const mockCode = 'github-auth-code-123';
    const mockState = 'test-state-uuid';

    beforeEach(() => {
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
    });

    it('should redirect to FRONTEND_URL/settings/integrations?github=connected on success', async () => {
      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?github=connected',
      );
    });

    it('should exchange authorization code with GitHub token endpoint', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code: mockCode,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );
    });

    it('should fetch GitHub user info using the access token', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.github.com/user',
        {
          headers: {
            Authorization: `Bearer ${mockTokenResponse.access_token}`,
            Accept: 'application/json',
          },
        },
      );
    });

    it('should encrypt access token via EncryptionService.encryptWithWorkspaceKey', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(
        mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(mockWorkspaceId, mockTokenResponse.access_token);
    });

    it('should create IntegrationConnection record with correct fields', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.provider).toBe(IntegrationProvider.GITHUB);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('test-iv-hex');
      expect(savedEntity.tokenType).toBe('bearer');
      expect(savedEntity.scopes).toBe('repo,user:email,read:org');
      expect(savedEntity.externalUserId).toBe(String(mockGitHubUser.id));
      expect(savedEntity.externalUsername).toBe(mockGitHubUser.login);
      expect(savedEntity.externalAvatarUrl).toBe(mockGitHubUser.avatar_url);
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });

    it('should ensure stored encryptedAccessToken is not the plaintext token', async () => {
      await service.handleCallback(mockCode, mockState);

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).not.toBe(
        mockTokenResponse.access_token,
      );
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
    });

    it('should ensure encryptionIV is set and not empty', async () => {
      await service.handleCallback(mockCode, mockState);

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptionIV).toBeTruthy();
      expect(savedEntity.encryptionIV.length).toBeGreaterThan(0);
    });

    it('should delete CSRF state from Redis after successful callback', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `github-oauth-state:${mockState}`,
      );
    });

    it('should log audit event integration.github.connected', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.github.connected',
          provider: 'github',
          externalUsername: mockGitHubUser.login,
          result: 'success',
        }),
      );
    });

    it('should update onboarding step githubConnected to true', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockOnboardingService.updateStep).toHaveBeenCalledWith(
        mockUserId,
        mockWorkspaceId,
        'githubConnected',
        true,
      );
    });

    it('should upsert existing disconnected record on re-connect', async () => {
      const existingIntegration = {
        id: mockIntegrationId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };

      mockRepository.findOne.mockResolvedValue(existingIntegration);

      await service.handleCallback(mockCode, mockState);

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.id).toBe(mockIntegrationId);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });
  });

  // ======================== AC3: Error Handling ========================

  describe('AC3: OAuth Error Handling', () => {
    const mockCode = 'github-auth-code-123';
    const mockState = 'test-state-uuid';

    it('should throw ForbiddenException for invalid CSRF state (not in Redis)', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include correct message when CSRF state is invalid', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should throw ForbiddenException for expired CSRF state (Redis TTL expiry)', async () => {
      // Expired state = Redis returns null (same as invalid)
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should redirect to error URL when GitHub returns bad_verification_code', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.',
          }),
        ),
      );

      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('github=error');
      expect(result.redirectUrl).toContain('message=');
    });

    it('should redirect to error URL when GitHub user info fetch fails (500)', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Internal Server Error');
          error.response = { status: 500 };
          return error;
        }),
      );

      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('github=error');
    });

    it('should redirect to error URL when GitHub API returns rate limit (403)', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('API rate limit exceeded');
          error.response = { status: 403 };
          return error;
        }),
      );

      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('github=error');
    });

    it('should clean up Redis state even on error', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await service.handleCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `github-oauth-state:${mockState}`,
      );
    });

    it('should prevent duplicate state usage (state deleted after first use)', async () => {
      // First call: valid state
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );

      await service.handleCallback(mockCode, mockState);

      // Verify state was deleted
      expect(mockRedisService.del).toHaveBeenCalledWith(
        `github-oauth-state:${mockState}`,
      );

      // Second call: state no longer in Redis
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should not fail OAuth flow if onboarding update fails', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );
      mockOnboardingService.updateStep.mockRejectedValue(
        new Error('Onboarding not found'),
      );

      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('github=connected');
    });
  });
});
