/**
 * Notification Integration Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationTriggerService } from '../services/notification-trigger.service';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationBatchService } from '../services/notification-batch.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { NotificationRecipientResolver } from '../services/notification-recipient.resolver';
import { PushNotificationService } from '../../push/push.service';
import { NotificationService } from '../../notification/notification.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { RedisService } from '../../redis/redis.service';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';
import { Project } from '../../../database/entities/project.entity';
import { NotificationEventNames } from '../events/notification.events';

describe('Notification Integration Tests', () => {
  let module: TestingModule;
  let eventEmitter: EventEmitter2;
  let triggerService: NotificationTriggerService;
  let pushService: jest.Mocked<PushNotificationService>;
  let inAppService: jest.Mocked<NotificationService>;

  const mockRecipients = [
    { userId: 'user-1', workspaceId: 'workspace-1' },
    { userId: 'user-2', workspaceId: 'workspace-1' },
  ];

  beforeEach(async () => {
    // Create mock services
    const mockPushService = {
      sendToUser: jest.fn().mockResolvedValue([{ success: true }]),
      isEnabled: jest.fn().mockReturnValue(true),
    };

    const mockInAppService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
    };

    const mockWorkspacesService = {
      getMembers: jest.fn().mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]),
    };

    const mockSubscriptionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', workspaceId: 'workspace-1' },
        { id: 'sub-2', userId: 'user-2', workspaceId: 'workspace-1' },
      ]),
      count: jest.fn().mockResolvedValue(1),
    };

    const mockProjectRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'project-1',
        workspaceId: 'workspace-1',
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        EventEmitter2,
        NotificationTriggerService,
        NotificationDispatchService,
        NotificationBatchService,
        NotificationTemplateService,
        NotificationRecipientResolver,
        { provide: PushNotificationService, useValue: mockPushService },
        { provide: NotificationService, useValue: mockInAppService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: WorkspacesService, useValue: mockWorkspacesService },
        { provide: getRepositoryToken(PushSubscription), useValue: mockSubscriptionRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
      ],
    }).compile();

    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    triggerService = module.get<NotificationTriggerService>(NotificationTriggerService);
    pushService = module.get(PushNotificationService);
    inAppService = module.get(NotificationService);
  });

  describe('Epic Completion Flow', () => {
    it('should send notifications when epic.completed event is emitted', async () => {
      const epicEvent = {
        epicId: 'epic-123',
        epicNumber: 1,
        epicTitle: 'User Authentication',
        storyCount: 10,
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      await triggerService.handleEpicCompleted(epicEvent);

      // Should create in-app notifications
      expect(inAppService.create).toHaveBeenCalledTimes(2);
      expect(inAppService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'epic_completed',
          title: expect.stringContaining('Epic 1'),
        }),
      );
    });
  });

  describe('Story Completion Flow', () => {
    it('should send notifications when story.completed event is emitted', async () => {
      const storyEvent = {
        storyId: 'story-123',
        storyKey: '1-2-user-auth',
        storyTitle: 'User Authentication',
        epicId: 'epic-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentName: 'Dev Agent',
      };

      await triggerService.handleStoryCompleted(storyEvent);

      expect(inAppService.create).toHaveBeenCalled();
      expect(inAppService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'story_completed',
        }),
      );
    });
  });

  describe('Deployment Failed Flow', () => {
    it('should send immediate push notification for deployment failure', async () => {
      const failEvent = {
        deploymentId: 'deploy-123',
        projectId: 'project-1',
        projectName: 'My App',
        environment: 'production',
        workspaceId: 'workspace-1',
        errorSummary: 'Build failed: Missing dependency',
      };

      await triggerService.handleDeploymentFailed(failEvent);

      // Should send push immediately (not batched)
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'deployment_failed',
          title: 'Deployment failed',
        }),
      );
    });
  });

  describe('Agent Error Flow', () => {
    it('should send immediate notification for agent errors', async () => {
      const errorEvent = {
        agentId: 'agent-123',
        agentName: 'Dev Agent',
        agentType: 'dev',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        errorMessage: 'Failed to execute task: API timeout',
      };

      await triggerService.handleAgentError(errorEvent);

      // Should send push immediately
      expect(pushService.sendToUser).toHaveBeenCalled();
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'agent_error',
          title: 'Dev Agent needs attention',
        }),
      );
    });
  });

  describe('Agent Message Flow', () => {
    it('should send notification to specific user for agent messages', async () => {
      const messageEvent = {
        agentId: 'agent-123',
        agentName: 'QA Agent',
        agentType: 'qa',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        messagePreview: 'Test run completed successfully',
      };

      await triggerService.handleAgentMessage(messageEvent);

      expect(inAppService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_message',
          title: 'Message from QA Agent',
        }),
      );
    });
  });

  describe('Batch Processing', () => {
    it('should queue batchable notifications', async () => {
      const storyEvent = {
        storyId: 'story-123',
        storyKey: '1-2-user-auth',
        storyTitle: 'User Authentication',
        epicId: 'epic-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      await triggerService.handleStoryCompleted(storyEvent);

      // Story completions should be queued (not sent immediately)
      // The mock returns empty for keys, so push won't be sent
      expect(inAppService.create).toHaveBeenCalled();
    });
  });

  describe('Error Resilience', () => {
    it('should continue processing other recipients if one fails', async () => {
      inAppService.create
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValueOnce({ id: 'notif-2' } as any);

      const epicEvent = {
        epicId: 'epic-123',
        epicNumber: 1,
        epicTitle: 'Test Epic',
        storyCount: 5,
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      // Should not throw
      await expect(triggerService.handleEpicCompleted(epicEvent)).resolves.not.toThrow();

      // Should still try second recipient
      expect(inAppService.create).toHaveBeenCalledTimes(2);
    });

    it('should handle push service failures gracefully', async () => {
      pushService.sendToUser.mockRejectedValue(new Error('Push service unavailable'));

      const errorEvent = {
        agentId: 'agent-123',
        agentName: 'Dev Agent',
        agentType: 'dev',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        errorMessage: 'Task failed',
      };

      // Should not throw
      await expect(triggerService.handleAgentError(errorEvent)).resolves.not.toThrow();
    });
  });

  describe('Template Content Generation', () => {
    it('should generate correct deep links', async () => {
      const epicEvent = {
        epicId: 'epic-456',
        epicNumber: 3,
        epicTitle: 'Payment Integration',
        storyCount: 8,
        projectId: 'project-789',
        workspaceId: 'workspace-1',
      };

      await triggerService.handleEpicCompleted(epicEvent);

      expect(inAppService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            deepLink: '/projects/project-789/epics/epic-456',
          }),
        }),
      );
    });
  });
});
