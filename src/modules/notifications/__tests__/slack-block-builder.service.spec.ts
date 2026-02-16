/**
 * SlackBlockBuilderService Tests
 * Story 16.4: Slack Notification Integration (AC8)
 */

import { SlackBlockBuilderService, SlackMessage } from '../services/slack-block-builder.service';
import { NotificationType } from '../events/notification.events';

describe('SlackBlockBuilderService', () => {
  let service: SlackBlockBuilderService;
  const frontendUrl = 'https://app.devos.io';

  beforeEach(() => {
    service = new SlackBlockBuilderService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildMessage', () => {
    const allTypes: NotificationType[] = [
      'story_completed',
      'epic_completed',
      'deployment_success',
      'deployment_failed',
      'agent_error',
      'agent_message',
      'context_degraded',
      'context_critical',
    ];

    it.each(allTypes)('should return correct structure for %s', (type) => {
      const payload = buildPayloadForType(type);
      const message = service.buildMessage(type, payload, frontendUrl);

      // All messages must have fallback text
      expect(message.text).toBeDefined();
      expect(typeof message.text).toBe('string');
      expect(message.text.length).toBeGreaterThan(0);

      // All messages must have unfurl settings
      expect(message.unfurl_links).toBe(false);
      expect(message.unfurl_media).toBe(false);

      // Must have blocks (header)
      expect(message.blocks).toBeDefined();
      expect(Array.isArray(message.blocks)).toBe(true);
      expect(message.blocks!.length).toBeGreaterThan(0);
      expect(message.blocks![0].type).toBe('header');
    });

    it('should include fallback text for all types', () => {
      for (const type of allTypes) {
        const payload = buildPayloadForType(type);
        const message = service.buildMessage(type, payload, frontendUrl);
        expect(message.text).toBeTruthy();
      }
    });

    describe('color codes', () => {
      it('should use green (#36a64f) for story_completed', () => {
        const message = service.buildMessage('story_completed', buildPayloadForType('story_completed'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#36a64f');
      });

      it('should use teal (#2EB67D) for epic_completed', () => {
        const message = service.buildMessage('epic_completed', buildPayloadForType('epic_completed'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#2EB67D');
      });

      it('should use green (#36a64f) for deployment_success', () => {
        const message = service.buildMessage('deployment_success', buildPayloadForType('deployment_success'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#36a64f');
      });

      it('should use red (#E01E5A) for deployment_failed', () => {
        const message = service.buildMessage('deployment_failed', buildPayloadForType('deployment_failed'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#E01E5A');
      });

      it('should use yellow (#ECB22E) for agent_error', () => {
        const message = service.buildMessage('agent_error', buildPayloadForType('agent_error'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#ECB22E');
      });

      it('should use blue (#36C5F0) for agent_message', () => {
        const message = service.buildMessage('agent_message', buildPayloadForType('agent_message'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#36C5F0');
      });

      it('should use yellow (#ECB22E) for context_degraded', () => {
        const message = service.buildMessage('context_degraded', buildPayloadForType('context_degraded'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#ECB22E');
      });

      it('should use red (#E01E5A) for context_critical', () => {
        const message = service.buildMessage('context_critical', buildPayloadForType('context_critical'), frontendUrl);
        expect(message.attachments?.[0]?.color).toBe('#E01E5A');
      });
    });

    describe('deep link buttons', () => {
      it('should include "View Story" button for story_completed', () => {
        const message = service.buildMessage('story_completed', { projectId: 'p1', storyId: 's1', storyTitle: 'Test' }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('View Story');
        expect(actions!.elements![0].url).toContain(frontendUrl);
      });

      it('should include "View Epic" button for epic_completed', () => {
        const message = service.buildMessage('epic_completed', { projectId: 'p1', epicId: 'e1', epicTitle: 'Test', storyCount: 5 }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('View Epic');
        expect(actions!.elements![0].url).toContain(frontendUrl);
      });

      it('should include "View Deployment" button for deployment_success', () => {
        const message = service.buildMessage('deployment_success', { projectId: 'p1', deploymentId: 'd1', projectName: 'Test', environment: 'prod' }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('View Deployment');
        expect(actions!.elements![0].url).toContain(frontendUrl);
      });

      it('should include "View Logs" button for deployment_failed', () => {
        const message = service.buildMessage('deployment_failed', { projectId: 'p1', deploymentId: 'd1', projectName: 'Test', environment: 'prod', errorSummary: 'fail' }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('View Logs');
      });

      it('should include "View Agent" button for agent_error', () => {
        const message = service.buildMessage('agent_error', { projectId: 'p1', agentId: 'a1', agentName: 'Dev', agentType: 'dev', errorMessage: 'fail' }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('View Agent');
      });

      it('should include "Reply" button for agent_message', () => {
        const message = service.buildMessage('agent_message', { projectId: 'p1', agentId: 'a1', agentName: 'Dev', messagePreview: 'hello' }, frontendUrl);
        const actions = findActionsBlock(message);
        expect(actions).toBeDefined();
        expect((actions!.elements![0].text as any).text).toBe('Reply');
      });
    });

    it('should truncate long text fields to 200 characters', () => {
      const longText = 'x'.repeat(300);
      const message = service.buildMessage('agent_error', {
        projectId: 'p1',
        agentId: 'a1',
        agentName: 'Dev',
        agentType: 'dev',
        errorMessage: longText,
      }, frontendUrl);

      // Find the error field in attachment blocks
      const sectionBlock = message.attachments?.[0]?.blocks?.find(b => b.type === 'section');
      const errorField = sectionBlock?.fields?.find(f => f.text.includes('Error'));
      expect(errorField).toBeDefined();
      // Truncated text should be <= 200 + field prefix
      const errorText = errorField!.text.split('\n')[1];
      expect(errorText.length).toBeLessThanOrEqual(200);
      expect(errorText.endsWith('...')).toBe(true);
    });

    it('should handle missing optional payload fields gracefully', () => {
      const message = service.buildMessage('story_completed', {}, frontendUrl);
      expect(message.text).toBeDefined();
      expect(message.text).not.toContain('undefined');
      // Check that blocks don't contain 'undefined'
      const jsonStr = JSON.stringify(message);
      expect(jsonStr).not.toContain('"undefined"');
    });

    it('should set unfurl_links and unfurl_media to false', () => {
      for (const type of allTypes) {
        const message = service.buildMessage(type, buildPayloadForType(type), frontendUrl);
        expect(message.unfurl_links).toBe(false);
        expect(message.unfurl_media).toBe(false);
      }
    });
  });

  describe('buildTestMessage', () => {
    it('should return a valid test message', () => {
      const message = service.buildTestMessage();
      expect(message.text).toContain('DevOS');
      expect(message.blocks).toBeDefined();
      expect(message.blocks!.length).toBeGreaterThan(0);
      expect(message.unfurl_links).toBe(false);
      expect(message.unfurl_media).toBe(false);
    });

    it('should include DevOS branding', () => {
      const message = service.buildTestMessage();
      const headerBlock = message.blocks?.find(b => b.type === 'header');
      expect(headerBlock?.text?.text).toContain('DevOS');
    });
  });
});

// Helper functions
function buildPayloadForType(type: NotificationType): Record<string, any> {
  switch (type) {
    case 'story_completed':
      return { storyId: 's1', storyTitle: 'Test Story', projectId: 'p1', agentName: 'Dev Agent' };
    case 'epic_completed':
      return { epicId: 'e1', epicTitle: 'Test Epic', storyCount: 10, projectId: 'p1' };
    case 'deployment_success':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'MyApp', environment: 'production', url: 'https://myapp.com' };
    case 'deployment_failed':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'MyApp', environment: 'production', errorSummary: 'Build failed' };
    case 'agent_error':
      return { agentId: 'a1', agentName: 'Dev Agent', agentType: 'dev', projectId: 'p1', errorMessage: 'Out of memory' };
    case 'agent_message':
      return { agentId: 'a1', agentName: 'Dev Agent', projectId: 'p1', messagePreview: 'Task completed' };
    case 'context_degraded':
      return { projectId: 'p1', previousHealth: 'good', currentHealth: 'degraded', issues: ['Memory usage high', 'Token limit approaching'] };
    case 'context_critical':
      return { projectId: 'p1', issues: ['Token limit exceeded', 'Context corrupted'], criticalSince: '2026-02-16T10:00:00Z' };
    default:
      return {};
  }
}

function findActionsBlock(message: SlackMessage) {
  // Check in attachments
  if (message.attachments) {
    for (const attachment of message.attachments) {
      const actions = attachment.blocks.find(b => b.type === 'actions');
      if (actions) return actions;
    }
  }
  // Check in top-level blocks
  return message.blocks?.find(b => b.type === 'actions');
}
