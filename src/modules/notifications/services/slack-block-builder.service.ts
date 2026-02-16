/**
 * SlackBlockBuilderService
 * Story 16.4: Slack Notification Integration (AC8)
 *
 * Builds Slack Block Kit messages for each notification event type.
 * Uses color-coded attachments and deep link buttons.
 */

import { Injectable } from '@nestjs/common';
import { NotificationType } from '../events/notification.events';

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{
    type: string;
    text?: string | { type: string; text: string };
    url?: string;
    action_id?: string;
  }>;
  block_id?: string;
}

export interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

export interface SlackMessage {
  text: string; // Fallback plain text
  blocks?: SlackBlock[]; // Top-level blocks (header)
  attachments?: SlackAttachment[]; // Color-coded content
  unfurl_links: boolean;
  unfurl_media: boolean;
}

// Color constants
const COLORS = {
  GREEN: '#36a64f',
  TEAL: '#2EB67D',
  RED: '#E01E5A',
  YELLOW: '#ECB22E',
  BLUE: '#36C5F0',
} as const;

@Injectable()
export class SlackBlockBuilderService {
  /**
   * Build Slack Block Kit message for a notification event
   */
  buildMessage(
    type: NotificationType,
    payload: Record<string, any>,
    frontendUrl: string,
  ): SlackMessage {
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
        return this.buildContextDegraded(payload, frontendUrl);
      case 'context_critical':
        return this.buildContextCritical(payload, frontendUrl);
      default:
        return this.buildGenericMessage(type, payload);
    }
  }

  /**
   * Build test connection message
   */
  buildTestMessage(): SlackMessage {
    return {
      text: 'DevOS Slack integration is working!',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'DevOS Connected', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Your Slack workspace is now connected to DevOS. You will receive project notifications here.',
          },
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildStoryCompleted(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const storyTitle = this.truncate(payload.storyTitle || 'Unknown Story', 200);
    const agentName = payload.agentName || 'Unknown';
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/stories/${payload.storyId || ''}`;

    return {
      text: `Story Completed: ${storyTitle}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Story Completed', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.GREEN,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Story:*\n${storyTitle}` },
                { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
                { type: 'mrkdwn', text: `*Project:*\n${payload.projectId || 'N/A'}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Story' },
                  url: deepLink,
                  action_id: 'view_story',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildEpicCompleted(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const epicTitle = this.truncate(payload.epicTitle || 'Unknown Epic', 200);
    const storyCount = payload.storyCount || 0;
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/epics/${payload.epicId || ''}`;

    return {
      text: `Epic Completed: ${epicTitle}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Epic Completed', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.TEAL,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Epic:*\n${epicTitle}` },
                { type: 'mrkdwn', text: `*Stories:*\n${storyCount} completed` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Epic' },
                  url: deepLink,
                  action_id: 'view_epic',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildDeploymentSuccess(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const projectName = payload.projectName || 'Unknown Project';
    const environment = payload.environment || 'unknown';
    const deployUrl = payload.url || '';
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/deployments/${payload.deploymentId || ''}`;

    return {
      text: `Deployment Successful: ${projectName} to ${environment}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Deployment Successful', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.GREEN,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Project:*\n${projectName}` },
                { type: 'mrkdwn', text: `*Environment:*\n${environment}` },
                ...(deployUrl ? [{ type: 'mrkdwn', text: `*URL:*\n<${deployUrl}|${deployUrl}>` }] : []),
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Deployment' },
                  url: deepLink,
                  action_id: 'view_deployment',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildDeploymentFailed(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const projectName = payload.projectName || 'Unknown Project';
    const environment = payload.environment || 'unknown';
    const errorSummary = this.truncate(payload.errorSummary || 'Unknown error', 200);
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/deployments/${payload.deploymentId || ''}`;

    return {
      text: `Deployment Failed: ${projectName} to ${environment}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Deployment Failed', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.RED,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Project:*\n${projectName}` },
                { type: 'mrkdwn', text: `*Environment:*\n${environment}` },
                { type: 'mrkdwn', text: `*Error:*\n${errorSummary}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Logs' },
                  url: deepLink,
                  action_id: 'view_logs',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildAgentError(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const agentName = payload.agentName || 'Unknown Agent';
    const agentType = payload.agentType || 'unknown';
    const errorMessage = this.truncate(payload.errorMessage || 'Unknown error', 200);
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/agents/${payload.agentId || ''}`;

    return {
      text: `Agent Error: ${agentName} - ${errorMessage}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Agent Error', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.YELLOW,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
                { type: 'mrkdwn', text: `*Type:*\n${agentType}` },
                { type: 'mrkdwn', text: `*Error:*\n${errorMessage}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Agent' },
                  url: deepLink,
                  action_id: 'view_agent',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildAgentMessage(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const agentName = payload.agentName || 'Unknown Agent';
    const messagePreview = this.truncate(payload.messagePreview || '', 200);
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/chat/${payload.agentId || ''}`;

    return {
      text: `Agent Message from ${agentName}: ${messagePreview}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Agent Message', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.BLUE,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
                { type: 'mrkdwn', text: `*Message:*\n${messagePreview}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Reply' },
                  url: deepLink,
                  action_id: 'reply',
                },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildContextDegraded(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const previousHealth = payload.previousHealth || 'unknown';
    const currentHealth = payload.currentHealth || 'unknown';
    const issues = Array.isArray(payload.issues) ? payload.issues.join(', ') : 'No details';

    return {
      text: `Context Health Degraded: ${previousHealth} -> ${currentHealth}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Context Health Degraded', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.YELLOW,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Previous Health:*\n${previousHealth}` },
                { type: 'mrkdwn', text: `*Current Health:*\n${currentHealth}` },
                { type: 'mrkdwn', text: `*Issues:*\n${this.truncate(issues, 200)}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildContextCritical(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const issues = Array.isArray(payload.issues) ? payload.issues.join(', ') : 'No details';
    const criticalSince = payload.criticalSince || 'unknown';

    return {
      text: `Context Critical: ${issues}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Context Critical', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.RED,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Issues:*\n${this.truncate(issues, 200)}` },
                { type: 'mrkdwn', text: `*Critical Since:*\n${criticalSince}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
          ],
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
    };
  }

  private buildGenericMessage(type: string, payload: Record<string, any>): SlackMessage {
    return {
      text: `DevOS Notification: ${type}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'DevOS Notification', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `Type: ${type}` },
        },
      ],
      unfurl_links: false,
      unfurl_media: false,
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
