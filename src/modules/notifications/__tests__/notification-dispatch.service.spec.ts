/**
 * NotificationDispatchService Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationEvent } from '../events/notification.events';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;
  let pushService: jest.Mocked<PushNotificationService>;
  let inAppService: jest.Mocked<NotificationService>;
  let batchService: jest.Mocked<NotificationBatchService>;
  let templateService: jest.Mocked<NotificationTemplateService>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PushNotificationService, useValue: mockPushService },
        { provide: NotificationService, useValue: mockInAppService },
        { provide: NotificationBatchService, useValue: mockBatchService },
        { provide: NotificationTemplateService, useValue: mockTemplateService },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
    pushService = module.get(PushNotificationService);
    inAppService = module.get(NotificationService);
    batchService = module.get(NotificationBatchService);
    templateService = module.get(NotificationTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dispatch', () => {
    const notification: NotificationEvent = {
      type: 'epic_completed',
      payload: {
        epicNumber: 1,
        epicTitle: 'User Auth',
        storyCount: 10,
        projectId: 'proj-1',
        epicId: 'epic-1',
      },
      recipients: [
        { userId: 'user-1', workspaceId: 'workspace-1' },
        { userId: 'user-2', workspaceId: 'workspace-1' },
      ],
      urgency: 'normal',
      batchable: true,
    };

    it('should create in-app notification for each recipient', async () => {
      await service.dispatch(notification);

      expect(inAppService.create).toHaveBeenCalledTimes(2);
      expect(inAppService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          workspaceId: 'workspace-1',
          type: 'epic_completed',
          title: 'Test Title',
          message: 'Test Body',
        }),
      );
    });

    it('should queue batchable notifications', async () => {
      await service.dispatch(notification);

      expect(batchService.queueNotification).toHaveBeenCalledWith(notification);
    });

    it('should send immediately for urgent notifications', async () => {
      batchService.isImmediateNotification.mockReturnValue(true);

      const urgentNotification: NotificationEvent = {
        ...notification,
        type: 'deployment_failed',
        urgency: 'high',
        batchable: false,
      };

      await service.dispatch(urgentNotification);

      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('should not queue immediate notifications', async () => {
      batchService.isImmediateNotification.mockReturnValue(true);

      const urgentNotification: NotificationEvent = {
        ...notification,
        urgency: 'high',
        batchable: false,
      };

      await service.dispatch(urgentNotification);

      expect(batchService.queueNotification).not.toHaveBeenCalled();
    });

    it('should use template service for content generation', async () => {
      batchService.isImmediateNotification.mockReturnValue(true);

      await service.dispatch(notification);

      expect(templateService.generateTitle).toHaveBeenCalledWith(
        'epic_completed',
        notification.payload,
      );
      expect(templateService.generateBody).toHaveBeenCalledWith(
        'epic_completed',
        notification.payload,
      );
      expect(templateService.generateDeepLink).toHaveBeenCalledWith(
        'epic_completed',
        notification.payload,
      );
    });
  });

  describe('sendPushToUser', () => {
    it('should build push payload correctly', async () => {
      const notification: NotificationEvent = {
        type: 'story_completed',
        payload: {
          storyId: 'story-1',
          storyTitle: 'Login Feature',
        },
        recipients: [{ userId: 'user-1', workspaceId: 'workspace-1' }],
        urgency: 'normal',
        batchable: true,
      };

      batchService.isImmediateNotification.mockReturnValue(true);

      await service.dispatch(notification);

      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: 'Test Title',
          body: 'Test Body',
          url: '/test/link',
          icon: '/icons/test.png',
          type: 'story_completed',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle push service errors gracefully', async () => {
      pushService.sendToUser.mockRejectedValue(new Error('Push failed'));
      batchService.isImmediateNotification.mockReturnValue(true);

      const notification: NotificationEvent = {
        type: 'agent_error',
        payload: {},
        recipients: [{ userId: 'user-1', workspaceId: 'workspace-1' }],
        urgency: 'high',
        batchable: false,
      };

      // Should not throw
      await expect(service.dispatch(notification)).resolves.not.toThrow();
    });

    it('should handle in-app service errors gracefully', async () => {
      inAppService.create.mockRejectedValue(new Error('DB error'));

      const notification: NotificationEvent = {
        type: 'epic_completed',
        payload: {},
        recipients: [{ userId: 'user-1', workspaceId: 'workspace-1' }],
        urgency: 'normal',
        batchable: true,
      };

      // Should not throw
      await expect(service.dispatch(notification)).resolves.not.toThrow();
    });

    it('should continue with other recipients if one fails', async () => {
      inAppService.create
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ id: 'notif-2' } as any);

      const notification: NotificationEvent = {
        type: 'epic_completed',
        payload: {},
        recipients: [
          { userId: 'user-1', workspaceId: 'workspace-1' },
          { userId: 'user-2', workspaceId: 'workspace-1' },
        ],
        urgency: 'normal',
        batchable: true,
      };

      await service.dispatch(notification);

      expect(inAppService.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('push disabled', () => {
    it('should skip push when service is disabled', async () => {
      pushService.isEnabled.mockReturnValue(false);
      batchService.isImmediateNotification.mockReturnValue(true);

      const notification: NotificationEvent = {
        type: 'agent_error',
        payload: {},
        recipients: [{ userId: 'user-1', workspaceId: 'workspace-1' }],
        urgency: 'high',
        batchable: false,
      };

      await service.dispatch(notification);

      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('should still create in-app notifications when push disabled', async () => {
      pushService.isEnabled.mockReturnValue(false);

      const notification: NotificationEvent = {
        type: 'epic_completed',
        payload: {},
        recipients: [{ userId: 'user-1', workspaceId: 'workspace-1' }],
        urgency: 'normal',
        batchable: true,
      };

      await service.dispatch(notification);

      expect(inAppService.create).toHaveBeenCalled();
    });
  });
});
