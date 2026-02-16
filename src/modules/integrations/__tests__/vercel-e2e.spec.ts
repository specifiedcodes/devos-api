import { of, throwError } from 'rxjs';
import { ForbiddenException } from '@nestjs/common';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_VERCEL_USER,
  MOCK_VERCEL_TOKEN,
  MOCK_VERCEL_TOKEN_RESPONSE,
  MOCK_VERCEL_USER_INFO_RESPONSE,
  createAxiosResponse,
  createVercelMockProviders,
  buildVercelTestingModule,
} from './vercel-test-helpers';

/**
 * Vercel OAuth E2E Verification Tests
 * Story 15-5: AC1 (Authorization URL), AC2 (Callback/Token Exchange), AC3 (Error Handling)
 *
 * Tests the complete Vercel OAuth authorization flow with mocked dependencies.
 */
describe('Vercel OAuth E2E - Authorization, Callback & Error Handling', () => {
  let service: IntegrationConnectionService;
  let mocks: ReturnType<typeof createVercelMockProviders>;

  beforeEach(async () => {
    mocks = createVercelMockProviders();

    const module = await buildVercelTestingModule(mocks);
    service = module.get<IntegrationConnectionService>(
      IntegrationConnectionService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ======================== AC1: Vercel Authorization URL Generation ========================

  describe('AC1: Vercel OAuth Authorization URL Generation', () => {
    it('should return an object with authorizationUrl field', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(typeof result.authorizationUrl).toBe('string');
    });

    it('should generate URL starting with https://vercel.com/integrations/oauthdone', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(result.authorizationUrl).toMatch(
        /^https:\/\/vercel\.com\/integrations\/oauthdone/,
      );
    });

    it('should contain client_id parameter matching VERCEL_CLIENT_ID config', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      expect(url.searchParams.get('client_id')).toBe('test-vercel-client-id');
    });

    it('should contain state parameter in UUID v4 format', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
      expect(state).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should contain redirect_uri parameter matching VERCEL_CALLBACK_URL config', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3001/api/v1/integrations/vercel/oauth/callback',
      );
    });

    it('should store CSRF state in Redis with correct key pattern and TTL', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state');

      expect(mocks.mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mocks.mockRedisService.set.mock.calls[0];
      expect(key).toBe(`vercel-oauth-state:${state}`);
      expect(ttl).toBe(600);

      const parsed = JSON.parse(value);
      expect(parsed.userId).toBe(MOCK_USER_ID);
      expect(parsed.workspaceId).toBe(MOCK_WORKSPACE_ID);
    });

    it('should generate different state values for different calls (no reuse)', async () => {
      const result1 = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const result2 = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url1 = new URL(result1.authorizationUrl);
      const url2 = new URL(result2.authorizationUrl);
      const state1 = url1.searchParams.get('state');
      const state2 = url2.searchParams.get('state');

      expect(state1).not.toBe(state2);
    });
  });

  // ======================== AC2: Vercel OAuth Callback ========================

  describe('AC2: Vercel OAuth Callback and Token Exchange', () => {
    const mockState = 'valid-csrf-state-uuid';
    const mockStateKey = `vercel-oauth-state:${mockState}`;

    beforeEach(() => {
      // Pre-store valid CSRF state in mock Redis
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });
    });

    it('should exchange code for token and return success redirect', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      const result = await service.handleVercelCallback(
        'valid-auth-code',
        mockState,
      );

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?vercel=connected',
      );
    });

    it('should use application/x-www-form-urlencoded for Vercel token exchange', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      const postCall = mocks.mockHttpService.post.mock.calls[0];
      expect(postCall[0]).toBe('https://api.vercel.com/v2/oauth/access_token');
      expect(postCall[2].headers['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      );
    });

    it('should fetch Vercel user info after token exchange', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(mocks.mockHttpService.get).toHaveBeenCalledWith(
        'https://api.vercel.com/v2/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_VERCEL_TOKEN}`,
          }),
        }),
      );
    });

    it('should encrypt access token via EncryptionService.encryptWithWorkspaceKey', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(
        mocks.mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, MOCK_VERCEL_TOKEN);
    });

    it('should create integration record with correct fields', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.provider).toBe(IntegrationProvider.VERCEL);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe(
        'encrypted-vercel-token-data',
      );
      expect(savedEntity.encryptionIV).toBe('test-vercel-iv-hex');
      expect(savedEntity.tokenType).toBe('bearer');
      expect(savedEntity.externalUserId).toBe(String(MOCK_VERCEL_USER.id));
      expect(savedEntity.externalUsername).toBe(MOCK_VERCEL_USER.username);
      expect(savedEntity.externalAvatarUrl).toBe(MOCK_VERCEL_USER.avatar);
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });

    it('should delete CSRF state from Redis after successful callback', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(mocks.mockRedisService.del).toHaveBeenCalledWith(mockStateKey);
    });

    it('should log audit event integration.vercel.connected', async () => {
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(mocks.mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_INTEGRATION_ID,
        expect.objectContaining({
          action: 'integration.vercel.connected',
          provider: 'vercel',
          externalUsername: MOCK_VERCEL_USER.username,
        }),
      );
    });

    it('should handle callback with existing disconnected record (upsert)', async () => {
      const existingRecord = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };
      mocks.mockRepository.findOne.mockResolvedValue(existingRecord);

      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('valid-auth-code', mockState);

      expect(mocks.mockRepository.create).not.toHaveBeenCalled();
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe(
        'encrypted-vercel-token-data',
      );
    });
  });

  // ======================== AC3: Vercel OAuth Error Handling ========================

  describe('AC3: Vercel OAuth Error Handling', () => {
    it('should reject callback with invalid CSRF state (ForbiddenException)', async () => {
      mocks.mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleVercelCallback('code', 'invalid-state'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject callback with invalid CSRF state with correct message', async () => {
      mocks.mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleVercelCallback('code', 'invalid-state'),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should handle Vercel token exchange failure gracefully', async () => {
      const mockState = 'error-test-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse({ access_token: null })),
      );

      const result = await service.handleVercelCallback(
        'code',
        mockState,
      );

      expect(result.redirectUrl).toContain('vercel=error');
    });

    it('should handle Vercel user info fetch failure gracefully', async () => {
      const mockState = 'user-info-fail-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        throwError(() => {
          const error: any = new Error('Internal Server Error');
          error.response = { status: 500 };
          return error;
        }),
      );

      const result = await service.handleVercelCallback(
        'code',
        mockState,
      );

      expect(result.redirectUrl).toContain('vercel=error');
    });

    it('should handle Vercel API rate limit (429) on token exchange', async () => {
      const mockState = 'rate-limit-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      mocks.mockHttpService.post.mockReturnValueOnce(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = { status: 429 };
          return error;
        }),
      );

      const result = await service.handleVercelCallback(
        'code',
        mockState,
      );

      expect(result.redirectUrl).toContain('vercel=error');
    });

    it('should clean up Redis state even on error', async () => {
      const mockState = 'cleanup-test-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse({ access_token: null })),
      );

      await service.handleVercelCallback('code', mockState);

      expect(mocks.mockRedisService.del).toHaveBeenCalledWith(mockStateKey);
    });

    it('should reject duplicate CSRF state usage', async () => {
      const mockState = 'duplicate-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      let stateExists = true;

      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey && stateExists) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });
      mocks.mockRedisService.del.mockImplementation((key: string) => {
        if (key === mockStateKey) stateExists = false;
        return Promise.resolve(undefined);
      });

      mocks.mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      // First callback succeeds
      await service.handleVercelCallback('code', mockState);

      // Second callback with same state should fail
      await expect(
        service.handleVercelCallback('code', mockState),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
