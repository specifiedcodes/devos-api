/**
 * NotificationDispatchService Slack Extension Tests
 * Story 16.4: Slack Notification Integration (AC6)
 *
 * Tests that the Slack dispatch integration in NotificationDispatchService
 * works correctly (fault-isolated, sends to all workspaces, etc.)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { SlackNotificationService } from '../services/slack-notification.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('NotificationDispatchService - Slack Extension', () => {
  let service: NotificationDispatchService;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PushNotificationService, useValue: mockPushService },
        { provide: NotificationService, useValue: mockInAppService },
        { provide: NotificationBatchService, useValue: mockBatchService },
        { provide: NotificationTemplateService, useValue: mockTemplateService },
        { provide: SlackNotificationService, useValue: mockSlackService },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
    slackService = module.get(SlackNotificationService);
    pushService = module.get(PushNotificationService);
    inAppService = module.get(NotificationService);
    batchService = module.get(NotificationBatchService);
  });

  it('should call slackService.sendNotification when Slack service is available', async () => {
    await service.dispatch(notification);

    expect(slackService.sendNotification).toHaveBeenCalled();
  });

  it('should send to all unique workspace IDs from recipients', async () => {
    await service.dispatch(notification);

    // Should be called for ws-1 and ws-2 (unique workspaces)
    expect(slackService.sendNotification).toHaveBeenCalledTimes(2);
    expect(slackService.sendNotification).toHaveBeenCalledWith('ws-1', expect.any(Object));
    expect(slackService.sendNotification).toHaveBeenCalledWith('ws-2', expect.any(Object));
  });

  it('should not throw when Slack service is null (graceful skip)', async () => {
    // Create a service without Slack
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn(), isEnabled: jest.fn().mockReturnValue(true) } },
        { provide: NotificationService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        { provide: NotificationBatchService, useValue: { queueNotification: jest.fn(), isImmediateNotification: jest.fn().mockReturnValue(false) } },
        { provide: NotificationTemplateService, useValue: { generateTitle: jest.fn().mockReturnValue(''), generateBody: jest.fn().mockReturnValue(''), generateDeepLink: jest.fn().mockReturnValue('/'), getIcon: jest.fn().mockReturnValue(''), getActions: jest.fn().mockReturnValue([]) } },
      ],
    }).compile();

    const serviceWithoutSlack = module.get<NotificationDispatchService>(NotificationDispatchService);
    await expect(serviceWithoutSlack.dispatch(notification)).resolves.not.toThrow();
  });

  it('should not throw when Slack send fails (error logged, continues)', async () => {
    slackService.sendNotification.mockRejectedValue(new Error('Slack API down'));

    await expect(service.dispatch(notification)).resolves.not.toThrow();
  });

  it('should still send push and in-app when Slack fails (isolation)', async () => {
    slackService.sendNotification.mockRejectedValue(new Error('Slack API down'));

    await service.dispatch(notification);

    // In-app should still be called for each recipient
    expect(inAppService.create).toHaveBeenCalledTimes(3);
    // Batch should still be called (batchable notification)
    expect(batchService.queueNotification).toHaveBeenCalled();
  });

  it('should call Slack after in-app and push (ordering)', async () => {
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

    await service.dispatch(notification);

    // In-app should come before slack
    const inAppIndex = callOrder.indexOf('in-app');
    const slackIndex = callOrder.indexOf('slack');
    expect(inAppIndex).toBeLessThan(slackIndex);
  });
});
