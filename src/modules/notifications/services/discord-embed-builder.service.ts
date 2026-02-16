/**
 * DiscordEmbedBuilderService
 * Story 16.5: Discord Notification Integration (AC4)
 *
 * Builds Discord embed messages for each notification event type.
 * Uses color-coded embeds with fields, timestamps, and deep link URLs.
 */

import { Injectable } from '@nestjs/common';
import { NotificationType } from '../events/notification.events';

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number; // Decimal color code
  fields: Array<{ name: string; value: string; inline: boolean }>;
  timestamp: string; // ISO 8601
  footer: { text: string };
  url?: string; // Deep link to DevOS
}

export interface DiscordMessage {
  content: string; // Plain text (mentions go here)
  embeds: DiscordEmbed[];
}

// Color constants (decimal, not hex)
const COLORS = {
  GREEN: 3066993,    // #2ECC71 - success
  TEAL: 3066813,     // #2EB67D - epic completed
  RED: 14693450,     // #E01E5A - failure/critical
  YELLOW: 15514670,  // #ECB22E - warning
  BLUE: 3584883,     // #36B3F3 - info
} as const;

@Injectable()
export class DiscordEmbedBuilderService {
  /**
   * Build Discord embed message for a notification event
   */
  buildMessage(
    type: NotificationType,
    payload: Record<string, any>,
    frontendUrl: string,
  ): DiscordMessage {
    switch (type) {
      case 'story_completed':
        return this.buildStoryCompleted(payload, frontendUrl);
      case 'epic_completed':
        return this.buildEpicCompleted(payload, frontendUrl);
      case 'deployment_success':
        return this.buildDeploymentSuccess(payload, frontendUrl);
      case 'deployment_failed':
        return this.buildDeploymentFailed(payload, frontendUrl);
      case 'agent_error':
        return this.buildAgentError(payload, frontendUrl);
      case 'agent_message':
        return this.buildAgentMessage(payload, frontendUrl);
      case 'context_degraded':
        return this.buildContextDegraded(payload);
      case 'context_critical':
        return this.buildContextCritical(payload);
      default:
        return this.buildGenericMessage(type);
    }
  }

  /**
   * Build test connection message
   */
  buildTestMessage(): DiscordMessage {
    return {
      content: 'DevOS Discord integration is working!',
      embeds: [
        {
          title: 'DevOS Connected',
          description: 'Your Discord channel is now connected to DevOS. You will receive project notifications here.',
          color: COLORS.GREEN,
          fields: [],
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildStoryCompleted(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const storyTitle = this.truncate(payload.storyTitle || 'Unknown Story', 200);
    const agentName = payload.agentName || 'Unknown';
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/stories/${payload.storyId || ''}`;

    return {
      content: `Story Completed: ${storyTitle}`,
      embeds: [
        {
          title: 'Story Completed',
          description: storyTitle,
          color: COLORS.GREEN,
          fields: [
            { name: 'Story', value: storyTitle, inline: true },
            { name: 'Agent', value: agentName, inline: true },
            { name: 'Project', value: projectId || 'N/A', inline: true },
          ],
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildEpicCompleted(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const epicTitle = this.truncate(payload.epicTitle || 'Unknown Epic', 200);
    const storyCount = payload.storyCount || 0;
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/epics/${payload.epicId || ''}`;

    return {
      content: `Epic Completed: ${epicTitle}`,
      embeds: [
        {
          title: 'Epic Completed',
          description: epicTitle,
          color: COLORS.TEAL,
          fields: [
            { name: 'Epic', value: epicTitle, inline: true },
            { name: 'Stories', value: `${storyCount} completed`, inline: true },
          ],
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildDeploymentSuccess(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const projectName = payload.projectName || 'Unknown Project';
    const environment = payload.environment || 'unknown';
    const deployUrl = payload.url || '';
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/deployments/${payload.deploymentId || ''}`;

    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      { name: 'Project', value: projectName, inline: true },
      { name: 'Environment', value: environment, inline: true },
    ];

    if (deployUrl) {
      fields.push({ name: 'URL', value: deployUrl, inline: false });
    }

    return {
      content: `Deployment Successful: ${projectName} to ${environment}`,
      embeds: [
        {
          title: 'Deployment Successful',
          description: projectName,
          color: COLORS.GREEN,
          fields,
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildDeploymentFailed(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const projectName = payload.projectName || 'Unknown Project';
    const environment = payload.environment || 'unknown';
    const errorSummary = this.truncate(payload.errorSummary || 'Unknown error', 200);
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/deployments/${payload.deploymentId || ''}`;

    return {
      content: `Deployment Failed: ${projectName} to ${environment}`,
      embeds: [
        {
          title: 'Deployment Failed',
          description: projectName,
          color: COLORS.RED,
          fields: [
            { name: 'Project', value: projectName, inline: true },
            { name: 'Environment', value: environment, inline: true },
            { name: 'Error', value: errorSummary, inline: false },
          ],
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildAgentError(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const agentName = payload.agentName || 'Unknown Agent';
    const agentType = payload.agentType || 'unknown';
    const errorMessage = this.truncate(payload.errorMessage || 'Unknown error', 200);
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/agents/${payload.agentId || ''}`;

    return {
      content: `Agent Error: ${agentName} - ${this.truncate(errorMessage, 100)}`,
      embeds: [
        {
          title: 'Agent Error',
          description: agentName,
          color: COLORS.YELLOW,
          fields: [
            { name: 'Agent', value: agentName, inline: true },
            { name: 'Type', value: agentType, inline: true },
            { name: 'Error', value: errorMessage, inline: false },
          ],
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildAgentMessage(payload: Record<string, any>, frontendUrl: string): DiscordMessage {
    const agentName = payload.agentName || 'Unknown Agent';
    const messagePreview = this.truncate(payload.messagePreview || '', 200);
    const projectId = payload.projectId || '';
    const deepLink = `${frontendUrl}/projects/${projectId}/chat/${payload.agentId || ''}`;

    return {
      content: `Agent Message from ${agentName}: ${this.truncate(messagePreview, 100)}`,
      embeds: [
        {
          title: 'Agent Message',
          description: agentName,
          color: COLORS.BLUE,
          fields: [
            { name: 'Agent', value: agentName, inline: true },
            { name: 'Message', value: messagePreview || 'No message', inline: false },
          ],
          url: deepLink,
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildContextDegraded(payload: Record<string, any>): DiscordMessage {
    const previousHealth = payload.previousHealth || 'unknown';
    const currentHealth = payload.currentHealth || 'unknown';
    const issues = Array.isArray(payload.issues) ? payload.issues.join(', ') : 'No details';

    return {
      content: `Context Health Degraded: ${previousHealth} -> ${currentHealth}`,
      embeds: [
        {
          title: 'Context Health Degraded',
          color: COLORS.YELLOW,
          fields: [
            { name: 'Previous Health', value: previousHealth, inline: true },
            { name: 'Current Health', value: currentHealth, inline: true },
            { name: 'Issues', value: this.truncate(issues, 200), inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildContextCritical(payload: Record<string, any>): DiscordMessage {
    const issues = Array.isArray(payload.issues) ? payload.issues.join(', ') : 'No details';
    const criticalSince = payload.criticalSince || 'unknown';

    return {
      content: `Context Critical: ${this.truncate(issues, 100)}`,
      embeds: [
        {
          title: 'Context Critical',
          color: COLORS.RED,
          fields: [
            { name: 'Issues', value: this.truncate(issues, 200), inline: false },
            { name: 'Critical Since', value: criticalSince, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  private buildGenericMessage(type: string): DiscordMessage {
    return {
      content: `DevOS Notification: ${type}`,
      embeds: [
        {
          title: 'DevOS Notification',
          description: `Type: ${type}`,
          color: COLORS.BLUE,
          fields: [],
          timestamp: new Date().toISOString(),
          footer: { text: 'DevOS Notification' },
        },
      ],
    };
  }

  /**
   * Truncate text to specified length
   */
  private truncate(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}
