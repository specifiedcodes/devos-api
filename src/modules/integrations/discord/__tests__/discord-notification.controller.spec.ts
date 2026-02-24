/**
 * DiscordNotificationController Tests
 * Story 21.3: Discord Webhook Integration (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DiscordNotificationController } from '../../../notifications/controllers/discord-notification.controller';
import { DiscordNotificationService } from '../../../notifications/services/discord-notification.service';
import { DiscordNotificationConfigService } from '../services/discord-notification-config.service';

describe('DiscordNotificationController (Story 21.3)', () => {
  let controller: DiscordNotificationController;
  let discordService: jest.Mocked<DiscordNotificationService>;
  let configService: jest.Mocked<DiscordNotificationConfigService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockConfigId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordNotificationController],
      providers: [
        {
          provide: DiscordNotificationService,
          useValue: {
            getIntegration: jest.fn(),
            addWebhook: jest.fn(),
            testConnection: jest.fn(),
            updateConfig: jest.fn(),
            disconnect: jest.fn(),
            getDetailedStatus: jest.fn(),
            verifyWebhook: jest.fn(),
          },
        },
        {
          provide: DiscordNotificationConfigService,
          useValue: {
            getConfigs: jest.fn(),
            upsertConfig: jest.fn(),
            toggleConfig: jest.fn(),
            deleteConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DiscordNotificationController>(DiscordNotificationController);
    discordService = module.get(DiscordNotificationService) as jest.Mocked<DiscordNotificationService>;
    configService = module.get(DiscordNotificationConfigService) as jest.Mocked<DiscordNotificationConfigService>;
  });

  describe('GET /detailed-status', () => {
    it('returns full status for connected integration', async () => {
      const detailedStatus = {
        connected: true,
        name: 'Discord',
        guildName: 'Test Guild',
        status: 'active',
        messageCount: 42,
        errorCount: 0,
      };
      discordService.getDetailedStatus.mockResolvedValue(detailedStatus);

      const result = await controller.getDetailedStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.name).toBe('Discord');
      expect(discordService.getDetailedStatus).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('returns connected:false when no integration', async () => {
      discordService.getDetailedStatus.mockResolvedValue({ connected: false });

      const result = await controller.getDetailedStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });
  });

  describe('POST /verify-webhook', () => {
    it('returns valid:true for valid webhook', async () => {
      discordService.verifyWebhook.mockResolvedValue({
        valid: true,
        guildName: 'Test Guild',
        channelName: 'general',
      });

      const result = await controller.verifyWebhook({
        webhookUrl: 'https://discord.com/api/webhooks/123456/abcdef',
      });

      expect(result.valid).toBe(true);
    });

    it('returns valid:false for invalid webhook', async () => {
      discordService.verifyWebhook.mockResolvedValue({
        valid: false,
        error: 'Webhook not found',
      });

      const result = await controller.verifyWebhook({
        webhookUrl: 'https://discord.com/api/webhooks/999/invalid',
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('GET /notification-configs', () => {
    it('returns all configs', async () => {
      const configs = [
        { id: '1', eventType: 'story_completed', isEnabled: true },
        { id: '2', eventType: 'epic_completed', isEnabled: false },
      ];
      configService.getConfigs.mockResolvedValue(configs as any);

      const result = await controller.getNotificationConfigs(mockWorkspaceId);

      expect(result).toHaveLength(2);
      expect(configService.getConfigs).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('returns empty array when none exist', async () => {
      configService.getConfigs.mockResolvedValue([]);

      const result = await controller.getNotificationConfigs(mockWorkspaceId);

      expect(result).toEqual([]);
    });
  });

  describe('PUT /notification-configs', () => {
    it('creates new config', async () => {
      const config = { id: '1', eventType: 'story_completed', isEnabled: true };
      configService.upsertConfig.mockResolvedValue(config as any);

      const result = await controller.upsertNotificationConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        isEnabled: true,
      });

      expect(result.eventType).toBe('story_completed');
      expect(configService.upsertConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({ eventType: 'story_completed' }),
      );
    });

    it('updates existing config', async () => {
      const config = { id: '1', eventType: 'story_completed', isEnabled: false };
      configService.upsertConfig.mockResolvedValue(config as any);

      const result = await controller.upsertNotificationConfig(mockWorkspaceId, {
        eventType: 'story_completed',
        isEnabled: false,
      });

      expect(result.isEnabled).toBe(false);
    });
  });

  describe('PATCH /notification-configs/:configId/toggle', () => {
    it('enables config', async () => {
      const config = { id: mockConfigId, eventType: 'story_completed', isEnabled: true };
      configService.toggleConfig.mockResolvedValue(config as any);

      const result = await controller.toggleNotificationConfig(
        mockWorkspaceId,
        mockConfigId,
        { isEnabled: true },
      );

      expect(result.isEnabled).toBe(true);
      expect(configService.toggleConfig).toHaveBeenCalledWith(mockWorkspaceId, mockConfigId, true);
    });

    it('disables config', async () => {
      const config = { id: mockConfigId, eventType: 'story_completed', isEnabled: false };
      configService.toggleConfig.mockResolvedValue(config as any);

      const result = await controller.toggleNotificationConfig(
        mockWorkspaceId,
        mockConfigId,
        { isEnabled: false },
      );

      expect(result.isEnabled).toBe(false);
    });

    it('returns 404 for non-existent config', async () => {
      configService.toggleConfig.mockRejectedValue(new NotFoundException());

      await expect(
        controller.toggleNotificationConfig(mockWorkspaceId, mockConfigId, { isEnabled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /notification-configs/:configId', () => {
    it('deletes config (204)', async () => {
      configService.deleteConfig.mockResolvedValue(undefined);

      await controller.deleteNotificationConfig(mockWorkspaceId, mockConfigId);

      expect(configService.deleteConfig).toHaveBeenCalledWith(mockWorkspaceId, mockConfigId);
    });

    it('returns 404 for non-existent', async () => {
      configService.deleteConfig.mockRejectedValue(new NotFoundException());

      await expect(
        controller.deleteNotificationConfig(mockWorkspaceId, mockConfigId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Existing endpoints (regression)', () => {
    it('GET /status returns integration status', async () => {
      discordService.getIntegration.mockResolvedValue({
        id: '1',
        name: 'Discord',
        guildName: 'Guild',
        defaultChannelName: '#general',
        status: 'active',
        messageCount: 10,
        lastMessageAt: null,
      } as any);

      const result = await controller.getStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.name).toBe('Discord');
    });

    it('GET /status returns connected:false when no integration', async () => {
      discordService.getIntegration.mockResolvedValue(null);

      const result = await controller.getStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });

    it('POST /test calls testConnection', async () => {
      discordService.testConnection.mockResolvedValue({ success: true });

      const result = await controller.testConnection(mockWorkspaceId);

      expect(result.success).toBe(true);
    });

    it('DELETE /disconnect throws 404 when no integration', async () => {
      discordService.getIntegration.mockResolvedValue(null);

      await expect(controller.disconnect(mockWorkspaceId)).rejects.toThrow(NotFoundException);
    });
  });
});
