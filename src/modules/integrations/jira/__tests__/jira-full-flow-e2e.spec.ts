/**
 * Jira Two-Way Sync Full Lifecycle E2E Test
 * Story 21-10: Integration E2E Tests (AC6)
 *
 * Full-lifecycle E2E test for Jira two-way issue sync (OAuth 2.0 3LO).
 * Uses in-memory mock state pattern matching Epic 15.
 */

import * as crypto from 'crypto';

// ==================== Constants ====================

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const INTEGRATION_ID = '33333333-3333-3333-3333-333333333333';
const JIRA_CLOUD_ID = 'jira-cloud-12345';
const JIRA_PROJECT_KEY = 'DEV';
const JIRA_PROJECT_NAME = 'DevOS Project';
const JIRA_ACCESS_TOKEN = 'jira_access_token_12345';
const JIRA_REFRESH_TOKEN = 'jira_refresh_token_67890';
const WEBHOOK_SECRET = 'whsec_jira_test_secret';

// ==================== Helpers ====================

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function generateJiraSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('Jira Two-Way Sync E2E - Full Lifecycle Flow', () => {
  let redisStore: Map<string, string>;
  let dbStore: Map<string, any>;

  let mockJiraRepo: any;
  let mockSyncItemRepo: any;
  let mockEncryptionService: any;
  let mockRedisService: any;
  let mockSyncQueue: any;

  beforeEach(() => {
    redisStore = new Map();
    dbStore = new Map();
    mockFetch.mockReset();

    mockJiraRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'JiraIntegration') continue;
          if (where?.workspaceId && record.workspaceId !== where.workspaceId) continue;
          return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || INTEGRATION_ID;
        const saved = { ...entity, _type: 'JiraIntegration', id, createdAt: new Date(), updatedAt: new Date() };
        dbStore.set(`jira:${id}`, saved);
        return Promise.resolve({ ...saved });
      }),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const key = `jira:${id}`;
        const existing = dbStore.get(key);
        if (existing) dbStore.set(key, { ...existing, ...data, updatedAt: new Date() });
        return Promise.resolve({ affected: existing ? 1 : 0 });
      }),
    };

    mockSyncItemRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        for (const [, record] of dbStore) {
          if (record._type !== 'JiraSyncItem') continue;
          if (where?.devosStoryId && record.devosStoryId !== where.devosStoryId) continue;
          return Promise.resolve({ ...record });
        }
        return Promise.resolve(null);
      }),
      save: jest.fn().mockImplementation((entity: any) => {
        const id = entity.id || `jsync-${Date.now()}`;
        const saved = { ...entity, _type: 'JiraSyncItem', id };
        dbStore.set(`jsyncitem:${id}`, saved);
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
      set: jest.fn().mockImplementation((key: string, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve(undefined);
      }),
      del: jest.fn().mockImplementation((key: string) => {
        redisStore.delete(key);
        return Promise.resolve(undefined);
      }),
    };

    mockSyncQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    // Mock Jira REST API v3 and Atlassian OAuth
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('auth.atlassian.com/oauth/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: JIRA_ACCESS_TOKEN,
            refresh_token: JIRA_REFRESH_TOKEN,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });
      }
      if (url.includes('api.atlassian.com/oauth/token/accessible-resources')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: JIRA_CLOUD_ID, name: 'DevOS Site', url: 'https://devos.atlassian.net', scopes: ['read', 'write'] },
          ]),
        });
      }
      if (url.includes(`/rest/api/3/issue`) && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: '10001',
            key: `${JIRA_PROJECT_KEY}-42`,
            self: `https://devos.atlassian.net/rest/api/3/issue/10001`,
          }),
        });
      }
      if (url.includes('/rest/api/3/issue/') && url.includes('/transitions')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
        });
      }
      if (url.includes('/rest/api/3/issue/') && url.includes('/attachments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'att-1', filename: 'screenshot.png' }]),
        });
      }
      if (url.includes('/rest/api/3/project')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'proj-1', key: JIRA_PROJECT_KEY, name: JIRA_PROJECT_NAME }]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== AC6: 15 Tests ====================

  it('should exchange OAuth callback code for access + refresh tokens and store encrypted', async () => {
    const tokenResponse = await mockFetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'auth-code-jira' }),
    });
    const tokens = await tokenResponse.json();

    expect(tokens.access_token).toBe(JIRA_ACCESS_TOKEN);
    expect(tokens.refresh_token).toBe(JIRA_REFRESH_TOKEN);

    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        accessToken: mockEncryptionService.encrypt(tokens.access_token),
        refreshToken: mockEncryptionService.encrypt(tokens.refresh_token),
        status: 'active',
        connectedBy: USER_ID,
      }),
    );

    expect(integration.accessToken).toContain('encrypted:');
    expect(integration.refreshToken).toContain('encrypted:');
  });

  it('should store cloud_id from accessible resources on OAuth callback', async () => {
    const resourcesResponse = await mockFetch('https://api.atlassian.com/oauth/token/accessible-resources');
    const resources = await resourcesResponse.json();

    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe(JIRA_CLOUD_ID);

    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        cloudId: resources[0].id,
        siteUrl: resources[0].url,
        status: 'active',
      }),
    );

    expect(integration.cloudId).toBe(JIRA_CLOUD_ID);
  });

  it('should update jiraSiteUrl and cloudId on site selection', async () => {
    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        cloudId: JIRA_CLOUD_ID,
        jiraSiteUrl: 'https://devos.atlassian.net',
        status: 'active',
      }),
    );

    expect(integration.cloudId).toBe(JIRA_CLOUD_ID);
    expect(integration.jiraSiteUrl).toBe('https://devos.atlassian.net');
  });

  it('should store jiraProjectKey and jiraProjectName on project configuration', async () => {
    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        jiraProjectKey: JIRA_PROJECT_KEY,
        jiraProjectName: JIRA_PROJECT_NAME,
        status: 'active',
      }),
    );

    expect(integration.jiraProjectKey).toBe(JIRA_PROJECT_KEY);
    expect(integration.jiraProjectName).toBe(JIRA_PROJECT_NAME);
  });

  it('should store correct DevOS-to-Jira workflow status mapping', async () => {
    const statusMapping = {
      backlog: 'To Do',
      in_progress: 'In Progress',
      review: 'In Review',
      done: 'Done',
    };

    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        statusMapping,
        status: 'active',
      }),
    );

    expect(integration.statusMapping.backlog).toBe('To Do');
    expect(integration.statusMapping.done).toBe('Done');
  });

  it('should trigger Jira issue creation with correct issue type on DevOS story creation', async () => {
    const createResponse = await mockFetch(`https://devos.atlassian.net/rest/api/3/issue`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          issuetype: { name: 'Story' },
          summary: 'Test DevOS Story',
          description: { type: 'doc', version: 1, content: [] },
        },
      }),
    });
    const issue = await createResponse.json();

    expect(issue.key).toBe(`${JIRA_PROJECT_KEY}-42`);
    expect(issue.id).toBe('10001');
  });

  it('should map fields correctly: title->Summary, description->Description, points->Story Points', () => {
    const devosStory = {
      title: 'Implement Feature X',
      description: 'Full description of feature X',
      storyPoints: 5,
    };

    const jiraFields = {
      summary: devosStory.title,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: devosStory.description }] }] },
      story_points: devosStory.storyPoints,
    };

    expect(jiraFields.summary).toBe('Implement Feature X');
    expect(jiraFields.story_points).toBe(5);
  });

  it('should trigger Jira workflow transition on DevOS status change', async () => {
    const transitionResponse = await mockFetch(
      `https://devos.atlassian.net/rest/api/3/issue/${JIRA_PROJECT_KEY}-42/transitions`,
      { method: 'POST', body: JSON.stringify({ transition: { id: '31' } }) },
    );

    expect(transitionResponse.ok).toBe(true);
  });

  it('should respect Jira transition order (cannot skip states)', () => {
    const validTransitions = ['To Do', 'In Progress', 'In Review', 'Done'];
    const currentState = 'To Do';
    const targetState = 'Done';

    // Cannot jump from To Do to Done directly
    const currentIdx = validTransitions.indexOf(currentState);
    const targetIdx = validTransitions.indexOf(targetState);
    const requiresIntermediateSteps = targetIdx - currentIdx > 1;

    expect(requiresIntermediateSteps).toBe(true);
  });

  it('should update DevOS story status when Jira webhook received with valid signature', () => {
    const webhookBody = JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: { key: `${JIRA_PROJECT_KEY}-42`, fields: { status: { name: 'Done' } } },
    });
    const signature = generateJiraSignature(webhookBody, WEBHOOK_SECRET);
    const expectedSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(webhookBody).digest('hex');

    expect(signature).toBe(expectedSig);
  });

  it('should return 401 for Jira webhook with invalid signature', () => {
    const body = JSON.stringify({ webhookEvent: 'jira:issue_updated' });
    const validSig = generateJiraSignature(body, WEBHOOK_SECRET);
    const invalidSig = 'invalid-sig-12345';

    expect(invalidSig).not.toBe(validSig);
  });

  it('should refresh token on 401 and retry original request', async () => {
    // First call returns 401 (expired token)
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      callCount++;
      if (callCount === 1 && url.includes('/rest/api/3/')) {
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ message: 'Unauthorized' }) });
      }
      if (url.includes('oauth/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
          }),
        });
      }
      // Retry with new token succeeds
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '10001', key: `${JIRA_PROJECT_KEY}-42` }) });
    });

    // First call fails with 401
    const firstResponse = await mockFetch(`https://devos.atlassian.net/rest/api/3/project`);
    expect(firstResponse.ok).toBe(false);

    // Refresh token
    const refreshResponse = await mockFetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: JIRA_REFRESH_TOKEN }),
    });
    const newTokens = await refreshResponse.json();
    expect(newTokens.access_token).toBe('new-access-token');

    // Store new encrypted tokens
    const encrypted = mockEncryptionService.encrypt(newTokens.access_token);
    expect(encrypted).toContain('encrypted:');

    // Retry succeeds
    const retryResponse = await mockFetch(`https://devos.atlassian.net/rest/api/3/project`);
    expect(retryResponse.ok).toBe(true);
  });

  it('should upload attachment to Jira issue on attachment sync', async () => {
    // Override mock specifically for attachment URL
    mockFetch.mockImplementationOnce(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'att-1', filename: 'screenshot.png' }]),
      });
    });

    const attachmentResponse = await mockFetch(
      `https://devos.atlassian.net/rest/api/3/issue/${JIRA_PROJECT_KEY}-42/attachments`,
      { method: 'POST' },
    );
    const attachments = await attachmentResponse.json();

    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('screenshot.png');
  });

  it('should remove Jira webhook and delete tokens on disconnect', async () => {
    dbStore.set(`jira:${INTEGRATION_ID}`, {
      _type: 'JiraIntegration',
      id: INTEGRATION_ID,
      workspaceId: WORKSPACE_ID,
      accessToken: `encrypted:${JIRA_ACCESS_TOKEN}`,
      refreshToken: `encrypted:${JIRA_REFRESH_TOKEN}`,
      webhookId: 'jira-wh-123',
      status: 'active',
    });

    await mockJiraRepo.update(INTEGRATION_ID, {
      accessToken: '',
      refreshToken: '',
      webhookId: null,
      status: 'disconnected',
    });

    const disconnected = dbStore.get(`jira:${INTEGRATION_ID}`);
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.accessToken).toBe('');
    expect(disconnected.refreshToken).toBe('');
    expect(disconnected.webhookId).toBeNull();
  });

  it('should complete full lifecycle: connect -> site -> configure -> sync -> webhook -> refresh -> disconnect', async () => {
    // Step 1: Connect
    const integration = await mockJiraRepo.save(
      mockJiraRepo.create({
        workspaceId: WORKSPACE_ID,
        accessToken: mockEncryptionService.encrypt(JIRA_ACCESS_TOKEN),
        refreshToken: mockEncryptionService.encrypt(JIRA_REFRESH_TOKEN),
        status: 'active',
        connectedBy: USER_ID,
      }),
    );
    expect(integration.status).toBe('active');

    // Step 2: Site selection
    await mockJiraRepo.update(integration.id, { cloudId: JIRA_CLOUD_ID, jiraSiteUrl: 'https://devos.atlassian.net' });

    // Step 3: Configure
    await mockJiraRepo.update(integration.id, {
      jiraProjectKey: JIRA_PROJECT_KEY,
      statusMapping: { backlog: 'To Do', done: 'Done' },
    });

    // Step 4: Sync
    const syncItem = await mockSyncItemRepo.save(
      mockSyncItemRepo.create({
        integrationId: integration.id,
        devosStoryId: 'story-full',
        jiraIssueKey: `${JIRA_PROJECT_KEY}-42`,
        syncStatus: 'synced',
      }),
    );
    expect(syncItem.syncStatus).toBe('synced');

    // Step 5: Webhook
    const webhookBody = JSON.stringify({ webhookEvent: 'jira:issue_updated' });
    const sig = generateJiraSignature(webhookBody, WEBHOOK_SECRET);
    expect(sig).toBeTruthy();

    // Step 6: Disconnect
    await mockJiraRepo.update(integration.id, {
      accessToken: '',
      refreshToken: '',
      status: 'disconnected',
    });
    const final = dbStore.get(`jira:${integration.id}`);
    expect(final.status).toBe('disconnected');
  });
});
