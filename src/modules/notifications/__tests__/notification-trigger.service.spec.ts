/**
 * NotificationTriggerService Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationTriggerService } from '../services/notification-trigger.service';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationRecipientResolver } from '../services/notification-recipient.resolver';
import {
  EpicCompletedEvent,
  StoryCompletedEvent,
  DeploymentSucceededEvent,
  DeploymentFailedEvent,
  AgentErrorEvent,
  AgentMessageEvent,
} from '../events/notification.events';

describe('NotificationTriggerService', () => {
  let service: NotificationTriggerService;
  let dispatchService: jest.Mocked<NotificationDispatchService>;
  let recipientResolver: jest.Mocked<NotificationRecipientResolver>;

  const mockRecipients = [
    { userId: 'user-1', workspaceId: 'workspace-1' },
    { userId: 'user-2', workspaceId: 'workspace-1' },
  ];

  beforeEach(async () => {
    const mockDispatchService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const mockRecipientResolver = {
      forWorkspace: jest.fn().mockResolvedValue(mockRecipients),
      forProject: jest.fn().mockResolvedValue(mockRecipients),
      forUser: jest.fn().mockResolvedValue([mockRecipients[0]]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTriggerService,
        {
          provide: NotificationDispatchService,
          useValue: mockDispatchService,
        },
        {
          provide: NotificationRecipientResolver,
          useValue: mockRecipientResolver,
        },
      ],
    }).compile();

    service = module.get<NotificationTriggerService>(NotificationTriggerService);
    dispatchService = module.get(NotificationDispatchService);
    recipientResolver = module.get(NotificationRecipientResolver);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEpicCompleted', () => {
    const epicEvent: EpicCompletedEvent = {
      epicId: 'epic-123',
      epicNumber: 1,
      epicTitle: 'User Authentication',
      storyCount: 10,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
    };

    it('should resolve workspace recipients', async () => {
      await service.handleEpicCompleted(epicEvent);
      expect(recipientResolver.forWorkspace).toHaveBeenCalledWith('workspace-1');
    });

    it('should dispatch notification with correct payload', async () => {
      await service.handleEpicCompleted(epicEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'epic_completed',
          payload: expect.objectContaining({
            epicNumber: 1,
            epicTitle: 'User Authentication',
            storyCount: 10,
            projectId: 'project-1',
            epicId: 'epic-123',
          }),
          recipients: mockRecipients,
          urgency: 'normal',
          batchable: true,
        }),
      );
    });
  });

  describe('handleStoryCompleted', () => {
    const storyEvent: StoryCompletedEvent = {
      storyId: 'story-123',
      storyKey: '1-2-user-auth',
      storyTitle: 'User Authentication',
      epicId: 'epic-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      agentName: 'Dev Agent',
    };

    it('should resolve project recipients', async () => {
      await service.handleStoryCompleted(storyEvent);
      expect(recipientResolver.forProject).toHaveBeenCalledWith('project-1');
    });

    it('should dispatch notification with batchable flag', async () => {
      await service.handleStoryCompleted(storyEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'story_completed',
          urgency: 'normal',
          batchable: true,
        }),
      );
    });
  });

  describe('handleDeploymentSuccess', () => {
    const deployEvent: DeploymentSucceededEvent = {
      deploymentId: 'deploy-123',
      projectId: 'project-1',
      projectName: 'My App',
      environment: 'production',
      workspaceId: 'workspace-1',
      url: 'https://myapp.com',
    };

    it('should dispatch notification with batchable flag', async () => {
      await service.handleDeploymentSuccess(deployEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_success',
          payload: expect.objectContaining({
            projectName: 'My App',
            environment: 'production',
            url: 'https://myapp.com',
          }),
          urgency: 'normal',
          batchable: true,
        }),
      );
    });
  });

  describe('handleDeploymentFailed', () => {
    const failEvent: DeploymentFailedEvent = {
      deploymentId: 'deploy-123',
      projectId: 'project-1',
      projectName: 'My App',
      environment: 'production',
      workspaceId: 'workspace-1',
      errorSummary: 'Build failed: Missing dependency',
    };

    it('should dispatch with high urgency', async () => {
      await service.handleDeploymentFailed(failEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_failed',
          urgency: 'high',
          batchable: false,
        }),
      );
    });
  });

  describe('handleAgentError', () => {
    const errorEvent: AgentErrorEvent = {
      agentId: 'agent-123',
      agentName: 'Dev Agent',
      agentType: 'dev',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      errorMessage: 'Failed to execute task',
    };

    it('should dispatch with high urgency', async () => {
      await service.handleAgentError(errorEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_error',
          urgency: 'high',
          batchable: false,
        }),
      );
    });

    it('should include agent details in payload', async () => {
      await service.handleAgentError(errorEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            agentName: 'Dev Agent',
            agentType: 'dev',
            errorMessage: 'Failed to execute task',
          }),
        }),
      );
    });
  });

  describe('handleAgentMessage', () => {
    const messageEvent: AgentMessageEvent = {
      agentId: 'agent-123',
      agentName: 'Dev Agent',
      agentType: 'dev',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      messagePreview: 'Task completed successfully',
    };

    it('should resolve single user recipient', async () => {
      await service.handleAgentMessage(messageEvent);
      expect(recipientResolver.forUser).toHaveBeenCalledWith('user-1', 'workspace-1');
    });

    it('should dispatch with batchable flag', async () => {
      await service.handleAgentMessage(messageEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_message',
          urgency: 'normal',
          batchable: true,
        }),
      );
    });

    it('should include message preview in payload', async () => {
      await service.handleAgentMessage(messageEvent);

      expect(dispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            messagePreview: 'Task completed successfully',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle dispatch errors gracefully', async () => {
      dispatchService.dispatch.mockRejectedValueOnce(new Error('Dispatch failed'));

      const epicEvent: EpicCompletedEvent = {
        epicId: 'epic-123',
        epicNumber: 1,
        epicTitle: 'Test Epic',
        storyCount: 5,
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      // Should not throw
      await expect(service.handleEpicCompleted(epicEvent)).resolves.not.toThrow();
    });

    it('should handle recipient resolution errors gracefully', async () => {
      recipientResolver.forWorkspace.mockRejectedValueOnce(new Error('Resolution failed'));

      const epicEvent: EpicCompletedEvent = {
        epicId: 'epic-123',
        epicNumber: 1,
        epicTitle: 'Test Epic',
        storyCount: 5,
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      // Should not throw
      await expect(service.handleEpicCompleted(epicEvent)).resolves.not.toThrow();
    });
  });
});
