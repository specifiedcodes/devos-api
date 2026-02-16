/**
 * DiscordEmbedBuilderService Tests
 * Story 16.5: Discord Notification Integration (AC4)
 */

import { DiscordEmbedBuilderService, DiscordMessage } from '../services/discord-embed-builder.service';
import { NotificationType } from '../events/notification.events';

describe('DiscordEmbedBuilderService', () => {
  let service: DiscordEmbedBuilderService;
  const frontendUrl = 'https://app.devos.io';

  beforeEach(() => {
    service = new DiscordEmbedBuilderService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildMessage', () => {
    it('should return correct structure for story_completed', () => {
      const payload = { storyId: 's1', storyTitle: 'Test Story', projectId: 'p1', agentName: 'Dev Agent' };
      const message = service.buildMessage('story_completed', payload, frontendUrl);

      expect(message.content).toContain('Story Completed');
      expect(message.embeds).toHaveLength(1);
      expect(message.embeds[0].title).toBe('Story Completed');
      expect(message.embeds[0].description).toBe('Test Story');
      expect(message.embeds[0].color).toBe(3066993); // GREEN
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Story', inline: true }),
          expect.objectContaining({ name: 'Agent', inline: true }),
          expect.objectContaining({ name: 'Project', inline: true }),
        ]),
      );
      expect(message.embeds[0].url).toBe(`${frontendUrl}/projects/p1/stories/s1`);
    });

    it('should return correct structure for epic_completed', () => {
      const payload = { epicId: 'e1', epicTitle: 'Test Epic', storyCount: 5, projectId: 'p1' };
      const message = service.buildMessage('epic_completed', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Epic Completed');
      expect(message.embeds[0].color).toBe(3066813); // TEAL
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Epic', inline: true }),
          expect.objectContaining({ name: 'Stories', value: '5 completed', inline: true }),
        ]),
      );
      expect(message.embeds[0].url).toBe(`${frontendUrl}/projects/p1/epics/e1`);
    });

    it('should return correct structure for deployment_success', () => {
      const payload = { deploymentId: 'd1', projectId: 'p1', projectName: 'MyApp', environment: 'prod', url: 'https://app.com' };
      const message = service.buildMessage('deployment_success', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Deployment Successful');
      expect(message.embeds[0].color).toBe(3066993); // GREEN
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Project', inline: true }),
          expect.objectContaining({ name: 'Environment', inline: true }),
          expect.objectContaining({ name: 'URL', value: 'https://app.com', inline: false }),
        ]),
      );
    });

    it('should return correct structure for deployment_failed', () => {
      const payload = { deploymentId: 'd1', projectId: 'p1', projectName: 'MyApp', environment: 'prod', errorSummary: 'Build failed' };
      const message = service.buildMessage('deployment_failed', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Deployment Failed');
      expect(message.embeds[0].color).toBe(14693450); // RED
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Error', value: 'Build failed', inline: false }),
        ]),
      );
    });

    it('should return correct structure for agent_error', () => {
      const payload = { agentId: 'a1', agentName: 'Dev', agentType: 'dev', projectId: 'p1', errorMessage: 'crash' };
      const message = service.buildMessage('agent_error', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Agent Error');
      expect(message.embeds[0].color).toBe(15514670); // YELLOW
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Agent', inline: true }),
          expect.objectContaining({ name: 'Type', inline: true }),
          expect.objectContaining({ name: 'Error', inline: false }),
        ]),
      );
    });

    it('should return correct structure for agent_message', () => {
      const payload = { agentId: 'a1', agentName: 'Dev', projectId: 'p1', messagePreview: 'hello' };
      const message = service.buildMessage('agent_message', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Agent Message');
      expect(message.embeds[0].color).toBe(3584883); // BLUE
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Agent', inline: true }),
          expect.objectContaining({ name: 'Message', inline: false }),
        ]),
      );
    });

    it('should return correct structure for context_degraded', () => {
      const payload = { previousHealth: 'good', currentHealth: 'degraded', issues: ['issue1'] };
      const message = service.buildMessage('context_degraded', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Context Health Degraded');
      expect(message.embeds[0].color).toBe(15514670); // YELLOW
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Previous Health', inline: true }),
          expect.objectContaining({ name: 'Current Health', inline: true }),
          expect.objectContaining({ name: 'Issues', inline: false }),
        ]),
      );
      // No URL for context events
      expect(message.embeds[0].url).toBeUndefined();
    });

    it('should return correct structure for context_critical', () => {
      const payload = { issues: ['critical issue'], criticalSince: '2026-02-16T10:00:00Z' };
      const message = service.buildMessage('context_critical', payload, frontendUrl);

      expect(message.embeds[0].title).toBe('Context Critical');
      expect(message.embeds[0].color).toBe(14693450); // RED
      expect(message.embeds[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Issues', inline: false }),
          expect.objectContaining({ name: 'Critical Since', inline: true }),
        ]),
      );
      expect(message.embeds[0].url).toBeUndefined();
    });

    it('should include content (plain text) for all types', () => {
      const types: NotificationType[] = [
        'story_completed', 'epic_completed', 'deployment_success', 'deployment_failed',
        'agent_error', 'agent_message', 'context_degraded', 'context_critical',
      ];

      for (const type of types) {
        const message = service.buildMessage(type, buildPayload(type), frontendUrl);
        expect(message.content).toBeTruthy();
        expect(typeof message.content).toBe('string');
      }
    });

    it('should use correct decimal color codes per event type', () => {
      const expectedColors: Record<string, number> = {
        story_completed: 3066993,
        epic_completed: 3066813,
        deployment_success: 3066993,
        deployment_failed: 14693450,
        agent_error: 15514670,
        agent_message: 3584883,
        context_degraded: 15514670,
        context_critical: 14693450,
      };

      for (const [type, expectedColor] of Object.entries(expectedColors)) {
        const message = service.buildMessage(type as NotificationType, buildPayload(type as NotificationType), frontendUrl);
        expect(message.embeds[0].color).toBe(expectedColor);
      }
    });

    it('should include deep link URLs using frontendUrl for applicable types', () => {
      const typesWithUrls: NotificationType[] = [
        'story_completed', 'epic_completed', 'deployment_success',
        'deployment_failed', 'agent_error', 'agent_message',
      ];

      for (const type of typesWithUrls) {
        const message = service.buildMessage(type, buildPayload(type), frontendUrl);
        expect(message.embeds[0].url).toContain(frontendUrl);
      }
    });

    it('should truncate long text fields to 200 characters', () => {
      const longError = 'x'.repeat(300);
      const payload = { agentId: 'a1', agentName: 'Dev', agentType: 'dev', projectId: 'p1', errorMessage: longError };
      const message = service.buildMessage('agent_error', payload, frontendUrl);

      const errorField = message.embeds[0].fields.find(f => f.name === 'Error');
      expect(errorField).toBeDefined();
      expect(errorField!.value.length).toBeLessThanOrEqual(200);
      expect(errorField!.value).toContain('...');
    });

    it('should handle missing optional payload fields gracefully (no undefined in output)', () => {
      const message = service.buildMessage('story_completed', {}, frontendUrl);

      expect(message.content).not.toContain('undefined');
      expect(message.embeds[0].description).not.toContain('undefined');
      for (const field of message.embeds[0].fields) {
        expect(field.value).not.toBe('undefined');
        expect(field.value).not.toContain('undefined');
      }
    });

    it('should include timestamp in ISO 8601 format for all embeds', () => {
      const types: NotificationType[] = [
        'story_completed', 'epic_completed', 'deployment_success', 'deployment_failed',
        'agent_error', 'agent_message', 'context_degraded', 'context_critical',
      ];

      for (const type of types) {
        const message = service.buildMessage(type, buildPayload(type), frontendUrl);
        expect(message.embeds[0].timestamp).toBeDefined();
        // Verify ISO 8601 format
        expect(new Date(message.embeds[0].timestamp).toISOString()).toBe(message.embeds[0].timestamp);
      }
    });

    it('should include footer with "DevOS Notification" text', () => {
      const types: NotificationType[] = [
        'story_completed', 'epic_completed', 'deployment_success', 'deployment_failed',
        'agent_error', 'agent_message', 'context_degraded', 'context_critical',
      ];

      for (const type of types) {
        const message = service.buildMessage(type, buildPayload(type), frontendUrl);
        expect(message.embeds[0].footer).toEqual({ text: 'DevOS Notification' });
      }
    });

    it('should use inline fields correctly (agent/project inline, error/issues not inline)', () => {
      // agent_error: Agent and Type inline, Error not inline
      const agentErrorMsg = service.buildMessage('agent_error', buildPayload('agent_error'), frontendUrl);
      const agentField = agentErrorMsg.embeds[0].fields.find(f => f.name === 'Agent');
      const typeField = agentErrorMsg.embeds[0].fields.find(f => f.name === 'Type');
      const errorField = agentErrorMsg.embeds[0].fields.find(f => f.name === 'Error');
      expect(agentField?.inline).toBe(true);
      expect(typeField?.inline).toBe(true);
      expect(errorField?.inline).toBe(false);

      // context_degraded: Previous Health and Current Health inline, Issues not inline
      const ctxMsg = service.buildMessage('context_degraded', buildPayload('context_degraded'), frontendUrl);
      const prevField = ctxMsg.embeds[0].fields.find(f => f.name === 'Previous Health');
      const currField = ctxMsg.embeds[0].fields.find(f => f.name === 'Current Health');
      const issuesField = ctxMsg.embeds[0].fields.find(f => f.name === 'Issues');
      expect(prevField?.inline).toBe(true);
      expect(currField?.inline).toBe(true);
      expect(issuesField?.inline).toBe(false);
    });
  });

  describe('buildTestMessage', () => {
    it('should return a valid test message with DevOS branding', () => {
      const message = service.buildTestMessage();

      expect(message.content).toContain('DevOS');
      expect(message.embeds).toHaveLength(1);
      expect(message.embeds[0].title).toContain('DevOS');
      expect(message.embeds[0].description).toContain('connected');
      expect(message.embeds[0].color).toBe(3066993); // GREEN
      expect(message.embeds[0].footer).toEqual({ text: 'DevOS Notification' });
      expect(message.embeds[0].timestamp).toBeDefined();
    });
  });
});

function buildPayload(type: NotificationType): Record<string, any> {
  switch (type) {
    case 'story_completed':
      return { storyId: 's1', storyTitle: 'Test', projectId: 'p1', agentName: 'Dev' };
    case 'epic_completed':
      return { epicId: 'e1', epicTitle: 'Test', storyCount: 5, projectId: 'p1' };
    case 'deployment_success':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'App', environment: 'prod', url: 'https://app.com' };
    case 'deployment_failed':
      return { deploymentId: 'd1', projectId: 'p1', projectName: 'App', environment: 'prod', errorSummary: 'fail' };
    case 'agent_error':
      return { agentId: 'a1', agentName: 'Dev', agentType: 'dev', projectId: 'p1', errorMessage: 'crash' };
    case 'agent_message':
      return { agentId: 'a1', agentName: 'Dev', projectId: 'p1', messagePreview: 'hello' };
    case 'context_degraded':
      return { projectId: 'p1', previousHealth: 'good', currentHealth: 'degraded', issues: ['issue1'] };
    case 'context_critical':
      return { projectId: 'p1', issues: ['critical issue'], criticalSince: '2026-02-16T10:00:00Z' };
    default:
      return {};
  }
}
