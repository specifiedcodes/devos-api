/**
 * SlackNotificationService Tests
 * Story 16.4: Slack Notification Integration (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SlackNotificationService } from '../services/slack-notification.service';
import { SlackBlockBuilderService } from '../services/slack-block-builder.service';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationEvent, NotificationType } from '../events/notification.events';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SlackNotificationService', () => {
  let service: SlackNotificationService;
  let repo: any;
  let redisService: any;
  let encryptionService: any;
  let blockBuilder: SlackBlockBuilderService;

  const mockIntegration: Partial<SlackIntegration> = {
    id: 'int-1',
    workspaceId: 'ws-1',
    teamId: 'T12345',
    teamName: 'Test Team',
    botToken: 'encrypted-token',
    botTokenIV: 'embedded',
    defaultChannelId: 'C12345',
    defaultChannelName: '#general',
    status: 'active',
    eventChannelConfig: {},
    quietHoursConfig: null,
    rateLimitPerHour: 60,
    mentionConfig: { critical: '@here', normal: null },
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
      decrypt: jest.fn().mockReturnValue('xoxb-test-token'),
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          SLACK_CLIENT_ID: 'test-client-id',
          FRONTEND_URL: 'https://app.devos.io',
        };
        return config[key] || defaultValue || undefined;
      }),
    };

    mockFetch.mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true, ts: '123' }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackNotificationService,
        SlackBlockBuilderService,
        { provide: getRepositoryToken(SlackIntegration), useValue: repo },
        { provide: ConfigService, useValue: configService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<SlackNotificationService>(SlackNotificationService);
    blockBuilder = module.get<SlackBlockBuilderService>(SlackBlockBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    it('should send message to default channel when no event-specific channel configured', async () => {
      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(true);
      expect(result.channelId).toBe('C12345');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"channel":"C12345"'),
        }),
      );
    });

    it('should send message to event-specific channel when configured', async () => {
      repo.findOne.mockResolvedValue({
        ...mockIntegration,
        eventChannelConfig: {
          story_completed: { channelId: 'C_STORIES', channelName: '#stories' },
        },
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(true);
      expect(result.channelId).toBe('C_STORIES');
    });

    it('should return { sent: false } when no Slack integration exists', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('No Slack integration');
    });

    it('should return { sent: false } when integration status is not active', async () => {
      repo.findOne.mockResolvedValue({ ...mockIntegration, status: 'revoked' });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should format Block Kit message correctly for story_completed', async () => {
      await service.sendNotification('ws-1', mockNotification);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.blocks).toBeDefined();
      expect(body.blocks[0].type).toBe('header');
      expect(body.attachments).toBeDefined();
    });

    it('should include @here mention for critical events (deployment_failed)', async () => {
      const criticalNotification: NotificationEvent = {
        ...mockNotification,
        type: 'deployment_failed',
        payload: { projectName: 'MyApp', environment: 'prod', errorSummary: 'Build failed', projectId: 'p1', deploymentId: 'd1' },
      };

      await service.sendNotification('ws-1', criticalNotification);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.text).toContain('<!here>');
    });

    it('should include @here mention for critical events (agent_error)', async () => {
      const criticalNotification: NotificationEvent = {
        ...mockNotification,
        type: 'agent_error',
        payload: { agentName: 'Dev', agentType: 'dev', errorMessage: 'crash', projectId: 'p1', agentId: 'a1' },
      };

      await service.sendNotification('ws-1', criticalNotification);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.text).toContain('<!here>');
    });

    it('should respect rate limit - return { sent: false } when limit exceeded', async () => {
      // Simulate rate limit exceeded
      redisService.zrangebyscore.mockResolvedValue(Array(60).fill('1'));

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should bypass quiet hours for critical notifications', async () => {
      // Setup quiet hours that are active
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

    it('should handle Slack API 429 (rate limited) by returning error', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        json: jest.fn().mockResolvedValue({ ok: false, error: 'ratelimited' }),
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
    });

    it('should handle invalid_auth response by setting status to revoked', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: jest.fn().mockResolvedValue({ ok: false, error: 'invalid_auth' }),
      });

      const result = await service.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toBe('invalid_auth');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({ status: 'revoked' }),
      );
    });

    it('should increment errorCount on API failure and set lastError', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: jest.fn().mockResolvedValue({ ok: false, error: 'channel_not_found' }),
      });

      await service.sendNotification('ws-1', mockNotification);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'int-1' },
        expect.objectContaining({
          errorCount: 1,
          lastError: 'channel_not_found',
        }),
      );
    });

    it('should set status to error after 3 consecutive failures', async () => {
      repo.findOne.mockResolvedValue({ ...mockIntegration, errorCount: 2 });
      mockFetch.mockResolvedValue({
        status: 200,
        json: jest.fn().mockResolvedValue({ ok: false, error: 'some_error' }),
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

    it('should format Block Kit messages for all 8 notification types', async () => {
      const types: NotificationType[] = [
        'story_completed',
        'epic_completed',
        'deployment_success',
        'deployment_failed',
        'agent_error',
        'agent_message',
        'context_degraded',
        'context_critical',
      ];

      for (const type of types) {
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          status: 200,
          json: jest.fn().mockResolvedValue({ ok: true, ts: '123' }),
        });

        const notification: NotificationEvent = {
          ...mockNotification,
          type,
          payload: buildPayload(type),
        };

        const result = await service.sendNotification('ws-1', notification);
        expect(result.sent).toBe(true);

        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body);
        expect(body.text).toBeTruthy();
        expect(body.blocks).toBeDefined();
      }
    });
  });

  describe('testConnection', () => {
    it('should send test message and return success', async () => {
      const result = await service.testConnection('ws-1');
      expect(result.success).toBe(true);
    });

    it('should return { success: false } when not connected', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.testConnection('ws-1');
      expect(result.success).toBe(false);
    });
  });

  describe('listChannels', () => {
    it('should return channels from Slack conversations.list API', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_private: false },
            { id: 'C2', name: 'alerts', is_private: true },
          ],
        }),
      });

      const channels = await service.listChannels('ws-1');
      expect(channels).toHaveLength(2);
      expect(channels[0]).toEqual({ id: 'C1', name: 'general', isPrivate: false });
      expect(channels[1]).toEqual({ id: 'C2', name: 'alerts', isPrivate: true });
    });

    it('should return empty array when no integration', async () => {
      repo.findOne.mockResolvedValue(null);
      const channels = await service.listChannels('ws-1');
      expect(channels).toEqual([]);
    });
  });

  describe('updateEventChannelConfig', () => {
    it('should persist configuration to database', async () => {
      const config = {
        deployment_failed: { channelId: 'C_ALERTS', channelName: '#alerts' },
      };

      await service.updateEventChannelConfig('ws-1', config);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventChannelConfig: config,
        }),
      );
    });
  });

  describe('disconnect', () => {
    it('should revoke token via Slack API and delete record', async () => {
      await service.disconnect('ws-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/auth.revoke',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(repo.remove).toHaveBeenCalled();
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
      expect(result!.teamId).toBe('T12345');
    });

    it('should return fresh result after cache miss', async () => {
      const result = await service.getIntegration('ws-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
      expect(result).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should return { sent: false } when Slack is not configured', async () => {
      const noConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackNotificationService,
          SlackBlockBuilderService,
          { provide: getRepositoryToken(SlackIntegration), useValue: repo },
          { provide: ConfigService, useValue: noConfigService },
          { provide: EncryptionService, useValue: encryptionService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();

      const unconfiguredService = module.get<SlackNotificationService>(SlackNotificationService);
      const result = await unconfiguredService.sendNotification('ws-1', mockNotification);

      expect(result.sent).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should initialize without error when Slack env vars are not set', async () => {
      const noConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackNotificationService,
          SlackBlockBuilderService,
          { provide: getRepositoryToken(SlackIntegration), useValue: repo },
          { provide: ConfigService, useValue: noConfigService },
          { provide: EncryptionService, useValue: encryptionService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();

      const unconfiguredService = module.get<SlackNotificationService>(SlackNotificationService);
      expect(unconfiguredService).toBeDefined();
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
