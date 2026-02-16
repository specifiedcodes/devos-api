/**
 * DiscordMessageProcessor Tests
 * Story 16.5: Discord Notification Integration (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DiscordMessageProcessor, DISCORD_NOTIFICATIONS_QUEUE } from '../processors/discord-message.processor';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('DiscordMessageProcessor', () => {
  let processor: DiscordMessageProcessor;
  let discordService: any;

  const mockNotification: NotificationEvent = {
    type: 'story_completed',
    payload: { storyId: 's1', storyTitle: 'Test' },
    recipients: [{ userId: 'user-1', workspaceId: 'ws-1' }],
    urgency: 'normal',
    batchable: true,
  };

  beforeEach(async () => {
    discordService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, channelName: '#general' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordMessageProcessor,
        { provide: DiscordNotificationService, useValue: discordService },
      ],
    }).compile();

    processor = module.get<DiscordMessageProcessor>(DiscordMessageProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleSendNotification', () => {
    it('should call discordService.sendNotification with correct parameters', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 1,
        },
      } as any;

      await processor.handleSendNotification(job);

      expect(discordService.sendNotification).toHaveBeenCalledWith('ws-1', mockNotification);
    });

    it('should succeed when Discord send returns { sent: true }', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 1,
        },
      } as any;

      await expect(processor.handleSendNotification(job)).resolves.not.toThrow();
    });

    it('should throw on failure to trigger BullMQ retry', async () => {
      discordService.sendNotification.mockResolvedValue({ sent: false, error: 'webhook_not_found' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 1,
        },
      } as any;

      await expect(processor.handleSendNotification(job)).rejects.toThrow('webhook_not_found');
    });

    it('should not throw after max attempts (3)', async () => {
      discordService.sendNotification.mockResolvedValue({ sent: false, error: 'webhook_not_found' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 3,
        },
      } as any;

      await expect(processor.handleSendNotification(job)).resolves.not.toThrow();
    });
  });

  describe('queue configuration', () => {
    it('should have correct queue name', () => {
      expect(DISCORD_NOTIFICATIONS_QUEUE).toBe('discord-notifications');
    });
  });
});
