/**
 * NotificationDispatchService Discord Extension Tests
 * Story 16.5: Discord Notification Integration (AC6)
 *
 * Tests that the Discord dispatch integration in NotificationDispatchService
 * works correctly (fault-isolated, sends to all workspaces, etc.)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { SlackNotificationService } from '../services/slack-notification.service';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('NotificationDispatchService - Discord Extension', () => {
  let service: NotificationDispatchService;
  let discordService: jest.Mocked<DiscordNotificationService>;
  let slackService: jest.Mocked<SlackNotificationService>;
  let pushService: jest.Mocked<PushNotificationService>;
  let inAppService: jest.Mocked<NotificationService>;
  let batchService: jest.Mocked<NotificationBatchService>;

  const notification: NotificationEvent = {
    type: 'story_completed',
    payload: { storyId: 's1', storyTitle: 'Test' },
    recipients: [
      { userId: 'user-1', workspaceId: 'ws-1' },
      { userId: 'user-2', workspaceId: 'ws-1' },
      { userId: 'user-3', workspaceId: 'ws-2' },
    ],
    urgency: 'normal',
    batchable: true,
  };

  beforeEach(async () => {
    const mockPushService = {
      sendToUser: jest.fn().mockResolvedValue([]),
      isEnabled: jest.fn().mockReturnValue(true),
    };

    const mockInAppService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const mockBatchService = {
      queueNotification: jest.fn().mockResolvedValue(undefined),
      isImmediateNotification: jest.fn().mockReturnValue(false),
    };

    const mockTemplateService = {
      generateTitle: jest.fn().mockReturnValue('Test Title'),
      generateBody: jest.fn().mockReturnValue('Test Body'),
      generateDeepLink: jest.fn().mockReturnValue('/test/link'),
      getIcon: jest.fn().mockReturnValue('/icons/test.png'),
      getActions: jest.fn().mockReturnValue([]),
    };

    const mockSlackService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, channelId: 'C12345' }),
    };

    const mockDiscordService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, channelName: '#general' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PushNotificationService, useValue: mockPushService },
        { provide: NotificationService, useValue: mockInAppService },
        { provide: NotificationBatchService, useValue: mockBatchService },
        { provide: NotificationTemplateService, useValue: mockTemplateService },
        { provide: SlackNotificationService, useValue: mockSlackService },
        { provide: DiscordNotificationService, useValue: mockDiscordService },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
    discordService = module.get(DiscordNotificationService) as jest.Mocked<DiscordNotificationService>;
    slackService = module.get(SlackNotificationService) as jest.Mocked<SlackNotificationService>;
    pushService = module.get(PushNotificationService) as jest.Mocked<PushNotificationService>;
    inAppService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    batchService = module.get(NotificationBatchService) as jest.Mocked<NotificationBatchService>;
  });

  it('should call discordService.sendNotification when Discord service is available', async () => {
    await service.dispatch(notification);

    expect(discordService.sendNotification).toHaveBeenCalled();
  });

  it('should send to all unique workspace IDs from recipients', async () => {
    await service.dispatch(notification);

    // Should be called for ws-1 and ws-2 (unique workspaces)
    expect(discordService.sendNotification).toHaveBeenCalledTimes(2);
    expect(discordService.sendNotification).toHaveBeenCalledWith('ws-1', expect.any(Object));
    expect(discordService.sendNotification).toHaveBeenCalledWith('ws-2', expect.any(Object));
  });

  it('should not throw when Discord service is null (graceful skip)', async () => {
    // Create a service without Discord
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn(), isEnabled: jest.fn().mockReturnValue(true) } },
        { provide: NotificationService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        { provide: NotificationBatchService, useValue: { queueNotification: jest.fn(), isImmediateNotification: jest.fn().mockReturnValue(false) } },
        { provide: NotificationTemplateService, useValue: { generateTitle: jest.fn().mockReturnValue(''), generateBody: jest.fn().mockReturnValue(''), generateDeepLink: jest.fn().mockReturnValue('/'), getIcon: jest.fn().mockReturnValue(''), getActions: jest.fn().mockReturnValue([]) } },
      ],
    }).compile();

    const serviceWithoutDiscord = module.get<NotificationDispatchService>(NotificationDispatchService);
    await expect(serviceWithoutDiscord.dispatch(notification)).resolves.not.toThrow();
  });

  it('should not throw when Discord send fails (error logged, continues)', async () => {
    discordService.sendNotification.mockRejectedValue(new Error('Discord API down'));

    await expect(service.dispatch(notification)).resolves.not.toThrow();
  });

  it('should still send push, in-app, and Slack when Discord fails (isolation)', async () => {
    discordService.sendNotification.mockRejectedValue(new Error('Discord API down'));

    await service.dispatch(notification);

    // In-app should still be called for each recipient
    expect(inAppService.create).toHaveBeenCalledTimes(3);
    // Batch should still be called (batchable notification)
    expect(batchService.queueNotification).toHaveBeenCalled();
    // Slack should still be called
    expect(slackService.sendNotification).toHaveBeenCalled();
  });

  it('should call Discord after Slack (ordering)', async () => {
    const callOrder: string[] = [];

    inAppService.create.mockImplementation(async () => {
      callOrder.push('in-app');
      return { id: 'notif-1' } as any;
    });

    batchService.queueNotification.mockImplementation(async () => {
      callOrder.push('batch');
    });

    slackService.sendNotification.mockImplementation(async () => {
      callOrder.push('slack');
      return { sent: true, channelId: 'C12345' };
    });

    discordService.sendNotification.mockImplementation(async () => {
      callOrder.push('discord');
      return { sent: true, channelName: '#general' };
    });

    await service.dispatch(notification);

    // Slack should come before Discord
    const slackIndex = callOrder.indexOf('slack');
    const discordIndex = callOrder.indexOf('discord');
    expect(slackIndex).toBeLessThan(discordIndex);
  });

  it('should call both Slack and Discord when both are available (independent)', async () => {
    await service.dispatch(notification);

    expect(slackService.sendNotification).toHaveBeenCalled();
    expect(discordService.sendNotification).toHaveBeenCalled();
  });
});
