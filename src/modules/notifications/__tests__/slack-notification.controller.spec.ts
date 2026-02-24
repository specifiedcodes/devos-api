/**
 * SlackNotificationController Tests
 * Story 16.4: Slack Notification Integration (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlackNotificationController } from '../controllers/slack-notification.controller';
import { SlackNotificationService } from '../services/slack-notification.service';
import { SlackOAuthService } from '../services/slack-oauth.service';
import { SlackUserMappingService } from '../../integrations/slack/services/slack-user-mapping.service';
import { SlackNotificationConfigService } from '../../integrations/slack/services/slack-notification-config.service';
import { SlackInteractionLog } from '../../../database/entities/slack-interaction-log.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('SlackNotificationController', () => {
  let controller: SlackNotificationController;
  let slackService: any;
  let oauthService: any;
  let userMappingService: any;
  let notificationConfigService: any;

  const mockIntegration = {
    id: 'int-1',
    workspaceId: 'ws-1',
    teamId: 'T12345',
    teamName: 'Test Team',
    defaultChannelId: 'C12345',
    defaultChannelName: '#general',
    status: 'active',
    eventChannelConfig: {},
    quietHoursConfig: null,
    rateLimitPerHour: 60,
    mentionConfig: { critical: '@here', normal: null },
    messageCount: 10,
    errorCount: 0,
    lastMessageAt: new Date('2026-02-16T10:00:00Z'),
    connectedAt: new Date('2026-02-10T10:00:00Z'),
  };

  beforeEach(async () => {
    slackService = {
      getIntegration: jest.fn().mockResolvedValue(mockIntegration),
      testConnection: jest.fn().mockResolvedValue({ success: true }),
      listChannels: jest.fn().mockResolvedValue([
        { id: 'C1', name: 'general', isPrivate: false },
        { id: 'C2', name: 'alerts', isPrivate: true },
      ]),
      updateEventChannelConfig: jest.fn().mockResolvedValue(mockIntegration),
      updateConfig: jest.fn().mockResolvedValue(mockIntegration),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    oauthService = {
      getAuthorizationUrl: jest.fn().mockResolvedValue('https://slack.com/oauth/v2/authorize?...'),
      handleCallback: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', teamName: 'Test Team' }),
      verifyConnection: jest.fn().mockResolvedValue({ ok: true, teamId: 'T12345', teamName: 'Test Team', botUserId: 'U_BOT' }),
      refreshConnection: jest.fn().mockResolvedValue('https://slack.com/oauth/v2/authorize?updated...'),
    };

    userMappingService = {
      autoMapByEmail: jest.fn().mockResolvedValue({ mapped: 2, unmatched: [] }),
      mapUser: jest.fn().mockResolvedValue({ id: 'mapping-1', workspaceId: 'ws-1', devosUserId: 'user-1', slackUserId: 'U001' }),
      unmapUser: jest.fn().mockResolvedValue(undefined),
      getMappings: jest.fn().mockResolvedValue([]),
      listSlackUsers: jest.fn().mockResolvedValue([{ slackUserId: 'U001', username: 'alice', displayName: 'Alice', isBot: false }]),
    };

    notificationConfigService = {
      getConfigs: jest.fn().mockResolvedValue([]),
      upsertConfig: jest.fn().mockResolvedValue({ id: 'config-1' }),
      deleteConfig: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackNotificationController],
      providers: [
        { provide: SlackNotificationService, useValue: slackService },
        { provide: SlackOAuthService, useValue: oauthService },
        { provide: SlackUserMappingService, useValue: userMappingService },
        { provide: SlackNotificationConfigService, useValue: notificationConfigService },
        { provide: getRepositoryToken(SlackInteractionLog), useValue: {
          find: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        }},
      ],
    }).compile();

    controller = module.get<SlackNotificationController>(SlackNotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /connect', () => {
    it('should return authorization URL', async () => {
      const req = { user: { sub: 'user-1' } };
      const result = await controller.connect('ws-1', req);

      expect(result.authUrl).toContain('https://slack.com');
      expect(oauthService.getAuthorizationUrl).toHaveBeenCalledWith('ws-1', 'user-1');
    });
  });

  describe('GET /callback', () => {
    it('should exchange code for token and return success', async () => {
      const result = await controller.callback('test-code', 'test-state');

      expect(result.workspaceId).toBe('ws-1');
      expect(result.teamName).toBe('Test Team');
      expect(result.message).toContain('successfully');
    });

    it('should throw BadRequestException for missing code', async () => {
      await expect(controller.callback('', 'test-state')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing state', async () => {
      await expect(controller.callback('test-code', '')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid state', async () => {
      oauthService.handleCallback.mockRejectedValue(new BadRequestException('Invalid state'));
      await expect(controller.callback('test-code', 'bad-state')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /status', () => {
    it('should return { connected: false } when no integration', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      const result = await controller.getStatus('ws-1');
      expect(result.connected).toBe(false);
    });

    it('should return full status when integration exists', async () => {
      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(true);
      expect(result.teamName).toBe('Test Team');
      expect(result.defaultChannel).toBe('#general');
      expect(result.status).toBe('active');
      expect(result.messageCount).toBe(10);
    });
  });

  describe('POST /test', () => {
    it('should send test message and return result', async () => {
      const result = await controller.testConnection('ws-1');
      expect(result.success).toBe(true);
    });

    it('should return { success: false } when not connected', async () => {
      slackService.testConnection.mockResolvedValue({ success: false, error: 'Not connected' });
      const result = await controller.testConnection('ws-1');
      expect(result.success).toBe(false);
    });
  });

  describe('GET /channels', () => {
    it('should return list of channels', async () => {
      const channels = await controller.listChannels('ws-1');
      expect(channels).toHaveLength(2);
      expect(channels[0]).toEqual({ id: 'C1', name: 'general', isPrivate: false });
    });

    it('should throw NotFoundException when not connected', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      await expect(controller.listChannels('ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT /config', () => {
    it('should update event channel configuration', async () => {
      const config = {
        eventChannelConfig: {
          deployment_failed: { channelId: 'C_ALERTS', channelName: '#alerts' },
        },
      };

      const result = await controller.updateConfig('ws-1', config);
      expect(result.connected).toBe(true);
      expect(slackService.updateConfig).toHaveBeenCalledWith('ws-1', config);
    });

    it('should throw NotFoundException when not connected', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      await expect(controller.updateConfig('ws-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /disconnect', () => {
    it('should disconnect and return void', async () => {
      await controller.disconnect('ws-1');
      expect(slackService.disconnect).toHaveBeenCalledWith('ws-1');
    });

    it('should throw NotFoundException when not connected', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      await expect(controller.disconnect('ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  // Story 21.1: Tests for new endpoints

  describe('GET /verify', () => {
    it('should return ok:true when connection is healthy', async () => {
      const result = await controller.verifyConnection('ws-1');
      expect(result.ok).toBe(true);
      expect(result.teamId).toBe('T12345');
      expect(oauthService.verifyConnection).toHaveBeenCalledWith('ws-1');
    });

    it('should return ok:false when connection is unhealthy', async () => {
      oauthService.verifyConnection.mockResolvedValue({ ok: false, error: 'invalid_auth' });
      const result = await controller.verifyConnection('ws-1');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_auth');
    });
  });

  describe('GET /refresh', () => {
    it('should return authorization URL with updated scopes', async () => {
      const req = { user: { sub: 'user-1' } };
      const result = await controller.refreshConnection('ws-1', req);
      expect(result.authUrl).toContain('https://slack.com');
      expect(oauthService.refreshConnection).toHaveBeenCalledWith('ws-1', 'user-1');
    });
  });

  describe('POST /users/auto-map', () => {
    it('should map users by email and return mapped count', async () => {
      const result = await controller.autoMapUsers('ws-1');
      expect(result.mapped).toBe(2);
      expect(userMappingService.autoMapByEmail).toHaveBeenCalledWith('ws-1', 'int-1');
    });

    it('should throw NotFoundException when no integration', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      await expect(controller.autoMapUsers('ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /users/map', () => {
    it('should create manual mapping successfully', async () => {
      const dto = { devosUserId: 'user-1', slackUserId: 'U001' };
      const result = await controller.mapUser('ws-1', dto);
      expect(result.id).toBe('mapping-1');
      expect(userMappingService.mapUser).toHaveBeenCalledWith('ws-1', 'int-1', 'user-1', 'U001');
    });

    it('should throw NotFoundException when no integration', async () => {
      slackService.getIntegration.mockResolvedValue(null);
      await expect(controller.mapUser('ws-1', { devosUserId: 'u1', slackUserId: 'U001' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /users/:mappingId', () => {
    it('should remove mapping and return void', async () => {
      await controller.unmapUser('ws-1', 'mapping-1');
      expect(userMappingService.unmapUser).toHaveBeenCalledWith('ws-1', 'mapping-1');
    });
  });

  describe('GET /users', () => {
    it('should return all user mappings', async () => {
      userMappingService.getMappings.mockResolvedValue([
        { id: '1', workspaceId: 'ws-1', devosUserId: 'u1', slackUserId: 'U001' },
      ]);
      const result = await controller.getUserMappings('ws-1');
      expect(result).toHaveLength(1);
      expect(userMappingService.getMappings).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('GET /users/slack-list', () => {
    it('should return Slack user list', async () => {
      const result = await controller.listSlackUsers('ws-1');
      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBe('U001');
      expect(userMappingService.listSlackUsers).toHaveBeenCalledWith('ws-1');
    });
  });
});
