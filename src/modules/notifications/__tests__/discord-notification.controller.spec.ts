/**
 * DiscordNotificationController Tests
 * Story 16.5: Discord Notification Integration (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DiscordNotificationController } from '../controllers/discord-notification.controller';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';

describe('DiscordNotificationController', () => {
  let controller: DiscordNotificationController;
  let discordService: jest.Mocked<DiscordNotificationService>;

  const mockIntegration: Partial<DiscordIntegration> = {
    id: 'int-1',
    workspaceId: 'ws-1',
    name: 'Discord',
    defaultWebhookUrl: 'encrypted',
    defaultWebhookUrlIv: 'embedded',
    defaultWebhookId: '123456',
    defaultChannelName: '#general',
    guildId: 'guild-1',
    guildName: 'Test Server',
    status: 'active',
    eventWebhookConfig: {},
    quietHoursConfig: null,
    rateLimitPerMinute: 30,
    mentionConfig: { critical: null, normal: null },
    messageCount: 5,
    errorCount: 0,
    lastMessageAt: new Date('2026-02-16T10:00:00Z'),
    connectedAt: new Date('2026-02-01T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockDiscordService = {
      addWebhook: jest.fn().mockResolvedValue({
        success: true,
        guildName: 'Test Server',
        channelName: '#general',
      }),
      getIntegration: jest.fn().mockResolvedValue({ ...mockIntegration }),
      testConnection: jest.fn().mockResolvedValue({ success: true }),
      updateConfig: jest.fn().mockResolvedValue({ ...mockIntegration }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordNotificationController],
      providers: [
        { provide: DiscordNotificationService, useValue: mockDiscordService },
      ],
    }).compile();

    controller = module.get<DiscordNotificationController>(DiscordNotificationController);
    discordService = module.get(DiscordNotificationService) as jest.Mocked<DiscordNotificationService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /webhook', () => {
    it('should call discordService.addWebhook and return result', async () => {
      const body = {
        webhookUrl: 'https://discord.com/api/webhooks/123456/abcdef',
        channelName: '#general',
      };
      const req = { user: { sub: 'user-1' } };

      const result = await controller.addWebhook('ws-1', body, req);

      expect(discordService.addWebhook).toHaveBeenCalledWith('ws-1', 'user-1', body.webhookUrl, '#general');
      expect(result.success).toBe(true);
      expect(result.guildName).toBe('Test Server');
    });

    it('should return error on invalid webhook URL', async () => {
      discordService.addWebhook.mockResolvedValue({
        success: false,
        error: 'Invalid Discord webhook URL format',
      });

      const body = { webhookUrl: 'https://evil.com/webhooks/123/abc' };
      const req = { user: { sub: 'user-1' } };

      const result = await controller.addWebhook('ws-1', body as any, req);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('GET /status', () => {
    it('should return { connected: false } when no integration exists', async () => {
      discordService.getIntegration.mockResolvedValue(null);

      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(false);
    });

    it('should return full status when integration exists', async () => {
      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(true);
      expect(result.name).toBe('Discord');
      expect(result.guildName).toBe('Test Server');
      expect(result.defaultChannelName).toBe('#general');
      expect(result.status).toBe('active');
      expect(result.messageCount).toBe(5);
    });
  });

  describe('POST /test', () => {
    it('should send test embed and return result', async () => {
      const result = await controller.testConnection('ws-1');
      expect(result.success).toBe(true);
      expect(discordService.testConnection).toHaveBeenCalledWith('ws-1');
    });

    it('should return { success: false } when not connected', async () => {
      discordService.testConnection.mockResolvedValue({ success: false, error: 'No Discord integration found' });

      const result = await controller.testConnection('ws-1');
      expect(result.success).toBe(false);
    });
  });

  describe('PUT /config', () => {
    it('should update configuration fields', async () => {
      const config = { name: 'Discord Alerts', rateLimitPerMinute: 20 };

      const result = await controller.updateConfig('ws-1', config);

      expect(discordService.updateConfig).toHaveBeenCalledWith('ws-1', config);
      expect(result.connected).toBe(true);
    });

    it('should return 404 when not connected', async () => {
      discordService.getIntegration.mockResolvedValue(null);

      await expect(
        controller.updateConfig('ws-1', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /disconnect', () => {
    it('should remove integration and return 204', async () => {
      await controller.disconnect('ws-1');

      expect(discordService.disconnect).toHaveBeenCalledWith('ws-1');
    });

    it('should return 404 when not connected', async () => {
      discordService.getIntegration.mockResolvedValue(null);

      await expect(controller.disconnect('ws-1')).rejects.toThrow(NotFoundException);
    });
  });
});
