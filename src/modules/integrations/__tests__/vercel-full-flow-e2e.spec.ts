import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
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
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_VERCEL_USER,
  MOCK_VERCEL_TOKEN,
  MOCK_VERCEL_TOKEN_RESPONSE,
  MOCK_VERCEL_USER_INFO_RESPONSE,
  MOCK_VERCEL_CONFIG,
  createAxiosResponse,
} from './vercel-test-helpers';

/**
 * Vercel Full Lifecycle E2E Integration Test
 * Story 15-5: AC11 - Complete lifecycle flow
 *
 * Runs the full lifecycle: authorize -> callback -> status -> decrypt -> disconnect -> re-authorize
 * Uses in-memory mock state to simulate Redis and repository across the flow.
 */
describe('Vercel E2E - Full Lifecycle Flow', () => {
  let service: IntegrationConnectionService;

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
        const id = entity.id || MOCK_INTEGRATION_ID;
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
        iv: 'test-vercel-iv-hex-123',
      })),
      decryptWithWorkspaceKey: jest
        .fn()
        .mockImplementation((_wsId, encData, _iv) =>
          encData.replace('encrypted:', ''),
        ),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) =>
        MOCK_VERCEL_CONFIG[key] ?? defaultValue,
      ),
    };

    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
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

  describe('AC11: Full Vercel OAuth Lifecycle', () => {
    it('should complete full Vercel OAuth lifecycle: authorize -> callback -> status -> disconnect -> re-authorize', async () => {
      // ========== Step 1: Generate Vercel authorization URL ==========
      // NOTE: HTTP mocks are set up just before handleVercelCallback (Step 4)
      // because generateVercelAuthorizationUrl does NOT make HTTP calls.
      const authResult = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(authResult.authorizationUrl).toContain(
        'https://vercel.com/integrations/oauthdone',
      );

      // ========== Step 2: Extract state from URL ==========
      const authUrl = new URL(authResult.authorizationUrl);
      const state = authUrl.searchParams.get('state');
      expect(state).toBeTruthy();

      // ========== Step 3: Verify state exists in Redis ==========
      const stateKey = `vercel-oauth-state:${state}`;
      expect(redisStore.has(stateKey)).toBe(true);
      const stateValue = JSON.parse(redisStore.get(stateKey)!);
      expect(stateValue.userId).toBe(MOCK_USER_ID);
      expect(stateValue.workspaceId).toBe(MOCK_WORKSPACE_ID);

      // ========== Step 4: Simulate Vercel callback ==========
      // Set up HTTP mocks for token exchange and user info fetch
      mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)));
      mockHttpService.get
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)));

      const callbackResult = await service.handleVercelCallback(
        'valid-auth-code',
        state!,
      );
      expect(callbackResult.redirectUrl).toContain('vercel=connected');

      // ========== Step 5: Verify integration record created in database ==========
      const dbRecord = dbStore.get(MOCK_INTEGRATION_ID);
      expect(dbRecord).toBeDefined();
      expect(dbRecord.provider).toBe(IntegrationProvider.VERCEL);
      expect(dbRecord.status).toBe(IntegrationStatus.ACTIVE);
      expect(dbRecord.externalUsername).toBe(MOCK_VERCEL_USER.username);

      // ========== Step 6: Verify token is encrypted (not plaintext) ==========
      expect(dbRecord.encryptedAccessToken).not.toBe(MOCK_VERCEL_TOKEN);
      expect(dbRecord.encryptedAccessToken).toContain('encrypted:');

      // ========== Step 7: Decrypt token and verify it matches ==========
      const decryptedToken = await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.VERCEL,
      );
      expect(decryptedToken).toBe(MOCK_VERCEL_TOKEN);

      // ========== Step 8: Check Vercel status returns connected: true ==========
      const statusResult = await service.getVercelStatus(MOCK_WORKSPACE_ID);
      expect(statusResult.connected).toBe(true);
      expect(statusResult.username).toBe(MOCK_VERCEL_USER.username);

      // ========== Step 9: List integrations and verify Vercel appears ==========
      const integrationsResult = await service.getIntegrations(
        MOCK_WORKSPACE_ID,
      );
      expect(integrationsResult.length).toBeGreaterThanOrEqual(1);
      const vercelIntegration = integrationsResult.find(
        (i) => i.provider === 'vercel',
      );
      expect(vercelIntegration).toBeDefined();

      // ========== Step 10: CSRF state was deleted from Redis ==========
      expect(redisStore.has(stateKey)).toBe(false);

      // ========== Step 11: Disconnect integration ==========
      const disconnectResult = await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'vercel',
        MOCK_USER_ID,
      );
      expect(disconnectResult.success).toBe(true);

      // ========== Step 12: Verify status returns connected: false ==========
      const statusAfterDisconnect = await service.getVercelStatus(
        MOCK_WORKSPACE_ID,
      );
      expect(statusAfterDisconnect.connected).toBe(false);

      // ========== Step 13: Verify token data is cleared ==========
      const disconnectedRecord = dbStore.get(MOCK_INTEGRATION_ID);
      expect(disconnectedRecord.encryptedAccessToken).toBe('');
      expect(disconnectedRecord.encryptionIV).toBe('');

      // ========== Step 14: Re-authorize (generate new URL + callback) ==========
      mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)));
      mockHttpService.get
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)));

      const reAuthResult = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const reAuthUrl = new URL(reAuthResult.authorizationUrl);
      const newState = reAuthUrl.searchParams.get('state');
      expect(newState).toBeTruthy();
      expect(newState).not.toBe(state); // Different state

      // Simulate new callback
      const newCallbackResult = await service.handleVercelCallback(
        'new-auth-code',
        newState!,
      );
      expect(newCallbackResult.redirectUrl).toContain('vercel=connected');

      // ========== Step 15: Verify same record ID updated (not duplicated) ==========
      const reAuthedRecord = dbStore.get(MOCK_INTEGRATION_ID);
      expect(reAuthedRecord).toBeDefined();
      expect(reAuthedRecord.status).toBe(IntegrationStatus.ACTIVE);
      expect(reAuthedRecord.encryptedAccessToken).toBeTruthy();
      expect(reAuthedRecord.encryptedAccessToken).not.toBe('');
      // Verify dbStore has only one entry (not two)
      expect(dbStore.size).toBe(1);
    });
  });
});
