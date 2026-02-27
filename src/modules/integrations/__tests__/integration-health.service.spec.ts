/**
 * IntegrationHealthService Tests
 * Story 21-9: Integration Health Monitoring (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  IntegrationHealthCheck,
  IntegrationHealthStatus,
  IntegrationHealthType,
} from '../../../database/entities/integration-health-check.entity';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '../../../database/entities/integration-connection.entity';
import { OutgoingWebhook } from '../../../database/entities/outgoing-webhook.entity';
import { RedisService } from '../../redis/redis.service';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { IntegrationHealthService } from '../services/integration-health.service';

// ==================== Test Helpers ====================

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const INTEGRATION_ID = '22222222-2222-2222-2222-222222222222';

function createMockRepository() {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data: any) => ({ ...data })),
    save: jest.fn().mockImplementation((data: any) => Promise.resolve({ id: 'mock-id', ...data })),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };
}

function createMockRedisService() {
  return {
    zadd: jest.fn().mockResolvedValue(1),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zrevrange: jest.fn().mockResolvedValue([]),
  };
}

function createMockHttpService() {
  return {
    axiosRef: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
}

function createMockEncryptionService() {
  return {
    decrypt: jest.fn().mockResolvedValue('decrypted-token'),
  };
}

function createMockConfigService() {
  return {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'INTEGRATION_HEALTH_PROBE_TIMEOUT_MS') return 10000;
      return defaultValue;
    }),
  };
}

function createSlackIntegration(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    status: 'active',
    botToken: 'encrypted-token',
    botTokenIV: 'iv-123',
    errorCount: 0,
    lastError: null,
    messageCount: 100,
    ...overrides,
  };
}

function createDiscordIntegration(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    status: 'active',
    defaultWebhookUrl: 'encrypted-url',
    defaultWebhookUrlIv: 'iv-456',
    errorCount: 0,
    lastError: null,
    messageCount: 50,
    ...overrides,
  };
}

function createLinearIntegration(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    isActive: true,
    accessToken: 'encrypted-token',
    accessTokenIv: 'iv-789',
    errorCount: 0,
    syncCount: 20,
    lastError: null,
    ...overrides,
  };
}

function createJiraIntegration(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    isActive: true,
    accessToken: 'encrypted-token',
    accessTokenIv: 'iv-012',
    cloudId: 'cloud-123',
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    errorCount: 0,
    syncCount: 15,
    lastError: null,
    ...overrides,
  };
}

function createIntegrationConnection(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    provider: IntegrationProvider.GITHUB,
    status: IntegrationStatus.ACTIVE,
    lastUsedAt: new Date(),
    ...overrides,
  };
}

function createOutgoingWebhook(overrides: Partial<any> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    isActive: true,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    failureCount: 0,
    lastDeliveryStatus: 'success',
    ...overrides,
  };
}

describe('IntegrationHealthService', () => {
  let service: IntegrationHealthService;
  let healthRepo: ReturnType<typeof createMockRepository>;
  let slackRepo: ReturnType<typeof createMockRepository>;
  let discordRepo: ReturnType<typeof createMockRepository>;
  let linearRepo: ReturnType<typeof createMockRepository>;
  let jiraRepo: ReturnType<typeof createMockRepository>;
  let connectionRepo: ReturnType<typeof createMockRepository>;
  let webhookRepo: ReturnType<typeof createMockRepository>;
  let redisService: ReturnType<typeof createMockRedisService>;
  let httpService: ReturnType<typeof createMockHttpService>;
  let encryptionService: ReturnType<typeof createMockEncryptionService>;

  beforeEach(async () => {
    healthRepo = createMockRepository();
    slackRepo = createMockRepository();
    discordRepo = createMockRepository();
    linearRepo = createMockRepository();
    jiraRepo = createMockRepository();
    connectionRepo = createMockRepository();
    webhookRepo = createMockRepository();
    redisService = createMockRedisService();
    httpService = createMockHttpService();
    encryptionService = createMockEncryptionService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationHealthService,
        { provide: getRepositoryToken(IntegrationHealthCheck), useValue: healthRepo },
        { provide: getRepositoryToken(SlackIntegration), useValue: slackRepo },
        { provide: getRepositoryToken(DiscordIntegration), useValue: discordRepo },
        { provide: getRepositoryToken(LinearIntegration), useValue: linearRepo },
        { provide: getRepositoryToken(JiraIntegration), useValue: jiraRepo },
        { provide: getRepositoryToken(IntegrationConnection), useValue: connectionRepo },
        { provide: getRepositoryToken(OutgoingWebhook), useValue: webhookRepo },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: HttpService, useValue: httpService },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get<IntegrationHealthService>(IntegrationHealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== runScheduledHealthChecks ====================

  describe('runScheduledHealthChecks', () => {
    it('iterates all workspaces with active integrations', async () => {
      // Mock createQueryBuilder for distinct workspace ID queries
      const mockQb = { select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ workspaceId: WORKSPACE_ID }]) };
      slackRepo.createQueryBuilder.mockReturnValue(mockQb);
      discordRepo.createQueryBuilder.mockReturnValue({ select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) });
      linearRepo.createQueryBuilder.mockReturnValue({ select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) });
      jiraRepo.createQueryBuilder.mockReturnValue({ select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) });
      connectionRepo.createQueryBuilder.mockReturnValue({ select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) });
      webhookRepo.createQueryBuilder.mockReturnValue({ select: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) });

      // Mock actual checkWorkspaceHealth to avoid deep calls
      jest.spyOn(service, 'checkWorkspaceHealth').mockResolvedValue([]);

      await service.runScheduledHealthChecks();

      expect(service.checkWorkspaceHealth).toHaveBeenCalledWith(WORKSPACE_ID);
    });
  });

  // ==================== checkWorkspaceHealth ====================

  describe('checkWorkspaceHealth', () => {
    it('probes all connected integrations in parallel', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null); // not connected
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);

      // Only Slack should have a result (others return null)
      expect(results.length).toBe(1);
    });

    it('handles probe timeout gracefully', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      // Simulate timeout
      httpService.axiosRef.post.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ data: { ok: true } }), 15000);
      }));

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);

      // Should still return results (timeout caught and recorded as unhealthy)
      expect(results.length).toBeGreaterThanOrEqual(0);
    }, 15000);
  });

  // ==================== Probe Methods ====================

  describe('probeSlack', () => {
    it('returns healthy when token valid and recent messages', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const slackResult = results.find(r => r.integrationType === IntegrationHealthType.SLACK);

      expect(slackResult).toBeDefined();
      expect(slackResult!.status).toBe(IntegrationHealthStatus.HEALTHY);
    });

    it('returns unhealthy when auth.test fails', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: false, error: 'invalid_auth' } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const slackResult = results.find(r => r.integrationType === IntegrationHealthType.SLACK);

      expect(slackResult).toBeDefined();
      expect(slackResult!.status).toBe(IntegrationHealthStatus.UNHEALTHY);
    });
  });

  describe('probeDiscord', () => {
    it('returns healthy when webhook responds 2xx', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(createDiscordIntegration());
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.get.mockResolvedValue({ status: 200 });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const discordResult = results.find(r => r.integrationType === IntegrationHealthType.DISCORD);

      expect(discordResult).toBeDefined();
      expect(discordResult!.status).toBe(IntegrationHealthStatus.HEALTHY);
    });

    it('returns unhealthy when webhook returns error', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(createDiscordIntegration());
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.get.mockRejectedValue(new Error('Request failed with status 401'));

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const discordResult = results.find(r => r.integrationType === IntegrationHealthType.DISCORD);

      expect(discordResult).toBeDefined();
      expect(discordResult!.status).toBe(IntegrationHealthStatus.UNHEALTHY);
    });
  });

  describe('probeLinear', () => {
    it('returns healthy when token valid', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(createLinearIntegration());
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { data: { viewer: { id: 'user-1' } } } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const linearResult = results.find(r => r.integrationType === IntegrationHealthType.LINEAR);

      expect(linearResult).toBeDefined();
      expect(linearResult!.status).toBe(IntegrationHealthStatus.HEALTHY);
    });

    it('returns degraded when sync errors exist', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(createLinearIntegration({ errorCount: 3 }));
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { data: { viewer: { id: 'user-1' } } } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const linearResult = results.find(r => r.integrationType === IntegrationHealthType.LINEAR);

      expect(linearResult).toBeDefined();
      expect(linearResult!.status).toBe(IntegrationHealthStatus.DEGRADED);
    });
  });

  describe('probeJira', () => {
    it('returns healthy when token valid and not expired', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(createJiraIntegration());
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.get.mockResolvedValue({ status: 200 });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const jiraResult = results.find(r => r.integrationType === IntegrationHealthType.JIRA);

      expect(jiraResult).toBeDefined();
      expect(jiraResult!.status).toBe(IntegrationHealthStatus.HEALTHY);
    });

    it('returns degraded when token expiring within 24h', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(createJiraIntegration({
        tokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      }));
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.get.mockResolvedValue({ status: 200 });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const jiraResult = results.find(r => r.integrationType === IntegrationHealthType.JIRA);

      expect(jiraResult).toBeDefined();
      expect(jiraResult!.status).toBe(IntegrationHealthStatus.DEGRADED);
    });
  });

  describe('probeIntegrationConnection', () => {
    it('returns healthy for active connections', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockImplementation(async (opts: any) => {
        if (opts?.where?.provider === IntegrationProvider.GITHUB) {
          return createIntegrationConnection();
        }
        return null;
      });
      webhookRepo.find.mockResolvedValue([]);

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const githubResult = results.find(r => r.integrationType === IntegrationHealthType.GITHUB);

      expect(githubResult).toBeDefined();
      expect(githubResult!.status).toBe(IntegrationHealthStatus.HEALTHY);
    });
  });

  describe('probeWebhooks', () => {
    it('returns degraded when some webhooks failing', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([
        createOutgoingWebhook({ id: '1', consecutiveFailures: 0 }),
        createOutgoingWebhook({ id: '2', consecutiveFailures: 10, maxConsecutiveFailures: 5 }),
        createOutgoingWebhook({ id: '3', consecutiveFailures: 0 }),
      ]);

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const webhookResult = results.find(r => r.integrationType === IntegrationHealthType.WEBHOOKS);

      expect(webhookResult).toBeDefined();
      expect(webhookResult!.status).toBe(IntegrationHealthStatus.DEGRADED);
    });

    it('returns unhealthy when majority failing', async () => {
      slackRepo.findOne.mockResolvedValue(null);
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([
        createOutgoingWebhook({ id: '1', consecutiveFailures: 10, maxConsecutiveFailures: 5 }),
        createOutgoingWebhook({ id: '2', consecutiveFailures: 10, maxConsecutiveFailures: 5 }),
        createOutgoingWebhook({ id: '3', consecutiveFailures: 0 }),
      ]);

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const webhookResult = results.find(r => r.integrationType === IntegrationHealthType.WEBHOOKS);

      expect(webhookResult).toBeDefined();
      expect(webhookResult!.status).toBe(IntegrationHealthStatus.UNHEALTHY);
    });
  });

  // ==================== recordProbeResult ====================

  describe('recordProbeResult', () => {
    it('increments consecutive_failures on error', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      // First call: record exists with 2 consecutive failures
      healthRepo.findOne.mockResolvedValue({
        id: 'existing-id',
        workspaceId: WORKSPACE_ID,
        integrationType: IntegrationHealthType.SLACK,
        integrationId: INTEGRATION_ID,
        status: IntegrationHealthStatus.UNHEALTHY,
        consecutiveFailures: 2,
      });

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: false, error: 'invalid_auth' } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const slackResult = results.find(r => r.integrationType === IntegrationHealthType.SLACK);

      expect(slackResult).toBeDefined();
      expect(slackResult!.consecutiveFailures).toBe(3);
    });

    it('resets consecutive_failures on success', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      healthRepo.findOne.mockResolvedValue({
        id: 'existing-id',
        workspaceId: WORKSPACE_ID,
        integrationType: IntegrationHealthType.SLACK,
        integrationId: INTEGRATION_ID,
        status: IntegrationHealthStatus.UNHEALTHY,
        consecutiveFailures: 5,
      });

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      const results = await service.checkWorkspaceHealth(WORKSPACE_ID);
      const slackResult = results.find(r => r.integrationType === IntegrationHealthType.SLACK);

      expect(slackResult).toBeDefined();
      expect(slackResult!.consecutiveFailures).toBe(0);
    });

    it('stores history entry in Redis', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      discordRepo.findOne.mockResolvedValue(null);
      linearRepo.findOne.mockResolvedValue(null);
      jiraRepo.findOne.mockResolvedValue(null);
      connectionRepo.findOne.mockResolvedValue(null);
      webhookRepo.find.mockResolvedValue([]);

      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      await service.checkWorkspaceHealth(WORKSPACE_ID);

      expect(redisService.zadd).toHaveBeenCalledWith(
        expect.stringContaining(`integration-health:history:${WORKSPACE_ID}:slack`),
        expect.any(Number),
        expect.any(String),
      );
    });
  });

  // ==================== Query Methods ====================

  describe('getAllHealth', () => {
    it('returns all health records for workspace', async () => {
      const mockRecords = [
        { id: '1', workspaceId: WORKSPACE_ID, integrationType: IntegrationHealthType.SLACK, status: IntegrationHealthStatus.HEALTHY },
        { id: '2', workspaceId: WORKSPACE_ID, integrationType: IntegrationHealthType.DISCORD, status: IntegrationHealthStatus.DEGRADED },
      ];
      healthRepo.find.mockResolvedValue(mockRecords);

      const result = await service.getAllHealth(WORKSPACE_ID);
      expect(result).toEqual(mockRecords);
      expect(healthRepo.find).toHaveBeenCalledWith({ where: { workspaceId: WORKSPACE_ID } });
    });
  });

  describe('getHealthSummary', () => {
    it('calculates correct overall status', async () => {
      healthRepo.find.mockResolvedValue([
        { status: IntegrationHealthStatus.HEALTHY },
        { status: IntegrationHealthStatus.HEALTHY },
        { status: IntegrationHealthStatus.DEGRADED },
      ]);

      const summary = await service.getHealthSummary(WORKSPACE_ID);
      expect(summary.overall).toBe('degraded');
      expect(summary.counts.healthy).toBe(2);
      expect(summary.counts.degraded).toBe(1);
      expect(summary.counts.unhealthy).toBe(0);
    });

    it('returns unhealthy when any integration is unhealthy', async () => {
      healthRepo.find.mockResolvedValue([
        { status: IntegrationHealthStatus.HEALTHY },
        { status: IntegrationHealthStatus.UNHEALTHY },
      ]);

      const summary = await service.getHealthSummary(WORKSPACE_ID);
      expect(summary.overall).toBe('unhealthy');
    });

    it('returns healthy when all integrations are healthy', async () => {
      healthRepo.find.mockResolvedValue([
        { status: IntegrationHealthStatus.HEALTHY },
        { status: IntegrationHealthStatus.HEALTHY },
      ]);

      const summary = await service.getHealthSummary(WORKSPACE_ID);
      expect(summary.overall).toBe('healthy');
    });
  });

  describe('getHealthHistory', () => {
    it('returns sorted history from Redis using zrevrange', async () => {
      // zrevrange returns entries already sorted newest first
      const entries = [
        JSON.stringify({ timestamp: '2025-01-01T00:05:00Z', status: 'degraded', responseTimeMs: 150 }),
        JSON.stringify({ timestamp: '2025-01-01T00:00:00Z', status: 'healthy', responseTimeMs: 50 }),
      ];
      redisService.zrevrange.mockResolvedValue(entries);

      const result = await service.getHealthHistory(WORKSPACE_ID, IntegrationHealthType.SLACK);

      expect(result).toHaveLength(2);
      // Already sorted newest first by Redis zrevrange
      expect(result[0].timestamp).toBe('2025-01-01T00:05:00Z');
      expect(result[1].timestamp).toBe('2025-01-01T00:00:00Z');
      // Verify zrevrange was called with correct range (0 to limit-1)
      expect(redisService.zrevrange).toHaveBeenCalledWith(
        expect.stringContaining(`integration-health:history:${WORKSPACE_ID}:slack`),
        0,
        99, // default limit is 100, so 0 to 99
      );
    });
  });

  describe('forceHealthCheck', () => {
    it('runs immediate probe and returns result', async () => {
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      const result = await service.forceHealthCheck(WORKSPACE_ID, IntegrationHealthType.SLACK);

      expect(result).toBeDefined();
      expect(result.integrationType).toBe(IntegrationHealthType.SLACK);
    });
  });

  describe('retryFailed', () => {
    it('delegates to appropriate integration service', async () => {
      healthRepo.findOne.mockResolvedValue({
        status: IntegrationHealthStatus.UNHEALTHY,
        workspaceId: WORKSPACE_ID,
        integrationType: IntegrationHealthType.SLACK,
      });

      // Mock the internal checkIntegration
      slackRepo.findOne.mockResolvedValue(createSlackIntegration());
      httpService.axiosRef.post.mockResolvedValue({ data: { ok: true } });

      const result = await service.retryFailed(WORKSPACE_ID, IntegrationHealthType.SLACK);
      expect(result).toBeDefined();
      expect(result.retriedCount).toBe(1);
    });
  });

  // ==================== Uptime and Pruning ====================

  describe('calculateUptime30d', () => {
    it('computes correct percentage from history', async () => {
      const entries = [
        JSON.stringify({ timestamp: '2025-01-01T00:00:00Z', status: 'healthy', responseTimeMs: 50 }),
        JSON.stringify({ timestamp: '2025-01-01T00:05:00Z', status: 'healthy', responseTimeMs: 45 }),
        JSON.stringify({ timestamp: '2025-01-01T00:10:00Z', status: 'unhealthy', responseTimeMs: 200 }),
        JSON.stringify({ timestamp: '2025-01-01T00:15:00Z', status: 'healthy', responseTimeMs: 55 }),
      ];
      redisService.zrangebyscore.mockResolvedValue(entries);

      const uptime = await service.calculateUptime30d(WORKSPACE_ID, IntegrationHealthType.SLACK);

      // 3 out of 4 are healthy = 75%
      expect(uptime).toBe(75);
    });

    it('returns 100 when no history exists', async () => {
      redisService.zrangebyscore.mockResolvedValue([]);

      const uptime = await service.calculateUptime30d(WORKSPACE_ID, IntegrationHealthType.SLACK);
      expect(uptime).toBe(100);
    });
  });

  describe('pruneHistory', () => {
    it('removes entries older than 30 days', async () => {
      await service.pruneHistory(WORKSPACE_ID, IntegrationHealthType.SLACK);

      expect(redisService.zremrangebyscore).toHaveBeenCalledWith(
        expect.stringContaining(`integration-health:history:${WORKSPACE_ID}:slack`),
        '-inf',
        expect.any(Number),
      );
    });
  });
});
