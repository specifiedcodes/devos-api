/**
 * SlackMessageProcessor Tests
 * Story 16.4: Slack Notification Integration (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SlackMessageProcessor, SLACK_NOTIFICATIONS_QUEUE } from '../processors/slack-message.processor';
import { SlackNotificationService } from '../services/slack-notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('SlackMessageProcessor', () => {
  let processor: SlackMessageProcessor;
  let slackService: any;

  const mockNotification: NotificationEvent = {
    type: 'story_completed',
    payload: { storyId: 's1', storyTitle: 'Test' },
    recipients: [{ userId: 'user-1', workspaceId: 'ws-1' }],
    urgency: 'normal',
    batchable: true,
  };

  beforeEach(async () => {
    slackService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, channelId: 'C12345' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackMessageProcessor,
        { provide: SlackNotificationService, useValue: slackService },
      ],
    }).compile();

    processor = module.get<SlackMessageProcessor>(SlackMessageProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleSendNotification', () => {
    it('should call slackService.sendNotification with correct parameters', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 1,
        },
      } as any;

      await processor.handleSendNotification(job);

      expect(slackService.sendNotification).toHaveBeenCalledWith('ws-1', mockNotification);
    });

    it('should succeed when Slack send returns { sent: true }', async () => {
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
      slackService.sendNotification.mockResolvedValue({ sent: false, error: 'channel_not_found' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          attempt: 1,
        },
      } as any;

      await expect(processor.handleSendNotification(job)).rejects.toThrow('channel_not_found');
    });

    it('should not throw after max attempts (3)', async () => {
      slackService.sendNotification.mockResolvedValue({ sent: false, error: 'channel_not_found' });

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
      expect(SLACK_NOTIFICATIONS_QUEUE).toBe('slack-notifications');
    });
  });
});
