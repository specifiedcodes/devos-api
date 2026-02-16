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
  MOCK_RAILWAY_USER,
  MOCK_RAILWAY_TOKEN,
  MOCK_RAILWAY_TOKEN_RESPONSE,
  MOCK_RAILWAY_USER_INFO_RESPONSE,
  createAxiosResponse,
  createRailwayMockProviders,
  buildRailwayTestingModule,
} from './railway-test-helpers';

/**
 * Railway OAuth E2E Verification Tests
 * Story 15-4: AC1 (Authorization URL), AC2 (Callback/Token Exchange), AC3 (Error Handling)
 *
 * Tests the complete Railway OAuth authorization flow with mocked dependencies.
 */
describe('Railway OAuth E2E - Authorization, Callback & Error Handling', () => {
  let service: IntegrationConnectionService;
  let mocks: ReturnType<typeof createRailwayMockProviders>;

  beforeEach(async () => {
    mocks = createRailwayMockProviders();

    const module = await buildRailwayTestingModule(mocks);
    service = module.get<IntegrationConnectionService>(
      IntegrationConnectionService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ======================== AC1: Railway Authorization URL Generation ========================

  describe('AC1: Railway OAuth Authorization URL Generation', () => {
    it('should return an object with authorizationUrl field', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(typeof result.authorizationUrl).toBe('string');
    });

    it('should generate URL starting with https://railway.app/authorize', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(result.authorizationUrl).toMatch(
        /^https:\/\/railway\.app\/authorize/,
      );
    });

    it('should contain client_id parameter matching RAILWAY_CLIENT_ID config', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      expect(url.searchParams.get('client_id')).toBe('test-railway-client-id');
    });

    it('should contain response_type=code parameter', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      expect(url.searchParams.get('response_type')).toBe('code');
    });

    it('should contain state parameter in UUID v4 format', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
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

    it('should contain redirect_uri parameter matching RAILWAY_CALLBACK_URL config', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      const redirectUri = url.searchParams.get('redirect_uri');
      expect(redirectUri).toBe(
        'http://localhost:3001/api/v1/integrations/railway/oauth/callback',
      );
    });

    it('should store CSRF state in Redis with key railway-oauth-state:{state} and TTL 600', async () => {
      await service.generateRailwayAuthorizationUrl(MOCK_USER_ID, MOCK_WORKSPACE_ID);

      expect(mocks.mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, , ttl] = mocks.mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^railway-oauth-state:[0-9a-f-]+$/);
      expect(ttl).toBe(600);
    });

    it('should store Redis state value containing userId and workspaceId as JSON', async () => {
      await service.generateRailwayAuthorizationUrl(MOCK_USER_ID, MOCK_WORKSPACE_ID);

      const [, value] = mocks.mockRedisService.set.mock.calls[0];
      const parsedValue = JSON.parse(value);
      expect(parsedValue).toEqual({
        userId: MOCK_USER_ID,
        workspaceId: MOCK_WORKSPACE_ID,
      });
    });

    it('should generate different state values for different calls (no CSRF state reuse)', async () => {
      const result1 = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const result2 = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url1 = new URL(result1.authorizationUrl);
      const url2 = new URL(result2.authorizationUrl);
      expect(url1.searchParams.get('state')).not.toBe(
        url2.searchParams.get('state'),
      );
    });
  });

  // ======================== AC2: Railway Callback and Token Exchange ========================

  describe('AC2: Railway OAuth Callback and Token Exchange', () => {
    const mockCode = 'railway-auth-code-123';
    const mockState = 'test-state-uuid';

    beforeEach(() => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      // First call: token exchange, Second call: user info
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_USER_INFO_RESPONSE)));
      mocks.mockRepository.findOne.mockResolvedValue(null);
    });

    it('should redirect to FRONTEND_URL/settings/integrations?railway=connected on success', async () => {
      const result = await service.handleRailwayCallback(mockCode, mockState);

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?railway=connected',
      );
    });

    it('should exchange code for token via Railway GraphQL oauthExchange mutation', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      const firstPostCall = mocks.mockHttpService.post.mock.calls[0];
      expect(firstPostCall[0]).toBe('https://backboard.railway.app/graphql/v2');
      expect(firstPostCall[1].query).toContain('oauthExchange');
      expect(firstPostCall[1].variables.input).toEqual({
        code: mockCode,
        clientId: 'test-railway-client-id',
        clientSecret: 'test-railway-client-secret',
        redirectUri: 'http://localhost:3001/api/v1/integrations/railway/oauth/callback',
      });
    });

    it('should fetch Railway user info using the access token', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      const secondPostCall = mocks.mockHttpService.post.mock.calls[1];
      expect(secondPostCall[0]).toBe('https://backboard.railway.app/graphql/v2');
      expect(secondPostCall[1].query).toContain('me');
      expect(secondPostCall[2].headers.Authorization).toBe(
        `Bearer ${MOCK_RAILWAY_TOKEN}`,
      );
    });

    it('should encrypt access token via EncryptionService.encryptWithWorkspaceKey', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(
        mocks.mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, MOCK_RAILWAY_TOKEN);
    });

    it('should create IntegrationConnection record with correct fields', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.provider).toBe(IntegrationProvider.RAILWAY);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-railway-token-data');
      expect(savedEntity.encryptionIV).toBe('test-railway-iv-hex');
      expect(savedEntity.tokenType).toBe('bearer');
      expect(savedEntity.externalUserId).toBe(String(MOCK_RAILWAY_USER.id));
      expect(savedEntity.externalUsername).toBe(MOCK_RAILWAY_USER.name);
      expect(savedEntity.externalAvatarUrl).toBe(MOCK_RAILWAY_USER.avatar);
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });

    it('should ensure stored encryptedAccessToken is not the plaintext token', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).not.toBe(MOCK_RAILWAY_TOKEN);
    });

    it('should ensure encryptionIV is set and not empty', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptionIV).toBeTruthy();
      expect(savedEntity.encryptionIV.length).toBeGreaterThan(0);
    });

    it('should delete CSRF state from Redis after successful callback', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mocks.mockRedisService.del).toHaveBeenCalledWith(
        `railway-oauth-state:${mockState}`,
      );
    });

    it('should log audit event integration.railway.connected', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mocks.mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.railway.connected',
          provider: 'railway',
          externalUsername: MOCK_RAILWAY_USER.name,
          result: 'success',
        }),
      );
    });

    it('should upsert existing disconnected record on re-connect', async () => {
      const existingIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        userId: MOCK_USER_ID,
        provider: IntegrationProvider.RAILWAY,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };

      mocks.mockRepository.findOne.mockResolvedValue(existingIntegration);

      await service.handleRailwayCallback(mockCode, mockState);

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.id).toBe(MOCK_INTEGRATION_ID);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-railway-token-data');
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });
  });

  // ======================== AC3: Railway Error Handling ========================

  describe('AC3: Railway OAuth Error Handling', () => {
    const mockCode = 'railway-auth-code-123';
    const mockState = 'test-state-uuid';

    it('should throw ForbiddenException for invalid CSRF state (not in Redis)', async () => {
      mocks.mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleRailwayCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include correct message when CSRF state is invalid', async () => {
      mocks.mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleRailwayCallback(mockCode, mockState),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should throw ForbiddenException for expired CSRF state (Redis TTL expiry)', async () => {
      mocks.mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleRailwayCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should redirect to error URL when Railway returns no authToken', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse({ data: { authToken: null } })),
      );

      const result = await service.handleRailwayCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('railway=error');
    });

    it('should redirect to error URL when Railway user info fetch fails (500)', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(
          throwError(() => {
            const error: any = new Error('Internal Server Error');
            error.response = { status: 500 };
            return error;
          }),
        );

      const result = await service.handleRailwayCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('railway=error');
    });

    it('should redirect to error URL when Railway API returns rate limit (429)', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post.mockReturnValueOnce(
        throwError(() => {
          const error: any = new Error('Rate limit exceeded');
          error.response = { status: 429 };
          return error;
        }),
      );

      const result = await service.handleRailwayCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('railway=error');
    });

    it('should clean up Redis state even on error', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post.mockReturnValueOnce(
        throwError(() => new Error('Network error')),
      );

      await service.handleRailwayCallback(mockCode, mockState);

      expect(mocks.mockRedisService.del).toHaveBeenCalledWith(
        `railway-oauth-state:${mockState}`,
      );
    });

    it('should prevent duplicate state usage (state deleted after first use)', async () => {
      // First call: valid state
      mocks.mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_USER_INFO_RESPONSE)));

      await service.handleRailwayCallback(mockCode, mockState);

      // Verify state was deleted
      expect(mocks.mockRedisService.del).toHaveBeenCalledWith(
        `railway-oauth-state:${mockState}`,
      );

      // Second call: state no longer in Redis
      mocks.mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        service.handleRailwayCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
