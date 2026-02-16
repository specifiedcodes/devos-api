/**
 * SlackNotificationController Tests
 * Story 16.4: Slack Notification Integration (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlackNotificationController } from '../controllers/slack-notification.controller';
import { SlackNotificationService } from '../services/slack-notification.service';
import { SlackOAuthService } from '../services/slack-oauth.service';

describe('SlackNotificationController', () => {
  let controller: SlackNotificationController;
  let slackService: any;
  let oauthService: any;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackNotificationController],
      providers: [
        { provide: SlackNotificationService, useValue: slackService },
        { provide: SlackOAuthService, useValue: oauthService },
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
});
