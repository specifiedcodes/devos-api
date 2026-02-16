import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
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
 * GitHub OAuth Full Lifecycle E2E Test
 * Story 15-3: AC8 - Complete end-to-end flow
 *
 * Runs the full lifecycle: authorize -> callback -> status -> disconnect -> re-authorize
 * Uses in-memory mock state to simulate Redis and repository across the flow.
 */
describe('GitHub OAuth E2E - Full Lifecycle Flow', () => {
  let service: IntegrationConnectionService;

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

  // In-memory state to simulate Redis and Database
  let redisStore: Map<string, string>;
  let dbStore: Map<string, any>;

  let mockRepository: any;
  let mockRedisService: any;
  let mockHttpService: any;
  let mockEncryptionService: any;
  let mockAuditService: any;

  beforeEach(async () => {
    redisStore = new Map();
    dbStore = new Map();

    mockRepository = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          let match = true;
          if (where.workspaceId && record.workspaceId !== where.workspaceId)
            match = false;
          if (where.provider && record.provider !== where.provider)
            match = false;
          if (where.status && record.status !== where.status) match = false;
          if (match) return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation(({ where }: any) => {
        const results: any[] = [];
        for (const [, record] of dbStore) {
          if (where.workspaceId && record.workspaceId !== where.workspaceId)
            continue;
          results.push({ ...record });
        }
        return Promise.resolve(results);
      }),
      save: jest.fn().mockImplementation((entity) => {
        const id = entity.id || mockIntegrationId;
        const saved = {
          ...entity,
          id,
          createdAt: entity.createdAt || new Date(),
          updatedAt: new Date(),
        };
        dbStore.set(id, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockImplementation((_wsId, token) => ({
        encryptedData: `encrypted:${token}`,
        iv: 'test-iv-hex-123',
      })),
      decryptWithWorkspaceKey: jest
        .fn()
        .mockImplementation((_wsId, encData, _iv) =>
          encData.replace('encrypted:', ''),
        ),
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

    mockHttpService = {
      post: jest.fn().mockReturnValue(of(createAxiosResponse(mockTokenResponse))),
      get: jest.fn().mockReturnValue(of(createAxiosResponse(mockGitHubUser))),
    };

    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    mockRedisService = {
      set: jest
        .fn()
        .mockImplementation((key: string, value: string, _ttl: number) => {
          redisStore.set(key, value);
          return Promise.resolve(undefined);
        }),
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisStore.get(key) || null);
      }),
      del: jest.fn().mockImplementation((key: string) => {
        redisStore.delete(key);
        return Promise.resolve(undefined);
      }),
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
  });

  describe('AC8: Full OAuth E2E Flow Integration Test', () => {
    it('should complete full OAuth lifecycle: authorize -> callback -> status -> disconnect -> re-authorize', async () => {
      // ========== Step 1: Generate authorization URL ==========
      const authResult = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(authResult.authorizationUrl).toContain(
        'https://github.com/login/oauth/authorize',
      );

      // ========== Step 2: Extract state from URL ==========
      const authUrl = new URL(authResult.authorizationUrl);
      const state = authUrl.searchParams.get('state');
      expect(state).toBeTruthy();

      // ========== Step 3: Verify state exists in Redis ==========
      const stateKey = `github-oauth-state:${state}`;
      expect(redisStore.has(stateKey)).toBe(true);
      const stateValue = JSON.parse(redisStore.get(stateKey)!);
      expect(stateValue.userId).toBe(mockUserId);
      expect(stateValue.workspaceId).toBe(mockWorkspaceId);

      // ========== Step 4: Simulate callback with mock token exchange ==========
      const callbackResult = await service.handleCallback(
        'valid-auth-code',
        state!,
      );
      expect(callbackResult.redirectUrl).toContain('github=connected');

      // ========== Step 5: Verify integration record created in database ==========
      const dbRecord = dbStore.get(mockIntegrationId);
      expect(dbRecord).toBeDefined();
      expect(dbRecord.provider).toBe(IntegrationProvider.GITHUB);
      expect(dbRecord.status).toBe(IntegrationStatus.ACTIVE);
      expect(dbRecord.externalUsername).toBe('testuser');

      // ========== Step 6: Verify token is encrypted (not plaintext) ==========
      expect(dbRecord.encryptedAccessToken).not.toBe(
        mockTokenResponse.access_token,
      );
      expect(dbRecord.encryptedAccessToken).toContain('encrypted:');

      // ========== Step 7: Decrypt token and verify it matches mocked token ==========
      const decryptedToken = await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );
      expect(decryptedToken).toBe(mockTokenResponse.access_token);

      // ========== Step 8: Check status returns connected: true ==========
      const statusResult = await service.getGitHubStatus(mockWorkspaceId);
      expect(statusResult.connected).toBe(true);
      expect(statusResult.username).toBe('testuser');

      // ========== Step 9: List integrations and verify GitHub appears ==========
      const integrationsResult = await service.getIntegrations(mockWorkspaceId);
      expect(integrationsResult.length).toBeGreaterThanOrEqual(1);
      const githubIntegration = integrationsResult.find(
        (i) => i.provider === 'github',
      );
      expect(githubIntegration).toBeDefined();

      // ========== Step 10: CSRF state was deleted from Redis ==========
      expect(redisStore.has(stateKey)).toBe(false);

      // ========== Step 11: Disconnect integration ==========
      const disconnectResult = await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );
      expect(disconnectResult.success).toBe(true);

      // ========== Step 12: Verify status returns connected: false ==========
      const statusAfterDisconnect =
        await service.getGitHubStatus(mockWorkspaceId);
      expect(statusAfterDisconnect.connected).toBe(false);

      // ========== Step 13: Verify token data is cleared ==========
      const disconnectedRecord = dbStore.get(mockIntegrationId);
      expect(disconnectedRecord.encryptedAccessToken).toBe('');
      expect(disconnectedRecord.encryptionIV).toBe('');

      // ========== Step 14: Re-authorize (generate new URL + callback) ==========
      const reAuthResult = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );
      const reAuthUrl = new URL(reAuthResult.authorizationUrl);
      const newState = reAuthUrl.searchParams.get('state');
      expect(newState).toBeTruthy();
      expect(newState).not.toBe(state); // Different state

      // Simulate new callback
      const newCallbackResult = await service.handleCallback(
        'new-auth-code',
        newState!,
      );
      expect(newCallbackResult.redirectUrl).toContain('github=connected');

      // ========== Step 15: Verify same record ID updated (not duplicated) ==========
      const reAuthedRecord = dbStore.get(mockIntegrationId);
      expect(reAuthedRecord).toBeDefined();
      expect(reAuthedRecord.status).toBe(IntegrationStatus.ACTIVE);
      expect(reAuthedRecord.encryptedAccessToken).toBeTruthy();
      expect(reAuthedRecord.encryptedAccessToken).not.toBe('');
      // Verify dbStore has only one entry (not two)
      expect(dbStore.size).toBe(1);
    });
  });
});
