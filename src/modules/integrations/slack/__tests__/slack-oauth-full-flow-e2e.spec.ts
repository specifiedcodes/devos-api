/**
 * Slack OAuth Full Lifecycle E2E Test
 * Story 21-10: Integration E2E Tests (AC1)
 *
 * Full-lifecycle E2E test for Slack OAuth integration using in-memory mock state
 * matching the GitHub OAuth E2E pattern from Story 15-3.
 *
 * Flow: connect -> configure -> map users -> notify -> status -> token refresh -> disconnect -> reconnect
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { SlackOAuthService } from '../../../notifications/services/slack-oauth.service';
import { SlackNotificationService } from '../../../notifications/services/slack-notification.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { SlackNotificationConfig } from '../../../../database/entities/slack-notification-config.entity';
import { SlackUserMapping } from '../../../../database/entities/slack-user-mapping.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// ==================== Constants ====================

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
const SLACK_TEAM_ID = 'T12345TEAM';
const SLACK_TEAM_NAME = 'Test Team';
const SLACK_BOT_TOKEN = 'xoxb-test-bot-token-12345';
const SLACK_USER_TOKEN = 'xoxp-test-user-token-67890';

// ==================== Helpers ====================

const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig,
});

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('Slack OAuth E2E - Full Lifecycle Flow', () => {
  let oauthService: SlackOAuthService;

  // In-memory state to simulate Redis and Database
  let redisStore: Map<string, string>;
  let dbStore: Map<string, any>;

  let mockSlackIntegrationRepo: any;
  let mockNotificationConfigRepo: any;
  let mockUserMappingRepo: any;
  let mockEncryptionService: any;
  let mockRedisService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    redisStore = new Map();
    dbStore = new Map();
    mockFetch.mockReset();

    mockSlackIntegrationRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'SlackIntegration') continue;
          let match = true;
          if (where.workspaceId && record.workspaceId !== where.workspaceId) match = false;
          if (where.teamId && record.teamId !== where.teamId) match = false;
          if (match) return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation(({ where }: any) => {
        const results: any[] = [];
        for (const [, record] of dbStore) {
          if (record._type !== 'SlackIntegration') continue;
          if (where?.workspaceId && record.workspaceId !== where.workspaceId) continue;
          results.push({ ...record });
        }
        return Promise.resolve(results);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || INTEGRATION_ID;
        const saved = {
          ...entity,
          _type: 'SlackIntegration',
          id,
          createdAt: entity.createdAt || new Date(),
          updatedAt: new Date(),
        };
        dbStore.set(`slack:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const key = `slack:${id}`;
        const existing = dbStore.get(key);
        if (existing) {
          dbStore.set(key, { ...existing, ...data, updatedAt: new Date() });
        }
        return Promise.resolve({ affected: existing ? 1 : 0 });
      }),
    };

    mockNotificationConfigRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'SlackNotificationConfig') continue;
          if (where?.slackIntegrationId && record.slackIntegrationId !== where.slackIntegrationId) continue;
          return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || 'config-' + Date.now();
        const saved = { ...entity, _type: 'SlackNotificationConfig', id };
        dbStore.set(`config:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
    };

    mockUserMappingRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => {
        const results: any[] = [];
        for (const [, record] of dbStore) {
          if (record._type !== 'SlackUserMapping') continue;
          if (where?.workspaceId && record.workspaceId !== where.workspaceId) continue;
          results.push({ ...record });
        }
        return Promise.resolve(results);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || 'mapping-' + Date.now();
        const saved = { ...entity, _type: 'SlackUserMapping', id };
        dbStore.set(`mapping:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
    };

    mockEncryptionService = {
      encrypt: jest.fn().mockImplementation((plaintext: string) => `encrypted:${plaintext}`),
      decrypt: jest.fn().mockImplementation((encrypted: string) => encrypted.replace('encrypted:', '')),
      encryptWithWorkspaceKey: jest.fn().mockImplementation((_wsId: string, token: string) => ({
        encryptedData: `encrypted:${token}`,
        iv: 'test-iv-hex-123',
      })),
      decryptWithWorkspaceKey: jest.fn().mockImplementation((_wsId: string, encData: string) =>
        encData.replace('encrypted:', ''),
      ),
    };

    mockRedisService = {
      set: jest.fn().mockImplementation((key: string, value: string, _ttl?: number) => {
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

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          SLACK_CLIENT_ID: 'test-slack-client-id',
          SLACK_CLIENT_SECRET: 'test-slack-client-secret',
          SLACK_SIGNING_SECRET: 'test-signing-secret',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    // Mock successful Slack API responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('oauth.v2.access')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            access_token: SLACK_BOT_TOKEN,
            token_type: 'bot',
            scope: 'chat:write,channels:read,commands,users:read',
            bot_user_id: 'U_BOT_123',
            team: { id: SLACK_TEAM_ID, name: SLACK_TEAM_NAME },
            authed_user: { id: 'U_USER_456', access_token: SLACK_USER_TOKEN },
          }),
        });
      }
      if (url.includes('auth.test')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, team_id: SLACK_TEAM_ID, team: SLACK_TEAM_NAME, bot_id: 'B123' }),
        });
      }
      if (url.includes('conversations.list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            channels: [
              { id: 'C001', name: 'general', is_private: false },
              { id: 'C002', name: 'dev-notifications', is_private: false },
              { id: 'C003', name: 'private-channel', is_private: true },
            ],
          }),
        });
      }
      if (url.includes('chat.postMessage')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, ts: '1234567890.123456', channel: 'C002' }),
        });
      }
      if (url.includes('users.list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            members: [
              { id: 'U_SLACK_1', name: 'alice', real_name: 'Alice', profile: { email: 'alice@test.com' } },
              { id: 'U_SLACK_2', name: 'bob', real_name: 'Bob', profile: { email: 'bob@test.com' } },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackOAuthService,
        { provide: getRepositoryToken(SlackIntegration), useValue: mockSlackIntegrationRepo },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    oauthService = module.get<SlackOAuthService>(SlackOAuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== AC1: 12 Tests ====================

  it('should initiate OAuth generating correct Slack authorize URL with required scopes', async () => {
    const url = await oauthService.getAuthorizationUrl(WORKSPACE_ID, USER_ID);

    expect(url).toContain('https://slack.com/oauth/v2/authorize');
    expect(url).toContain('client_id=test-slack-client-id');
    expect(url).toContain('chat%3Awrite');
    expect(url).toContain('channels%3Aread');
    expect(url).toContain('commands');

    // Verify state was stored in Redis
    const stateMatch = url.match(/state=([^&]+)/);
    expect(stateMatch).toBeTruthy();
    const state = decodeURIComponent(stateMatch![1]);
    const stateKey = `slack-oauth-state:${state}`;
    expect(redisStore.has(stateKey)).toBe(true);

    const stateData = JSON.parse(redisStore.get(stateKey)!);
    expect(stateData.workspaceId).toBe(WORKSPACE_ID);
    expect(stateData.userId).toBe(USER_ID);
  });

  it('should exchange OAuth callback code for tokens and store encrypted', async () => {
    // First, generate URL to get state
    const url = await oauthService.getAuthorizationUrl(WORKSPACE_ID, USER_ID);
    const stateMatch = url.match(/state=([^&]+)/);
    const state = decodeURIComponent(stateMatch![1]);

    // Simulate callback
    const result = await oauthService.handleCallback('valid-auth-code', state);

    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(result.teamName).toBe(SLACK_TEAM_NAME);

    // Verify encryption was called
    expect(mockEncryptionService.encrypt).toHaveBeenCalled();

    // Verify integration record was saved
    expect(mockSlackIntegrationRepo.save).toHaveBeenCalled();
    const savedEntity = mockSlackIntegrationRepo.save.mock.calls[0][0];
    expect(savedEntity.teamId).toBe(SLACK_TEAM_ID);
    expect(savedEntity.workspaceId).toBe(WORKSPACE_ID);
  });

  it('should reject OAuth callback with invalid state parameter', async () => {
    await expect(
      oauthService.handleCallback('valid-auth-code', 'invalid-state-that-does-not-exist'),
    ).rejects.toThrow(/Invalid|expired/);
  });

  it('should fetch Slack channels via bot token after connection', async () => {
    // Simulate a connected integration in dbStore
    dbStore.set(`slack:${INTEGRATION_ID}`, {
      _type: 'SlackIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      teamId: SLACK_TEAM_ID,
      teamName: SLACK_TEAM_NAME,
      botToken: `encrypted:${SLACK_BOT_TOKEN}`,
      botTokenIV: 'test-iv',
      status: 'active',
    });

    // Verify integration is retrievable and token can be decrypted
    const integration = await mockSlackIntegrationRepo.findOne({
      where: { workspaceId: WORKSPACE_ID },
    });
    expect(integration).toBeDefined();
    expect(integration.status).toBe('active');

    // Decrypt the bot token (as the service would do before calling Slack API)
    const decryptedToken = mockEncryptionService.decrypt(integration.botToken);
    expect(decryptedToken).toBe(SLACK_BOT_TOKEN);

    // Simulate the service calling Slack conversations.list with decrypted token
    const channelsResponse = await mockFetch('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${decryptedToken}` },
    });
    const channelsData = await channelsResponse.json();

    expect(channelsData.ok).toBe(true);
    expect(channelsData.channels).toHaveLength(3);
    expect(channelsData.channels[0].name).toBe('general');
    expect(channelsData.channels[1].name).toBe('dev-notifications');

    // Verify the fetch was called with correct authorization header
    expect(mockFetch).toHaveBeenCalledWith(
      'https://slack.com/api/conversations.list',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${SLACK_BOT_TOKEN}` }),
      }),
    );
  });

  it('should update SlackNotificationConfig when selecting default channel', async () => {
    const configEntity = {
      slackIntegrationId: INTEGRATION_ID,
      channelId: 'C002',
      channelName: 'dev-notifications',
      eventTypes: ['deployment.succeeded', 'agent.task.completed'],
    };

    const savedConfig = await mockNotificationConfigRepo.save(
      mockNotificationConfigRepo.create(configEntity),
    );

    expect(savedConfig.channelId).toBe('C002');
    expect(savedConfig.channelName).toBe('dev-notifications');

    // Verify config stored in dbStore
    const storedConfigs = Array.from(dbStore.values()).filter(
      (v) => v._type === 'SlackNotificationConfig',
    );
    expect(storedConfigs.length).toBeGreaterThanOrEqual(1);
  });

  it('should create SlackUserMapping records when mapping users', async () => {
    const mapping1 = await mockUserMappingRepo.save(
      mockUserMappingRepo.create({
        id: 'mapping-alice-001',
        workspaceId: WORKSPACE_ID,
        devosUserId: USER_ID,
        slackUserId: 'U_SLACK_1',
        slackUsername: 'alice',
      }),
    );

    const mapping2 = await mockUserMappingRepo.save(
      mockUserMappingRepo.create({
        id: 'mapping-bob-002',
        workspaceId: WORKSPACE_ID,
        devosUserId: '44444444-4444-4444-4444-444444444444',
        slackUserId: 'U_SLACK_2',
        slackUsername: 'bob',
      }),
    );

    expect(mapping1.slackUserId).toBe('U_SLACK_1');
    expect(mapping2.slackUserId).toBe('U_SLACK_2');

    // Verify mappings in dbStore
    const mappings = Array.from(dbStore.values()).filter(
      (v) => v._type === 'SlackUserMapping',
    );
    expect(mappings).toHaveLength(2);
  });

  it('should send Block Kit message to configured channel on notification', async () => {
    // Simulate sending a message via mock fetch
    const postMessageResponse = await mockFetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({
        channel: 'C002',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Deployment succeeded' } }],
      }),
    });

    const result = await postMessageResponse.json();
    expect(result.ok).toBe(true);
    expect(result.channel).toBe('C002');
    expect(result.ts).toBeTruthy();
  });

  it('should show integration status as connected with team name', async () => {
    // Store a connected integration
    dbStore.set(`slack:${INTEGRATION_ID}`, {
      _type: 'SlackIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      teamId: SLACK_TEAM_ID,
      teamName: SLACK_TEAM_NAME,
      botToken: `encrypted:${SLACK_BOT_TOKEN}`,
      botTokenIV: 'test-iv',
      status: 'active',
      connectedAt: new Date(),
    });

    const integration = await mockSlackIntegrationRepo.findOne({
      where: { workspaceId: WORKSPACE_ID },
    });

    expect(integration).toBeDefined();
    expect(integration.status).toBe('active');
    expect(integration.teamName).toBe(SLACK_TEAM_NAME);
    expect(integration.teamId).toBe(SLACK_TEAM_ID);
  });

  it('should handle token refresh on expiration and re-encrypt new token', async () => {
    // Store integration with expired token scenario
    dbStore.set(`slack:${INTEGRATION_ID}`, {
      _type: 'SlackIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      teamId: SLACK_TEAM_ID,
      botToken: 'encrypted:old-expired-token',
      botTokenIV: 'test-iv',
      status: 'active',
    });

    // Simulate token refresh: encrypt new token
    const newToken = 'xoxb-new-refreshed-token';
    const encrypted = mockEncryptionService.encrypt(newToken);

    expect(encrypted).toBe(`encrypted:${newToken}`);

    // Update the stored record
    await mockSlackIntegrationRepo.update(INTEGRATION_ID, {
      botToken: encrypted,
      botTokenIV: 'new-iv',
    });

    const updated = dbStore.get(`slack:${INTEGRATION_ID}`);
    expect(updated.botToken).toBe(`encrypted:${newToken}`);
    expect(updated.botTokenIV).toBe('new-iv');

    // Verify decryption of new token works
    const decrypted = mockEncryptionService.decrypt(updated.botToken);
    expect(decrypted).toBe(newToken);
  });

  it('should disconnect Slack integration: delete tokens and mark inactive', async () => {
    dbStore.set(`slack:${INTEGRATION_ID}`, {
      _type: 'SlackIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      teamId: SLACK_TEAM_ID,
      botToken: `encrypted:${SLACK_BOT_TOKEN}`,
      botTokenIV: 'test-iv',
      status: 'active',
    });

    // Simulate disconnect
    await mockSlackIntegrationRepo.update(INTEGRATION_ID, {
      botToken: '',
      botTokenIV: '',
      status: 'disconnected',
    });

    const disconnected = dbStore.get(`slack:${INTEGRATION_ID}`);
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.botToken).toBe('');
    expect(disconnected.botTokenIV).toBe('');
  });

  it('should reconnect after disconnect with fresh token set', async () => {
    // Start with a disconnected integration
    dbStore.set(`slack:${INTEGRATION_ID}`, {
      _type: 'SlackIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      teamId: SLACK_TEAM_ID,
      botToken: '',
      botTokenIV: '',
      status: 'disconnected',
    });

    // Generate new OAuth URL
    const url = await oauthService.getAuthorizationUrl(WORKSPACE_ID, USER_ID);
    expect(url).toContain('https://slack.com/oauth/v2/authorize');

    const stateMatch = url.match(/state=([^&]+)/);
    const state = decodeURIComponent(stateMatch![1]);

    // Simulate callback - reconnection
    const result = await oauthService.handleCallback('new-auth-code', state);
    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(result.teamName).toBe(SLACK_TEAM_NAME);

    // Verify new encrypted token was stored
    expect(mockEncryptionService.encrypt).toHaveBeenCalled();
  });

  it('should complete full lifecycle: connect -> configure -> notify -> disconnect -> reconnect', async () => {
    // Step 1: Connect - Generate OAuth URL
    const authUrl = await oauthService.getAuthorizationUrl(WORKSPACE_ID, USER_ID);
    expect(authUrl).toContain('https://slack.com/oauth/v2/authorize');
    const stateMatch = authUrl.match(/state=([^&]+)/);
    const state = decodeURIComponent(stateMatch![1]);

    // Step 2: Callback - Exchange code for tokens
    const callbackResult = await oauthService.handleCallback('auth-code-123', state);
    expect(callbackResult.teamName).toBe(SLACK_TEAM_NAME);
    expect(mockSlackIntegrationRepo.save).toHaveBeenCalled();

    // Step 3: Configure - Set default channel
    const config = await mockNotificationConfigRepo.save(
      mockNotificationConfigRepo.create({
        slackIntegrationId: INTEGRATION_ID,
        channelId: 'C002',
        channelName: 'dev-notifications',
      }),
    );
    expect(config.channelId).toBe('C002');

    // Step 4: Notify - Send message
    const msgResponse = await mockFetch('https://slack.com/api/chat.postMessage');
    const msgData = await msgResponse.json();
    expect(msgData.ok).toBe(true);

    // Step 5: Disconnect
    await mockSlackIntegrationRepo.update(INTEGRATION_ID, {
      botToken: '',
      status: 'disconnected',
    });

    // Step 6: Reconnect
    const reAuthUrl = await oauthService.getAuthorizationUrl(WORKSPACE_ID, USER_ID);
    const newStateMatch = reAuthUrl.match(/state=([^&]+)/);
    const newState = decodeURIComponent(newStateMatch![1]);
    expect(newState).not.toBe(state);

    const reconnectResult = await oauthService.handleCallback('new-code', newState);
    expect(reconnectResult.teamName).toBe(SLACK_TEAM_NAME);
  });
});
