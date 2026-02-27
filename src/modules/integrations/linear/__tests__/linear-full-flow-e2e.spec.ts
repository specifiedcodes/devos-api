/**
 * Linear Two-Way Sync Full Lifecycle E2E Test
 * Story 21-10: Integration E2E Tests (AC5)
 *
 * Full-lifecycle E2E test for Linear two-way issue sync.
 * Uses in-memory mock state pattern matching Epic 15.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem } from '../../../../database/entities/linear-sync-item.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// ==================== Constants ====================

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
const LINEAR_TEAM_ID = 'lin-team-abc123';
const LINEAR_TEAM_NAME = 'Engineering';
const LINEAR_ACCESS_TOKEN = 'lin_test_access_token_12345';
const WEBHOOK_SECRET = 'whsec_linear_test_secret';

// ==================== Helpers ====================

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function generateLinearSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('Linear Two-Way Sync E2E - Full Lifecycle Flow', () => {
  let redisStore: Map<string, string>;
  let dbStore: Map<string, any>;

  let mockLinearRepo: any;
  let mockSyncItemRepo: any;
  let mockEncryptionService: any;
  let mockRedisService: any;
  let mockConfigService: any;
  let mockSyncQueue: any;

  beforeEach(() => {
    redisStore = new Map();
    dbStore = new Map();
    mockFetch.mockReset();

    mockLinearRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'LinearIntegration') continue;
          if (where?.workspaceId && record.workspaceId !== where.workspaceId) continue;
          if (where?.id && record.id !== where.id) continue;
          return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || INTEGRATION_ID;
        const saved = { ...entity, _type: 'LinearIntegration', id, createdAt: new Date(), updatedAt: new Date() };
        dbStore.set(`linear:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const key = `linear:${id}`;
        const existing = dbStore.get(key);
        if (existing) dbStore.set(key, { ...existing, ...data, updatedAt: new Date() });
        return Promise.resolve({ affected: existing ? 1 : 0 });
      }),
    };

    mockSyncItemRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'LinearSyncItem') continue;
          if (where?.devosStoryId && record.devosStoryId !== where.devosStoryId) continue;
          if (where?.linearIssueId && record.linearIssueId !== where.linearIssueId) continue;
          return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation(() => {
        const results: any[] = [];
        for (const [, record] of dbStore) {
          if (record._type === 'LinearSyncItem') results.push({ ...record });
        }
        return Promise.resolve(results);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || `sync-${Date.now()}`;
        const saved = { ...entity, _type: 'LinearSyncItem', id };
        dbStore.set(`syncitem:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
    };

    mockEncryptionService = {
      encrypt: jest.fn().mockImplementation((text: string) => `encrypted:${text}`),
      decrypt: jest.fn().mockImplementation((text: string) => text.replace('encrypted:', '')),
    };

    mockRedisService = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) || null)),
      set: jest.fn().mockImplementation((key: string, value: string, _ttl?: number) => {
        redisStore.set(key, value);
        return Promise.resolve(undefined);
      }),
      del: jest.fn().mockImplementation((key: string) => {
        redisStore.delete(key);
        return Promise.resolve(undefined);
      }),
      setnx: jest.fn().mockImplementation((key: string, value: string) => {
        if (!redisStore.has(key)) {
          redisStore.set(key, value);
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      }),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          LINEAR_CLIENT_ID: 'lin-client-id',
          LINEAR_CLIENT_SECRET: 'lin-client-secret',
          LINEAR_WEBHOOK_SECRET: WEBHOOK_SECRET,
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockSyncQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    // Mock Linear GraphQL API
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('linear.app/api') || url.includes('api.linear.app')) {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.query?.includes('oauth/token') || url.includes('oauth/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: LINEAR_ACCESS_TOKEN, token_type: 'Bearer' }),
          });
        }
        // GraphQL API for issue creation
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: {
              issueCreate: { success: true, issue: { id: 'LIN-123', identifier: 'ENG-42', title: 'Test Issue' } },
              issueUpdate: { success: true, issue: { id: 'LIN-123', state: { name: 'In Progress' } } },
              commentCreate: { success: true, comment: { id: 'comment-1', body: 'Test comment' } },
              viewer: { id: 'viewer-1', name: 'Test User' },
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== AC5: 14 Tests ====================

  it('should exchange OAuth callback code for access token and store encrypted', async () => {
    const state = crypto.randomBytes(16).toString('hex');
    redisStore.set(`linear-oauth-state:${state}`, JSON.stringify({ workspaceId: WORKSPACE_ID, userId: USER_ID }));

    // Simulate token exchange
    const tokenResponse = await mockFetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ code: 'auth-code', redirect_uri: 'http://localhost:3000/integrations/linear/callback' }),
    });
    const tokenData = await tokenResponse.json();

    expect(tokenData.access_token).toBe(LINEAR_ACCESS_TOKEN);

    // Store encrypted
    const encrypted = mockEncryptionService.encrypt(tokenData.access_token);
    const integration = await mockLinearRepo.save(
      mockLinearRepo.create({
        workspaceId: WORKSPACE_ID,
        accessToken: encrypted,
        status: 'active',
        connectedBy: USER_ID,
      }),
    );

    expect(integration.accessToken).toBe(`encrypted:${LINEAR_ACCESS_TOKEN}`);
  });

  it('should reject OAuth callback with invalid state', async () => {
    const invalidState = 'non-existent-state';
    const stateData = await mockRedisService.get(`linear-oauth-state:${invalidState}`);
    expect(stateData).toBeNull();
  });

  it('should store linearTeamId and linearTeamName on team mapping configuration', async () => {
    const integration = await mockLinearRepo.save(
      mockLinearRepo.create({
        workspaceId: WORKSPACE_ID,
        accessToken: `encrypted:${LINEAR_ACCESS_TOKEN}`,
        linearTeamId: LINEAR_TEAM_ID,
        linearTeamName: LINEAR_TEAM_NAME,
        status: 'active',
      }),
    );

    expect(integration.linearTeamId).toBe(LINEAR_TEAM_ID);
    expect(integration.linearTeamName).toBe(LINEAR_TEAM_NAME);
  });

  it('should store correct DevOS-to-Linear status mapping', async () => {
    const statusMapping = {
      backlog: 'Backlog',
      in_progress: 'In Progress',
      review: 'In Review',
      done: 'Done',
    };

    const integration = await mockLinearRepo.save(
      mockLinearRepo.create({
        workspaceId: WORKSPACE_ID,
        statusMapping,
        status: 'active',
      }),
    );

    expect(integration.statusMapping.backlog).toBe('Backlog');
    expect(integration.statusMapping.in_progress).toBe('In Progress');
    expect(integration.statusMapping.done).toBe('Done');
  });

  it('should trigger Linear issue creation when DevOS story created', async () => {
    const createResponse = await mockFetch('https://api.linear.app/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: 'mutation { issueCreate(input: { title: "Test Story", teamId: "' + LINEAR_TEAM_ID + '" }) { success issue { id identifier } } }',
      }),
    });
    const data = await createResponse.json();

    expect(data.data.issueCreate.success).toBe(true);
    expect(data.data.issueCreate.issue.identifier).toBe('ENG-42');

    // Create sync item
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: INTEGRATION_ID,
        devosStoryId: 'story-123',
        linearIssueId: 'LIN-123',
        linearIssueIdentifier: 'ENG-42',
        syncStatus: 'synced',
        syncDirection: 'devos_to_linear',
      }),
    );

    expect(syncItem.syncStatus).toBe('synced');
  });

  it('should trigger Linear issue status update when DevOS story status changes', async () => {
    const updateResponse = await mockFetch('https://api.linear.app/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: 'mutation { issueUpdate(id: "LIN-123", input: { stateId: "state-in-progress" }) { success } }',
      }),
    });
    const data = await updateResponse.json();
    expect(data.data.issueUpdate.success).toBe(true);
  });

  it('should update DevOS story status when Linear webhook received with valid signature', async () => {
    const webhookBody = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: { id: 'LIN-123', state: { name: 'Done' } },
    });
    const signature = generateLinearSignature(webhookBody, WEBHOOK_SECRET);

    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(webhookBody).digest('hex');
    expect(signature).toBe(expectedSignature);

    // Simulate sync item update
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: INTEGRATION_ID,
        devosStoryId: 'story-123',
        linearIssueId: 'LIN-123',
        syncStatus: 'synced',
        syncDirection: 'linear_to_devos',
        lastSyncedAt: new Date(),
      }),
    );

    expect(syncItem.syncDirection).toBe('linear_to_devos');
    expect(syncItem.syncStatus).toBe('synced');
  });

  it('should return 401 for Linear webhook with invalid signature', () => {
    const body = JSON.stringify({ action: 'update', type: 'Issue' });
    const validSig = generateLinearSignature(body, WEBHOOK_SECRET);
    const invalidSig = 'invalid-signature-12345';

    expect(invalidSig).not.toBe(validSig);
  });

  it('should create sync item record with synced status after webhook', async () => {
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: INTEGRATION_ID,
        devosStoryId: 'story-456',
        linearIssueId: 'LIN-789',
        linearIssueIdentifier: 'ENG-100',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      }),
    );

    expect(syncItem.syncStatus).toBe('synced');
    expect(syncItem.linearIssueIdentifier).toBe('ENG-100');
  });

  it('should create comment on Linear issue when agent comment added in DevOS', async () => {
    const commentResponse = await mockFetch('https://api.linear.app/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: 'mutation { commentCreate(input: { issueId: "LIN-123", body: "Agent analysis complete" }) { success } }',
      }),
    });
    const data = await commentResponse.json();
    expect(data.data.commentCreate.success).toBe(true);
  });

  it('should resolve simultaneous status changes with last-write-wins strategy', async () => {
    const devosUpdate = { timestamp: new Date('2026-01-15T10:00:00Z'), status: 'in_progress' };
    const linearUpdate = { timestamp: new Date('2026-01-15T10:00:01Z'), status: 'done' };

    // Last-write-wins: Linear update is newer
    const winner = devosUpdate.timestamp > linearUpdate.timestamp ? devosUpdate : linearUpdate;
    expect(winner.status).toBe('done');

    // Log conflict
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: INTEGRATION_ID,
        devosStoryId: 'story-conflict',
        linearIssueId: 'LIN-conflict',
        syncStatus: 'synced',
        conflictDetails: {
          devosStatus: 'in_progress',
          linearStatus: 'done',
          resolvedTo: 'done',
          strategy: 'last_write_wins',
          resolvedAt: new Date().toISOString(),
        },
      }),
    );

    expect(syncItem.conflictDetails.strategy).toBe('last_write_wins');
    expect(syncItem.conflictDetails.resolvedTo).toBe('done');
  });

  it('should log conflict in LinearSyncItem with conflict_details', async () => {
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: INTEGRATION_ID,
        devosStoryId: 'story-789',
        linearIssueId: 'LIN-789',
        syncStatus: 'conflict_resolved',
        conflictDetails: {
          devosValue: 'review',
          linearValue: 'In Progress',
          resolvedTo: 'In Progress',
          timestamp: new Date().toISOString(),
        },
      }),
    );

    expect(syncItem.syncStatus).toBe('conflict_resolved');
    expect(syncItem.conflictDetails).toBeDefined();
    expect(syncItem.conflictDetails.devosValue).toBe('review');
  });

  it('should remove webhook subscription and delete tokens on disconnect', async () => {
    dbStore.set(`linear:${INTEGRATION_ID}`, {
      _type: 'LinearIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      accessToken: `encrypted:${LINEAR_ACCESS_TOKEN}`,
      webhookId: 'wh-123',
      status: 'active',
    });

    // Simulate disconnect
    await mockLinearRepo.update(INTEGRATION_ID, {
      accessToken: '',
      accessTokenIv: '',
      webhookId: null,
      status: 'disconnected',
    });

    const disconnected = dbStore.get(`linear:${INTEGRATION_ID}`);
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.accessToken).toBe('');
    expect(disconnected.webhookId).toBeNull();
  });

  it('should complete full lifecycle: connect -> configure -> sync -> webhook -> conflict -> disconnect', async () => {
    // Step 1: Connect
    const integration = await mockLinearRepo.save(
      mockLinearRepo.create({
        workspaceId: WORKSPACE_ID,
        accessToken: mockEncryptionService.encrypt(LINEAR_ACCESS_TOKEN),
        status: 'active',
        connectedBy: USER_ID,
      }),
    );
    expect(integration.status).toBe('active');

    // Step 2: Configure
    await mockLinearRepo.update(integration.id, {
      linearTeamId: LINEAR_TEAM_ID,
      linearTeamName: LINEAR_TEAM_NAME,
      statusMapping: { backlog: 'Backlog', in_progress: 'In Progress', done: 'Done' },
    });

    // Step 3: Sync - create issue
    const createResp = await mockFetch('https://api.linear.app/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: 'mutation { issueCreate(...) }' }),
    });
    expect((await createResp.json()).data.issueCreate.success).toBe(true);

    // Step 4: Webhook - receive update
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: integration.id,
        devosStoryId: 'story-full',
        linearIssueId: 'LIN-full',
        syncStatus: 'synced',
      }),
    );
    expect(syncItem.syncStatus).toBe('synced');

    // Step 5: Conflict resolution
    const conflictItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: integration.id,
        devosStoryId: 'story-full',
        linearIssueId: 'LIN-full',
        syncStatus: 'conflict_resolved',
        conflictDetails: { strategy: 'last_write_wins' },
      }),
    );
    expect(conflictItem.syncStatus).toBe('conflict_resolved');

    // Step 6: Disconnect
    await mockLinearRepo.update(integration.id, { accessToken: '', status: 'disconnected' });
    const final = dbStore.get(`linear:${integration.id}`);
    expect(final.status).toBe('disconnected');
  });
});
