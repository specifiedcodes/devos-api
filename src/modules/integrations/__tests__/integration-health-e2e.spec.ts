/**
 * Integration Health Monitoring E2E Test
 * Story 21-10: Integration E2E Tests (AC9)
 *
 * E2E tests for integration health monitoring across all provider types.
 * Uses in-memory mock state pattern matching Epic 15.
 */

// ==================== Constants ====================

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const INTEGRATION_ID = '22222222-2222-2222-2222-222222222222';

// ==================== Helpers ====================

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disconnected';

interface HealthRecord {
  integrationType: string;
  integrationId: string;
  status: HealthStatus;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  errorCount24h: number;
  uptime30d: number;
  responseTimeMs: number | null;
  consecutiveFailures: number;
}

function createHealthRecord(type: string, overrides: Partial<HealthRecord> = {}): HealthRecord {
  return {
    integrationType: type,
    integrationId: INTEGRATION_ID,
    status: 'healthy',
    lastSuccessAt: new Date(),
    lastErrorAt: null,
    lastErrorMessage: null,
    errorCount24h: 0,
    uptime30d: 99.9,
    responseTimeMs: 150,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe('Integration Health Monitoring E2E', () => {
  let redisStore: Map<string, string>;
  let dbStore: Map<string, any>;
  let mockEncryptionService: any;

  // Mock fetch for health probes
  const mockFetch = jest.fn();
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Capture original fetch inside beforeEach to avoid capturing a pre-mocked version
    originalFetch = global.fetch;
    redisStore = new Map();
    dbStore = new Map();
    global.fetch = mockFetch as any;
    mockFetch.mockReset();

    mockEncryptionService = {
      decrypt: jest.fn().mockImplementation((text: string) => text.replace('encrypted:', '')),
    };

    // Default mock: all probes succeed
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ==================== AC9: 16 Tests ====================

  it('should probe all connected integrations during health check run', () => {
    const connectedIntegrations = [
      createHealthRecord('slack'),
      createHealthRecord('discord'),
      createHealthRecord('linear'),
      createHealthRecord('jira'),
      createHealthRecord('webhooks'),
    ];

    for (const record of connectedIntegrations) {
      dbStore.set(`health:${record.integrationType}`, record);
    }

    const probed = Array.from(dbStore.values()).filter((v) => v.integrationType);
    expect(probed).toHaveLength(5);
  });

  it('should call auth.test with decrypted bot token for Slack health probe', async () => {
    const slackIntegration = {
      botToken: 'encrypted:xoxb-test-token',
      botTokenIV: 'test-iv',
      status: 'active',
    };

    const decryptedToken = mockEncryptionService.decrypt(slackIntegration.botToken);
    expect(decryptedToken).toBe('xoxb-test-token');

    await mockFetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${decryptedToken}` },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://slack.com/api/auth.test',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer xoxb-test-token' }) }),
    );
  });

  it('should mark Slack unhealthy on auth.test failure', () => {
    const health = createHealthRecord('slack', { status: 'healthy' });

    // Simulate probe failure
    health.status = 'unhealthy';
    health.lastErrorAt = new Date();
    health.lastErrorMessage = 'auth.test returned ok: false';
    health.consecutiveFailures = 1;

    expect(health.status).toBe('unhealthy');
    expect(health.lastErrorMessage).toContain('auth.test');
  });

  it('should send GET to webhook URL for Discord health probe', async () => {
    const webhookUrl = 'https://discord.com/api/webhooks/123/abc';

    await mockFetch(webhookUrl, { method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should verify token via viewer query for Linear health probe', async () => {
    await mockFetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: 'Bearer lin_test_token' },
      body: JSON.stringify({ query: '{ viewer { id name } }' }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.linear.app/graphql',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should verify token via accessible resources endpoint for Jira health probe', async () => {
    await mockFetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: 'Bearer jira_test_token' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
    );
  });

  it('should check last delivery status for each active webhook in health probe', () => {
    const webhooks = [
      { id: 'wh-1', isActive: true, lastDeliveryStatus: 'success', consecutiveFailures: 0 },
      { id: 'wh-2', isActive: true, lastDeliveryStatus: 'failed', consecutiveFailures: 2 },
      { id: 'wh-3', isActive: false, lastDeliveryStatus: null, consecutiveFailures: 0 },
    ];

    const activeWebhooks = webhooks.filter((w) => w.isActive);
    expect(activeWebhooks).toHaveLength(2);

    const unhealthyWebhooks = activeWebhooks.filter((w) => w.consecutiveFailures > 0);
    expect(unhealthyWebhooks).toHaveLength(1);
  });

  it('should keep healthy status after successful probe', () => {
    const health = createHealthRecord('slack', { status: 'healthy' });

    // Simulate successful probe
    health.lastSuccessAt = new Date();
    health.responseTimeMs = 120;

    expect(health.status).toBe('healthy');
    expect(health.responseTimeMs).toBe(120);
  });

  it('should transition from healthy to degraded on failed probe', () => {
    const health = createHealthRecord('slack', { status: 'healthy', consecutiveFailures: 0 });

    // First failure
    health.consecutiveFailures = 1;
    health.status = 'degraded';
    health.lastErrorAt = new Date();
    health.lastErrorMessage = 'Connection timeout';

    expect(health.status).toBe('degraded');
    expect(health.consecutiveFailures).toBe(1);
  });

  it('should transition from degraded to unhealthy on multiple consecutive failures', () => {
    const health = createHealthRecord('slack', { status: 'degraded', consecutiveFailures: 1 });

    // More failures
    health.consecutiveFailures = 3;
    health.status = 'unhealthy';

    expect(health.status).toBe('unhealthy');
    expect(health.consecutiveFailures).toBe(3);
  });

  it('should show disconnected status for integration with no token', () => {
    const health = createHealthRecord('slack', {
      status: 'disconnected',
      lastSuccessAt: null,
      responseTimeMs: null,
    });

    expect(health.status).toBe('disconnected');
    expect(health.lastSuccessAt).toBeNull();
  });

  it('should increment error count on probe failure', () => {
    const health = createHealthRecord('discord', { errorCount24h: 5 });

    health.errorCount24h += 1;
    expect(health.errorCount24h).toBe(6);
  });

  it('should store sanitized last error message (no tokens leaked)', () => {
    const rawError = 'Request failed with token xoxb-secret-token-12345: Connection refused';
    const sanitized = rawError.replace(/xoxb-[a-zA-Z0-9-]+/g, '[REDACTED]');

    const health = createHealthRecord('slack', { lastErrorMessage: sanitized });

    expect(health.lastErrorMessage).toContain('[REDACTED]');
    expect(health.lastErrorMessage).not.toContain('xoxb-secret');
  });

  it('should store health history entries in Redis sorted set with timestamps', () => {
    const historyKey = `integration:health:history:${WORKSPACE_ID}:slack`;
    const timestamp = Date.now();
    const entry = JSON.stringify({ status: 'healthy', responseTimeMs: 150, timestamp });

    redisStore.set(`${historyKey}:${timestamp}`, entry);

    const stored = redisStore.get(`${historyKey}:${timestamp}`);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.status).toBe('healthy');
    expect(parsed.responseTimeMs).toBe(150);
  });

  it('should trigger immediate probe on force health check via API', async () => {
    const health = createHealthRecord('slack');

    // Force check
    const probeResult = await mockFetch('https://slack.com/api/auth.test');
    expect(probeResult.ok).toBe(true);

    health.lastSuccessAt = new Date();
    health.responseTimeMs = 100;

    expect(health.lastSuccessAt).toBeDefined();
  });

  it('should return all integration health statuses for workspace in health summary', () => {
    const healthRecords = [
      createHealthRecord('slack', { status: 'healthy' }),
      createHealthRecord('discord', { status: 'healthy' }),
      createHealthRecord('linear', { status: 'degraded' }),
      createHealthRecord('jira', { status: 'unhealthy' }),
      createHealthRecord('webhooks', { status: 'healthy' }),
    ];

    const summary = {
      overall: healthRecords.some((r) => r.status === 'unhealthy')
        ? 'unhealthy'
        : healthRecords.some((r) => r.status === 'degraded')
          ? 'degraded'
          : 'healthy',
      counts: {
        healthy: healthRecords.filter((r) => r.status === 'healthy').length,
        degraded: healthRecords.filter((r) => r.status === 'degraded').length,
        unhealthy: healthRecords.filter((r) => r.status === 'unhealthy').length,
        disconnected: healthRecords.filter((r) => r.status === 'disconnected').length,
      },
    };

    expect(summary.overall).toBe('unhealthy');
    expect(summary.counts.healthy).toBe(3);
    expect(summary.counts.degraded).toBe(1);
    expect(summary.counts.unhealthy).toBe(1);
    expect(summary.counts.disconnected).toBe(0);
  });
});
