/**
 * NotificationTemplateService Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationTemplateService } from '../services/notification-template.service';
import { NotificationType } from '../events/notification.events';

describe('NotificationTemplateService', () => {
  let service: NotificationTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationTemplateService],
    }).compile();

    service = module.get<NotificationTemplateService>(NotificationTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTitle', () => {
    it('should generate epic completed title', () => {
      const title = service.generateTitle('epic_completed', {
        epicNumber: 1,
        epicTitle: 'User Authentication',
      });
      expect(title).toBe('Epic 1: User Authentication completed!');
    });

    it('should generate story completed title', () => {
      const title = service.generateTitle('story_completed', {
        storyId: '1-2',
      });
      expect(title).toBe('Story 1-2 completed');
    });

    it('should generate deployment success title', () => {
      const title = service.generateTitle('deployment_success', {});
      expect(title).toBe('Deployment successful');
    });

    it('should generate deployment failed title', () => {
      const title = service.generateTitle('deployment_failed', {});
      expect(title).toBe('Deployment failed');
    });

    it('should generate agent error title', () => {
      const title = service.generateTitle('agent_error', {
        agentName: 'Dev Agent',
      });
      expect(title).toBe('Dev Agent needs attention');
    });

    it('should generate agent message title', () => {
      const title = service.generateTitle('agent_message', {
        agentName: 'QA Agent',
      });
      expect(title).toBe('Message from QA Agent');
    });
  });

  describe('generateBody', () => {
    it('should generate epic completed body', () => {
      const body = service.generateBody('epic_completed', {
        storyCount: 10,
      });
      expect(body).toBe('All 10 stories are done.');
    });

    it('should generate story completed body with agent name', () => {
      const body = service.generateBody('story_completed', {
        agentName: 'Dev Agent',
        storyTitle: 'User Login',
      });
      expect(body).toBe('Dev Agent finished: User Login');
    });

    it('should generate story completed body without agent name', () => {
      const body = service.generateBody('story_completed', {
        storyTitle: 'User Login',
      });
      expect(body).toBe('Completed: User Login');
    });

    it('should generate deployment success body', () => {
      const body = service.generateBody('deployment_success', {
        projectName: 'My App',
        environment: 'production',
      });
      expect(body).toBe('My App deployed to production');
    });

    it('should generate deployment failed body', () => {
      const body = service.generateBody('deployment_failed', {
        projectName: 'My App',
        errorSummary: 'Build failed: Missing dependency',
      });
      expect(body).toBe('My App: Build failed: Missing dependency');
    });

    it('should generate agent error body with truncation', () => {
      const longError = 'A'.repeat(150);
      const body = service.generateBody('agent_error', {
        errorMessage: longError,
      });
      expect(body.length).toBeLessThanOrEqual(100);
    });

    it('should generate agent message body with truncation', () => {
      const longMessage = 'B'.repeat(150);
      const body = service.generateBody('agent_message', {
        messagePreview: longMessage,
      });
      expect(body.length).toBeLessThanOrEqual(100);
    });
  });

  describe('generateDeepLink', () => {
    it('should generate epic completed deep link', () => {
      const url = service.generateDeepLink('epic_completed', {
        projectId: 'proj-123',
        epicId: 'epic-456',
      });
      expect(url).toBe('/projects/proj-123/epics/epic-456');
    });

    it('should generate story completed deep link', () => {
      const url = service.generateDeepLink('story_completed', {
        projectId: 'proj-123',
        storyId: 'story-456',
      });
      expect(url).toBe('/projects/proj-123/stories/story-456');
    });

    it('should generate deployment success deep link', () => {
      const url = service.generateDeepLink('deployment_success', {
        projectId: 'proj-123',
        deploymentId: 'deploy-456',
      });
      expect(url).toBe('/projects/proj-123/deployments/deploy-456');
    });

    it('should generate deployment failed deep link', () => {
      const url = service.generateDeepLink('deployment_failed', {
        projectId: 'proj-123',
        deploymentId: 'deploy-456',
      });
      expect(url).toBe('/projects/proj-123/deployments/deploy-456');
    });

    it('should generate agent error deep link', () => {
      const url = service.generateDeepLink('agent_error', {
        projectId: 'proj-123',
        agentId: 'agent-456',
      });
      expect(url).toBe('/projects/proj-123/agents/agent-456');
    });

    it('should generate agent message deep link', () => {
      const url = service.generateDeepLink('agent_message', {
        projectId: 'proj-123',
        agentId: 'agent-456',
      });
      expect(url).toBe('/projects/proj-123/chat/agent-456');
    });
  });

  describe('getIcon', () => {
    it('should return epic complete icon', () => {
      const icon = service.getIcon('epic_completed', {});
      expect(icon).toBe('/icons/epic-complete.svg');
    });

    it('should return story complete icon', () => {
      const icon = service.getIcon('story_completed', {});
      expect(icon).toBe('/icons/story-complete.svg');
    });

    it('should return deploy success icon', () => {
      const icon = service.getIcon('deployment_success', {});
      expect(icon).toBe('/icons/deploy-success.svg');
    });

    it('should return deploy failed icon', () => {
      const icon = service.getIcon('deployment_failed', {});
      expect(icon).toBe('/icons/deploy-failed.svg');
    });

    it('should return agent-specific icon for agent error', () => {
      const icon = service.getIcon('agent_error', { agentType: 'dev' });
      expect(icon).toBe('/icons/agent-dev.svg');
    });

    it('should return agent-specific icon for agent message', () => {
      const icon = service.getIcon('agent_message', { agentType: 'qa' });
      expect(icon).toBe('/icons/agent-qa.svg');
    });

    it('should return default agent icon if no agent type', () => {
      const icon = service.getIcon('agent_error', {});
      expect(icon).toBe('/icons/agent-default.svg');
    });
  });

  describe('getActions', () => {
    it('should return view epic action for epic completed', () => {
      const actions = service.getActions('epic_completed');
      expect(actions).toEqual([{ action: 'view-epic', title: 'View Epic' }]);
    });

    it('should return view story action for story completed', () => {
      const actions = service.getActions('story_completed');
      expect(actions).toEqual([{ action: 'view-story', title: 'View Story' }]);
    });

    it('should return multiple actions for deployment success', () => {
      const actions = service.getActions('deployment_success');
      expect(actions).toEqual([
        { action: 'view-deployment', title: 'View' },
        { action: 'open-url', title: 'Open Site' },
      ]);
    });

    it('should return view logs action for deployment failed', () => {
      const actions = service.getActions('deployment_failed');
      expect(actions).toEqual([{ action: 'view-logs', title: 'View Logs' }]);
    });

    it('should return view agent action for agent error', () => {
      const actions = service.getActions('agent_error');
      expect(actions).toEqual([{ action: 'view-agent', title: 'View Agent' }]);
    });

    it('should return reply action for agent message', () => {
      const actions = service.getActions('agent_message');
      expect(actions).toEqual([{ action: 'reply', title: 'Reply' }]);
    });
  });

  describe('handles missing data gracefully', () => {
    it('should handle missing epic data', () => {
      const title = service.generateTitle('epic_completed', {});
      expect(title).toBe('Epic undefined: undefined completed!');
    });

    it('should handle empty payload', () => {
      const body = service.generateBody('deployment_success', {});
      expect(body).toBe('undefined deployed to undefined');
    });

    it('should handle null payload values', () => {
      const url = service.generateDeepLink('story_completed', {
        projectId: null,
        storyId: null,
      });
      expect(url).toBe('/projects/null/stories/null');
    });
  });
});
