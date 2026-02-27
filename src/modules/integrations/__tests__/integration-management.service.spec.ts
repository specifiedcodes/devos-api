/**
 * IntegrationManagementService Tests
 * Story 21-7: Integration Management UI (AC1)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IntegrationManagementService,
  IntegrationType,
  IntegrationCategory,
  UnifiedIntegrationStatus,
} from '../services/integration-management.service';
import { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '../../../database/entities/integration-connection.entity';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { LinearSyncItem } from '../../../database/entities/linear-sync-item.entity';
import { JiraSyncItem } from '../../../database/entities/jira-sync-item.entity';
import { OutgoingWebhook } from '../../../database/entities/outgoing-webhook.entity';
import { RedisService } from '../../redis/redis.service';

// ==================== Test Helpers ====================

function createMockRepository() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
}

function createMockRedisService() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('IntegrationManagementService', () => {
  let service: IntegrationManagementService;
  let integrationConnectionRepo: ReturnType<typeof createMockRepository>;
  let slackRepo: ReturnType<typeof createMockRepository>;
  let discordRepo: ReturnType<typeof createMockRepository>;
  let linearRepo: ReturnType<typeof createMockRepository>;
  let jiraRepo: ReturnType<typeof createMockRepository>;
  let linearSyncItemRepo: ReturnType<typeof createMockRepository>;
  let jiraSyncItemRepo: ReturnType<typeof createMockRepository>;
  let outgoingWebhookRepo: ReturnType<typeof createMockRepository>;
  let redisService: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    integrationConnectionRepo = createMockRepository();
    slackRepo = createMockRepository();
    discordRepo = createMockRepository();
    linearRepo = createMockRepository();
    jiraRepo = createMockRepository();
    linearSyncItemRepo = createMockRepository();
    jiraSyncItemRepo = createMockRepository();
    outgoingWebhookRepo = createMockRepository();
    redisService = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationManagementService,
        { provide: getRepositoryToken(IntegrationConnection), useValue: integrationConnectionRepo },
        { provide: getRepositoryToken(SlackIntegration), useValue: slackRepo },
        { provide: getRepositoryToken(DiscordIntegration), useValue: discordRepo },
        { provide: getRepositoryToken(LinearIntegration), useValue: linearRepo },
        { provide: getRepositoryToken(JiraIntegration), useValue: jiraRepo },
        { provide: getRepositoryToken(LinearSyncItem), useValue: linearSyncItemRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: jiraSyncItemRepo },
        { provide: getRepositoryToken(OutgoingWebhook), useValue: outgoingWebhookRepo },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<IntegrationManagementService>(IntegrationManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllIntegrationStatuses', () => {
    it('returns all 9 integration types when category is all', async () => {
      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      expect(result).toHaveLength(9);
      const types = result.map((r) => r.type);
      expect(types).toContain(IntegrationType.SLACK);
      expect(types).toContain(IntegrationType.DISCORD);
      expect(types).toContain(IntegrationType.LINEAR);
      expect(types).toContain(IntegrationType.JIRA);
      expect(types).toContain(IntegrationType.GITHUB);
      expect(types).toContain(IntegrationType.RAILWAY);
      expect(types).toContain(IntegrationType.VERCEL);
      expect(types).toContain(IntegrationType.SUPABASE);
      expect(types).toContain(IntegrationType.WEBHOOKS);
    });

    it('returns only communication integrations when category is communication', async () => {
      const result = await service.getAllIntegrationStatuses(
        WORKSPACE_ID,
        IntegrationCategory.COMMUNICATION,
      );
      expect(result).toHaveLength(2);
      const types = result.map((r) => r.type);
      expect(types).toContain(IntegrationType.SLACK);
      expect(types).toContain(IntegrationType.DISCORD);
    });

    it('returns only project_management integrations when category is project_management', async () => {
      const result = await service.getAllIntegrationStatuses(
        WORKSPACE_ID,
        IntegrationCategory.PROJECT_MANAGEMENT,
      );
      expect(result).toHaveLength(2);
      const types = result.map((r) => r.type);
      expect(types).toContain(IntegrationType.LINEAR);
      expect(types).toContain(IntegrationType.JIRA);
    });

    it('returns connected status for GitHub when IntegrationConnection exists with ACTIVE status', async () => {
      integrationConnectionRepo.findOne.mockImplementation(async (opts: Record<string, Record<string, unknown>>) => {
        if (opts.where && opts.where.provider === IntegrationProvider.GITHUB) {
          return {
            id: 'conn-1',
            workspaceId: WORKSPACE_ID,
            provider: IntegrationProvider.GITHUB,
            status: IntegrationStatus.ACTIVE,
            externalUsername: 'octocat',
            userId: USER_ID,
            connectedAt: new Date('2025-01-01'),
            lastUsedAt: new Date('2025-06-01'),
          };
        }
        return null;
      });

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const github = result.find((r) => r.type === IntegrationType.GITHUB);
      expect(github).toBeDefined();
      expect(github!.connected).toBe(true);
      expect(github!.status).toBe('active');
      expect(github!.accountLabel).toBe('octocat');
      expect(github!.connectedBy).toBe(USER_ID);
    });

    it('returns disconnected status for Slack when no SlackIntegration exists', async () => {
      slackRepo.findOne.mockResolvedValue(null);

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const slack = result.find((r) => r.type === IntegrationType.SLACK);
      expect(slack).toBeDefined();
      expect(slack!.connected).toBe(false);
      expect(slack!.status).toBe('disconnected');
    });

    it('returns error status for Slack when errorCount > 0 and active', async () => {
      slackRepo.findOne.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        status: 'active',
        errorCount: 5,
        lastError: 'rate_limited',
        teamName: 'Test Team',
        connectedBy: USER_ID,
        connectedAt: new Date('2025-01-01'),
        lastMessageAt: new Date('2025-06-01'),
        updatedAt: new Date('2025-06-01'),
      });

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const slack = result.find((r) => r.type === IntegrationType.SLACK);
      expect(slack!.status).toBe('error');
      expect(slack!.errorCount).toBe(5);
      expect(slack!.lastError).toBe('rate_limited');
    });

    it('returns expired status for Jira when tokenExpiresAt is past', async () => {
      jiraRepo.findOne.mockResolvedValue({
        id: 'jira-1',
        workspaceId: WORKSPACE_ID,
        isActive: true,
        tokenExpiresAt: new Date('2020-01-01'), // expired
        errorCount: 0,
        jiraProjectKey: 'PROJ',
        jiraProjectName: 'Test Project',
        connectedBy: USER_ID,
        createdAt: new Date('2025-01-01'),
        lastSyncAt: null,
        lastError: null,
        updatedAt: new Date('2025-01-01'),
      });

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const jira = result.find((r) => r.type === IntegrationType.JIRA);
      expect(jira).toBeDefined();
      expect(jira!.status).toBe('expired');
      expect(jira!.connected).toBe(false);
    });

    it('returns error status for Jira when high error count', async () => {
      jiraRepo.findOne.mockResolvedValue({
        id: 'jira-1',
        workspaceId: WORKSPACE_ID,
        isActive: true,
        tokenExpiresAt: new Date('2099-01-01'),
        errorCount: 10,
        lastError: 'Connection timeout',
        jiraProjectKey: 'PROJ',
        jiraProjectName: 'Test Project',
        connectedBy: USER_ID,
        createdAt: new Date('2025-01-01'),
        lastSyncAt: null,
        updatedAt: new Date('2025-01-01'),
      });

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const jira = result.find((r) => r.type === IntegrationType.JIRA);
      expect(jira!.status).toBe('error');
      expect(jira!.errorCount).toBe(10);
    });

    it('returns correct syncStats for Linear from LinearSyncItem counts', async () => {
      linearRepo.findOne.mockResolvedValue({
        id: 'linear-1',
        workspaceId: WORKSPACE_ID,
        isActive: true,
        errorCount: 0,
        linearTeamName: 'Engineering',
        connectedBy: USER_ID,
        createdAt: new Date('2025-01-01'),
        lastSyncAt: new Date('2025-06-01'),
        lastError: null,
        updatedAt: new Date('2025-06-01'),
      });

      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'synced', count: '10' },
          { status: 'pending', count: '3' },
          { status: 'conflict', count: '1' },
          { status: 'error', count: '2' },
        ]),
      };
      linearSyncItemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const linear = result.find((r) => r.type === IntegrationType.LINEAR);
      expect(linear!.syncStats).toEqual({
        total: 16,
        synced: 10,
        pending: 3,
        conflict: 1,
        error: 2,
      });
    });

    it('returns correct syncStats for Jira from JiraSyncItem counts', async () => {
      jiraRepo.findOne.mockResolvedValue({
        id: 'jira-1',
        workspaceId: WORKSPACE_ID,
        isActive: true,
        tokenExpiresAt: new Date('2099-01-01'),
        errorCount: 0,
        jiraProjectKey: 'PROJ',
        jiraProjectName: 'Test',
        connectedBy: USER_ID,
        createdAt: new Date('2025-01-01'),
        lastSyncAt: new Date('2025-06-01'),
        lastError: null,
        updatedAt: new Date('2025-06-01'),
      });

      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'synced', count: '8' },
          { status: 'pending', count: '2' },
        ]),
      };
      jiraSyncItemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const jira = result.find((r) => r.type === IntegrationType.JIRA);
      expect(jira!.syncStats).toEqual({
        total: 10,
        synced: 8,
        pending: 2,
        conflict: 0,
        error: 0,
      });
    });

    it('returns disconnected status for webhooks when none configured', async () => {
      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const webhooks = result.find((r) => r.type === IntegrationType.WEBHOOKS);
      expect(webhooks).toBeDefined();
      expect(webhooks!.status).toBe('disconnected');
      expect(webhooks!.available).toBe(true);
      expect(webhooks!.connected).toBe(false);
    });

    it('caches results in Redis with 60s TTL', async () => {
      await service.getAllIntegrationStatuses(WORKSPACE_ID);

      expect(redisService.set).toHaveBeenCalledWith(
        `integration-mgmt:statuses:${WORKSPACE_ID}`,
        expect.any(String),
        60,
      );
    });

    it('returns cached results on subsequent calls within TTL', async () => {
      const cachedData: UnifiedIntegrationStatus[] = [
        {
          type: IntegrationType.SLACK,
          name: 'Slack',
          description: 'Cached',
          category: IntegrationCategory.COMMUNICATION,
          connected: true,
          status: 'active',
          configUrl: 'integrations/slack',
          available: true,
        },
      ];
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Cached');
      // Should NOT have queried any repository
      expect(slackRepo.findOne).not.toHaveBeenCalled();
    });

    it('handles individual integration query failures gracefully', async () => {
      slackRepo.findOne.mockRejectedValue(new Error('DB connection error'));

      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const slack = result.find((r) => r.type === IntegrationType.SLACK);
      expect(slack).toBeDefined();
      expect(slack!.status).toBe('error');
    });

    it('configUrl is correctly computed for each integration type', async () => {
      const result = await service.getAllIntegrationStatuses(WORKSPACE_ID);
      const configUrls = new Map(result.map((r) => [r.type, r.configUrl]));
      expect(configUrls.get(IntegrationType.SLACK)).toBe('integrations/slack');
      expect(configUrls.get(IntegrationType.DISCORD)).toBe('integrations/discord');
      expect(configUrls.get(IntegrationType.LINEAR)).toBe('integrations/linear');
      expect(configUrls.get(IntegrationType.JIRA)).toBe('integrations/jira');
      expect(configUrls.get(IntegrationType.GITHUB)).toBe('integrations/github');
      expect(configUrls.get(IntegrationType.RAILWAY)).toBe('integrations/railway');
      expect(configUrls.get(IntegrationType.VERCEL)).toBe('integrations/vercel');
      expect(configUrls.get(IntegrationType.SUPABASE)).toBe('integrations/supabase');
      expect(configUrls.get(IntegrationType.WEBHOOKS)).toBe('integrations/webhooks');
    });
  });

  describe('invalidateCache', () => {
    it('deletes Redis key', async () => {
      await service.invalidateCache(WORKSPACE_ID);
      expect(redisService.del).toHaveBeenCalledWith(
        `integration-mgmt:statuses:${WORKSPACE_ID}`,
      );
    });
  });

  describe('getIntegrationSummary', () => {
    it('returns correct counts', async () => {
      slackRepo.findOne.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        status: 'active',
        errorCount: 0,
        teamName: 'Test',
        connectedBy: USER_ID,
        connectedAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getIntegrationSummary(WORKSPACE_ID);
      expect(result.total).toBe(9); // all 9 types including webhooks
      expect(result.connected).toBe(1); // only slack
      expect(result.errored).toBe(0);
      expect(result.disconnected).toBeGreaterThan(0);
    });
  });

  describe('getRecentActivity', () => {
    it('returns sorted recent events', async () => {
      slackRepo.findOne.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        teamName: 'Slack Team',
        connectedAt: new Date('2025-01-01'),
        lastMessageAt: new Date('2025-06-15'),
        lastErrorAt: new Date('2025-06-10'),
        lastError: 'rate limit',
        messageCount: 100,
        errorCount: 2,
      });

      const result = await service.getRecentActivity(WORKSPACE_ID);
      expect(result.length).toBeGreaterThan(0);
      // Should be sorted by timestamp descending
      for (let i = 1; i < result.length; i++) {
        expect(new Date(result[i - 1].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(result[i].timestamp).getTime(),
        );
      }
    });

    it('respects limit parameter (max 50)', async () => {
      slackRepo.findOne.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        teamName: 'Team',
        connectedAt: new Date('2025-01-01'),
        lastMessageAt: new Date('2025-06-01'),
        lastErrorAt: null,
        messageCount: 1,
        errorCount: 0,
      });

      discordRepo.findOne.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        guildName: 'Server',
        connectedAt: new Date('2025-02-01'),
        lastMessageAt: new Date('2025-06-02'),
        lastErrorAt: null,
        messageCount: 1,
        errorCount: 0,
      });

      const result = await service.getRecentActivity(WORKSPACE_ID, 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('caps limit at 50 even if higher value requested', async () => {
      const result = await service.getRecentActivity(WORKSPACE_ID, 100);
      // Even with 100 requested, max is 50
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getIntegrationStatus', () => {
    it('returns status for a valid type', async () => {
      const result = await service.getIntegrationStatus(WORKSPACE_ID, IntegrationType.SLACK);
      expect(result.type).toBe(IntegrationType.SLACK);
    });
  });
});
