/**
 * NotificationDispatchService Email Extension Tests
 * Story 16.6: Production Email Service (AC10)
 *
 * Tests that the email dispatch integration in NotificationDispatchService
 * works correctly (fault-isolated, sends to recipients with email enabled, etc.)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { SlackNotificationService } from '../services/slack-notification.service';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { EmailNotificationService } from '../../email/services/email-notification.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('NotificationDispatchService - Email Extension', () => {
  let service: NotificationDispatchService;
  let emailService: jest.Mocked<EmailNotificationService>;
  let slackService: jest.Mocked<SlackNotificationService>;
  let discordService: jest.Mocked<DiscordNotificationService>;
  let pushService: jest.Mocked<PushNotificationService>;
  let inAppService: jest.Mocked<NotificationService>;
  let batchService: jest.Mocked<NotificationBatchService>;
  let preferencesService: jest.Mocked<NotificationPreferencesService>;

  const notification: NotificationEvent = {
    type: 'story_completed',
    payload: {
      storyId: 's1',
      storyTitle: 'Test',
      recipientEmail: 'user@example.com',
    },
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

    const mockEmailService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, messageId: 'msg-1' }),
    };

    const mockPreferencesService = {
      getPreferences: jest.fn().mockResolvedValue({
        emailEnabled: true,
        channelPreferences: { email: true, push: true, inApp: true },
      }),
      isTypeEnabled: jest.fn().mockResolvedValue(true),
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
        { provide: EmailNotificationService, useValue: mockEmailService },
        { provide: NotificationPreferencesService, useValue: mockPreferencesService },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
    emailService = module.get(EmailNotificationService) as jest.Mocked<EmailNotificationService>;
    slackService = module.get(SlackNotificationService) as jest.Mocked<SlackNotificationService>;
    discordService = module.get(DiscordNotificationService) as jest.Mocked<DiscordNotificationService>;
    pushService = module.get(PushNotificationService) as jest.Mocked<PushNotificationService>;
    inAppService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    batchService = module.get(NotificationBatchService) as jest.Mocked<NotificationBatchService>;
    preferencesService = module.get(NotificationPreferencesService) as jest.Mocked<NotificationPreferencesService>;
  });

  it('should call emailService.sendNotification when email service is available', async () => {
    await service.dispatch(notification);
    expect(emailService.sendNotification).toHaveBeenCalled();
  });

  it('should iterate over recipients and call emailService.sendNotification for each', async () => {
    await service.dispatch(notification);
    // Called once per recipient that has email enabled
    expect(emailService.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('should be a no-op when emailService is not injected', async () => {
    // Create a service without email
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        {
          provide: PushNotificationService,
          useValue: { sendToUser: jest.fn(), isEnabled: jest.fn().mockReturnValue(true) },
        },
        {
          provide: NotificationService,
          useValue: { create: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: NotificationBatchService,
          useValue: { queueNotification: jest.fn(), isImmediateNotification: jest.fn().mockReturnValue(false) },
        },
        {
          provide: NotificationTemplateService,
          useValue: {
            generateTitle: jest.fn().mockReturnValue(''),
            generateBody: jest.fn().mockReturnValue(''),
            generateDeepLink: jest.fn().mockReturnValue('/'),
            getIcon: jest.fn().mockReturnValue(''),
            getActions: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    const serviceWithoutEmail = module.get<NotificationDispatchService>(NotificationDispatchService);
    await expect(serviceWithoutEmail.dispatch(notification)).resolves.not.toThrow();
  });

  it('should catch errors per-recipient and continue with others', async () => {
    emailService.sendNotification
      .mockResolvedValueOnce({ sent: true, messageId: 'msg-1' })
      .mockRejectedValueOnce(new Error('Email API down'))
      .mockResolvedValueOnce({ sent: true, messageId: 'msg-3' });

    await expect(service.dispatch(notification)).resolves.not.toThrow();
    expect(emailService.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('should never throw (fault-isolated from main dispatch flow)', async () => {
    emailService.sendNotification.mockRejectedValue(new Error('Email service crashed'));

    await expect(service.dispatch(notification)).resolves.not.toThrow();
  });

  it('should still send push, in-app, Slack, and Discord when email fails (isolation)', async () => {
    emailService.sendNotification.mockRejectedValue(new Error('Email service crashed'));

    await service.dispatch(notification);

    // In-app should still be called for each recipient
    expect(inAppService.create).toHaveBeenCalledTimes(3);
    // Batch should still be called (batchable notification)
    expect(batchService.queueNotification).toHaveBeenCalled();
    // Slack should still be called
    expect(slackService.sendNotification).toHaveBeenCalled();
    // Discord should still be called
    expect(discordService.sendNotification).toHaveBeenCalled();
  });

  it('should call email after Discord (ordering)', async () => {
    const callOrder: string[] = [];

    slackService.sendNotification.mockImplementation(async () => {
      callOrder.push('slack');
      return { sent: true, channelId: 'C12345' };
    });

    discordService.sendNotification.mockImplementation(async () => {
      callOrder.push('discord');
      return { sent: true, channelName: '#general' };
    });

    emailService.sendNotification.mockImplementation(async () => {
      callOrder.push('email');
      return { sent: true, messageId: 'msg-1' };
    });

    await service.dispatch(notification);

    // Slack should come before Discord, Discord before Email
    const slackIndex = callOrder.indexOf('slack');
    const discordIndex = callOrder.indexOf('discord');
    const emailIndex = callOrder.indexOf('email');
    expect(slackIndex).toBeLessThan(discordIndex);
    expect(discordIndex).toBeLessThan(emailIndex);
  });

  it('should check user email notification preferences before sending', async () => {
    await service.dispatch(notification);
    expect(preferencesService.getPreferences).toHaveBeenCalled();
  });

  it('should skip email when user has emailEnabled=false', async () => {
    preferencesService.getPreferences.mockResolvedValue({
      emailEnabled: false,
      channelPreferences: { email: false, push: true, inApp: true },
    } as any);

    await service.dispatch(notification);
    expect(emailService.sendNotification).not.toHaveBeenCalled();
  });

  it('should call all channels when all services are available', async () => {
    await service.dispatch(notification);

    expect(slackService.sendNotification).toHaveBeenCalled();
    expect(discordService.sendNotification).toHaveBeenCalled();
    expect(emailService.sendNotification).toHaveBeenCalled();
  });
});
