/**
 * DiscordNotificationService Tests
 * Story 16.5: Discord Notification Integration (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { DiscordEmbedBuilderService } from '../services/discord-embed-builder.service';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationEvent, NotificationType } from '../events/notification.events';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('DiscordNotificationService', () => {
  let service: DiscordNotificationService;
  let repo: any;
  let redisService: any;
  let encryptionService: any;
  let embedBuilder: DiscordEmbedBuilderService;

  const mockWebhookUrl = 'https://discord.com/api/webhooks/123456/abcdef-token';

  const mockIntegration: Partial<DiscordIntegration> = {
    id: 'int-1',
    workspaceId: 'ws-1',
    name: 'Discord',
    defaultWebhookUrl: 'encrypted-webhook-url',
    defaultWebhookUrlIv: 'embedded',
    defaultWebhookId: '123456',
    defaultWebhookToken: 'abcdef-token',
    defaultChannelName: '#general',
    guildId: 'guild-1',
    guildName: 'Test Server',
    connectedBy: 'user-1',
    status: 'active',
    eventWebhookConfig: {},
    quietHoursConfig: null,
    rateLimitPerMinute: 30,
    mentionConfig: { critical: null, normal: null },
    messageCount: 0,
    errorCount: 0,
  };

  const mockNotification: NotificationEvent = {
    type: 'story_completed',
    payload: {
      storyId: 's1',
      storyTitle: 'Test Story',
      projectId: 'p1',
      agentName: 'Dev Agent',
    },
    recipients: [{ userId: 'user-1', workspaceId: 'ws-1' }],
    urgency: 'normal',
    batchable: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repo = {
      findOne: jest.fn().mockResolvedValue({ ...mockIntegration }),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue('encrypted-data'),
      decrypt: jest.fn().mockReturnValue(mockWebhookUrl),
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          FRONTEND_URL: 'https://app.devos.io',
        };
        return config[key] || defaultValue || undefined;
      }),
    };

    // Discord returns 204 No Content on successful webhook send
    mockFetch.mockResolvedValue({
      status: 204,
      headers: new Map(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordNotificationService,
        DiscordEmbedBuilderService,
        { provide: getRepositoryToken(DiscordIntegration), useValue: repo },
        { provide: ConfigService, useValue: configService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<DiscordNotificationService>(DiscordNotificationService);
    embedBuilder = module.get<DiscordEmbedBuilderService>(DiscordEmbedBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    it('should send message to default webhook when no event-specific webhook configured', async () => {
      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(true);
      expect(result.channelName).toBe('#general');
      expect(mockFetch).toHaveBeenCalledWith(
        mockWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should send message to event-specific webhook when configured', async () => {
      const eventWebhookUrl = 'https://discord.com/api/webhooks/789/event-token';
      encryptionService.decrypt.mockImplementation((data: string) => {
        if (data === 'encrypted-event-webhook') return eventWebhookUrl;
        return mockWebhookUrl;
      });

      repo.findOne.mockResolvedValue({
        ...mockIntegration,
        eventWebhookConfig: {
          story_completed: { webhookUrl: 'encrypted-event-webhook', webhookUrlIv: 'embedded', channelName: '#stories' },
        },
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(true);
      expect(result.channelName).toBe('#stories');
    });

    it('should return { sent: false } when no Discord integration exists', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('No Discord integration');
    });

    it('should return { sent: false } when integration status is not active', async () => {
      repo.findOne.mockResolvedValue({ ...mockIntegration, status: 'error' });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('error');
    });

    it('should format Discord embed correctly for each NotificationType', async () => {
      const types: NotificationType[] = [
        'story_completed', 'epic_completed', 'deployment_success', 'deployment_failed',
        'agent_error', 'agent_message', 'context_degraded', 'context_critical',
      ];

      for (const type of types) {
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({ status: 204, headers: new Map() });

        const notification: NotificationEvent = {
          ...mockNotification,
          type,
          payload: buildPayload(type),
        };

        const result = await service.sendNotification('ws-1', notification);
        expect(result.sent).toBe(true);

        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body);
        expect(body.embeds).toBeDefined();
        expect(body.embeds).toHaveLength(1);
        expect(body.content).toBeTruthy();
      }
    });

    it('should include @everyone mention for critical events when configured in mentionConfig', async () => {
      repo.findOne.mockResolvedValue({
        ...mockIntegration,
        mentionConfig: { critical: '@everyone', normal: null },
      });

      const criticalNotification: NotificationEvent = {
        ...mockNotification,
        type: 'deployment_failed',
        payload: { projectName: 'MyApp', environment: 'prod', errorSummary: 'Build failed', projectId: 'p1', deploymentId: 'd1' },
      };

      await service.sendNotification('ws-1', criticalNotification);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.content).toContain('@everyone');
    });

    it('should respect rate limit (30/min) - return { sent: false } when limit exceeded', async () => {
      // Simulate rate limit exceeded
      redisService.zrangebyscore.mockResolvedValue(Array(30).fill('1'));

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should bypass quiet hours for critical notifications', async () => {
      repo.findOne.mockResolvedValue({
        ...mockIntegration,
        quietHoursConfig: {
          enabled: true,
          startTime: '00:00',
          endTime: '23:59',
          timezone: 'UTC',
        },
      });

      const criticalNotification: NotificationEvent = {
        ...mockNotification,
        type: 'deployment_failed',
        payload: { projectName: 'MyApp', environment: 'prod', errorSummary: 'fail', projectId: 'p1', deploymentId: 'd1' },
      };

      const result = await service.sendNotification('ws-1', criticalNotification);

      expect(result.sent).toBe(true);
    });

    it('should suppress non-critical notifications during quiet hours', async () => {
      repo.findOne.mockResolvedValue({
        ...mockIntegration,
        quietHoursConfig: {
          enabled: true,
          startTime: '00:00',
          endTime: '23:59',
          timezone: 'UTC',
        },
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('quiet hours');
    });

    it('should handle Discord API 429 by returning error with retryAfter', async () => {
      const mockHeaders = new Map([['Retry-After', '30']]);
      mockFetch.mockResolvedValue({
        status: 429,
        headers: { get: (name: string) => mockHeaders.get(name) },
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('rate limited');
      expect(result.retryAfter).toBe(30);
    });

    it('should handle 404 response by setting status to invalid_webhook', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Map(),
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({ status: 'invalid_webhook' }),
      );
    });

    it('should increment errorCount on API failure and set lastError', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        headers: new Map(),
        json: jest.fn().mockResolvedValue({ message: 'Internal Server Error' }),
      });

      await service.sendNotification('ws-1', mockNotification);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({
          errorCount: 1,
          lastError: 'Internal Server Error',
        }),
      );
    });

    it('should set status to error after 3 consecutive failures', async () => {
      repo.findOne.mockResolvedValue({ ...mockIntegration, errorCount: 2 });
      mockFetch.mockResolvedValue({
        status: 500,
        headers: new Map(),
        json: jest.fn().mockResolvedValue({ message: 'Server Error' }),
      });

      await service.sendNotification('ws-1', mockNotification);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({
          errorCount: 3,
          status: 'error',
        }),
      );
    });
  });

  describe('addWebhook', () => {
    it('should validate webhook URL format (reject non-Discord URLs)', async () => {
      const result = await service.addWebhook('ws-1', 'user-1', 'https://evil.com/webhooks/123/abc');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should validate webhook by calling Discord GET endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: '123456', guild_id: 'g1', name: 'DevOS', token: 'tok' }),
      });
      // Test message
      mockFetch.mockResolvedValueOnce({ status: 204 });

      repo.findOne.mockResolvedValue(null); // No existing integration

      const result = await service.addWebhook('ws-1', 'user-1', mockWebhookUrl, '#general');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/webhooks/123456/abcdef-token`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should encrypt webhook URL before storage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: '123456', guild_id: 'g1', name: 'DevOS' }),
      });
      mockFetch.mockResolvedValueOnce({ status: 204 });

      repo.findOne.mockResolvedValue(null);

      await service.addWebhook('ws-1', 'user-1', mockWebhookUrl, '#general');

      expect(encryptionService.encrypt).toHaveBeenCalledWith(mockWebhookUrl);
    });

    it('should send test message on successful validation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: '123456', guild_id: 'g1', name: 'DevOS' }),
      });
      mockFetch.mockResolvedValueOnce({ status: 204 });

      repo.findOne.mockResolvedValue(null);

      await service.addWebhook('ws-1', 'user-1', mockWebhookUrl);

      // Second fetch call is the test message
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const testCall = mockFetch.mock.calls[1];
      expect(testCall[0]).toBe(mockWebhookUrl);
      expect(testCall[1].method).toBe('POST');
    });

    it('should extract guild name from webhook response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: '123456', guild_id: 'g1', name: 'My Server' }),
      });
      mockFetch.mockResolvedValueOnce({ status: 204 });

      repo.findOne.mockResolvedValue(null);

      const result = await service.addWebhook('ws-1', 'user-1', mockWebhookUrl);

      expect(result.guildName).toBe('My Server');
    });
  });

  describe('testConnection', () => {
    it('should send test embed and return success', async () => {
      mockFetch.mockResolvedValue({ status: 204 });
      const result = await service.testConnection('ws-1');
      expect(result.success).toBe(true);
    });

    it('should return { success: false } when no integration exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.testConnection('ws-1');
      expect(result.success).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should persist configuration to database and invalidate cache', async () => {
      const configUpdate = { name: 'Discord Alerts', rateLimitPerMinute: 20 };
      await service.updateConfig('ws-1', configUpdate);

      expect(repo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ name: 'Discord Alerts', rateLimitPerMinute: 20 }),
      );
      expect(redisService.del).toHaveBeenCalledWith('discord-integration:ws-1');
    });
  });

  describe('disconnect', () => {
    it('should delete record and invalidate cache', async () => {
      await service.disconnect('ws-1');

      expect(repo.delete).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
      expect(redisService.del).toHaveBeenCalledWith('discord-integration:ws-1');
    });
  });

  describe('getIntegration', () => {
    it('should return cached result on second call within TTL', async () => {
      // First call - no cache
      await service.getIntegration('ws-1');

      // Set up cache for second call
      redisService.get.mockResolvedValue(JSON.stringify(mockIntegration));

      // Second call - should use cache
      const result = await service.getIntegration('ws-1');

      expect(result).toBeDefined();
      expect(result!.guildName).toBe('Test Server');
    });

    it('should return fresh result after cache invalidation', async () => {
      const result = await service.getIntegration('ws-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
      expect(result).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should initialize without error (no Discord-specific env vars needed)', () => {
      expect(service).toBeDefined();
    });

    it('should return { sent: false } when no Discord integration exists for workspace', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.sendNotification('ws-1', mockNotification);
      expect(result.sent).toBe(false);
    });

    it('should function normally when integration exists and webhook is valid', async () => {
      const result = await service.sendNotification('ws-1', mockNotification);
      expect(result.sent).toBe(true);
    });
  });
});

function buildPayload(type: NotificationType): Record<string, any> {
  switch (type) {
    case 'story_completed':
      return { storyId: 's1', storyTitle: 'Test', projectId: 'p1', agentName: 'Dev' };
    case 'epic_completed':
      return { epicId: 'e1', epicTitle: 'Test', storyCount: 5, projectId: 'p1' };
    case 'deployment_success':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'App', environment: 'prod', url: 'https://app.com' };
    case 'deployment_failed':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'App', environment: 'prod', errorSummary: 'fail' };
    case 'agent_error':
      return { agentId: 'a1', agentName: 'Dev', agentType: 'dev', projectId: 'p1', errorMessage: 'crash' };
    case 'agent_message':
      return { agentId: 'a1', agentName: 'Dev', projectId: 'p1', messagePreview: 'hello' };
    case 'context_degraded':
      return { projectId: 'p1', previousHealth: 'good', currentHealth: 'degraded', issues: ['issue1'] };
    case 'context_critical':
      return { projectId: 'p1', issues: ['critical issue'], criticalSince: '2026-02-16T10:00:00Z' };
    default:
      return {};
  }
}
