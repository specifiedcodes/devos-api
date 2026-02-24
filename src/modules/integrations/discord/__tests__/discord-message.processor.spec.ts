/**
 * DiscordMessageProcessor Tests
 * Story 21.3: Discord Webhook Integration (AC9)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DiscordMessageProcessor } from '../../../notifications/processors/discord-message.processor';
import { DiscordNotificationService } from '../../../notifications/services/discord-notification.service';

describe('DiscordMessageProcessor', () => {
  let processor: DiscordMessageProcessor;
  let discordService: jest.Mocked<DiscordNotificationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordMessageProcessor,
        {
          provide: DiscordNotificationService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<DiscordMessageProcessor>(DiscordMessageProcessor);
    discordService = module.get(DiscordNotificationService) as jest.Mocked<DiscordNotificationService>;
  });

  it('calls sendNotification with job data', async () => {
    discordService.sendNotification.mockResolvedValue({ sent: true });

    const job = {
      data: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        notification: {
          type: 'story_completed' as const,
          payload: { storyTitle: 'Test' },
          recipients: [],
          urgency: 'normal' as const,
          batchable: false,
        },
        attempt: 1,
      },
    } as any;

    await processor.handleSendNotification(job);

    expect(discordService.sendNotification).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      job.data.notification,
    );
  });

  it('throws on failure for retry (attempt < 3)', async () => {
    discordService.sendNotification.mockResolvedValue({ sent: false, error: 'Rate limited' });

    const job = {
      data: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        notification: {
          type: 'story_completed' as const,
          payload: {},
          recipients: [],
          urgency: 'normal' as const,
          batchable: false,
        },
        attempt: 1,
      },
    } as any;

    await expect(processor.handleSendNotification(job)).rejects.toThrow('Rate limited');
  });

  it('completes without throwing after max attempts', async () => {
    discordService.sendNotification.mockResolvedValue({ sent: false, error: 'Rate limited' });

    const job = {
      data: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        notification: {
          type: 'story_completed' as const,
          payload: {},
          recipients: [],
          urgency: 'normal' as const,
          batchable: false,
        },
        attempt: 3,
      },
    } as any;

    // Should NOT throw after max attempts
    await expect(processor.handleSendNotification(job)).resolves.not.toThrow();
  });

  it('succeeds on first attempt when notification sends', async () => {
    discordService.sendNotification.mockResolvedValue({ sent: true, channelName: '#general' });

    const job = {
      data: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        notification: {
          type: 'deployment_success' as const,
          payload: {},
          recipients: [],
          urgency: 'normal' as const,
          batchable: false,
        },
        attempt: 1,
      },
    } as any;

    await processor.handleSendNotification(job);

    expect(discordService.sendNotification).toHaveBeenCalledTimes(1);
  });
});
