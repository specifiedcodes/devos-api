/**
 * SlackBlockBuilderService
 * Story 16.4: Slack Notification Integration (AC8)
 * Story 21.2: Slack Interactive Components (AC3) - Added interactive message types
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
    style?: string;
    value?: string;
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
      case 'deployment_pending_approval':
        return this.buildDeploymentApproval(payload, frontendUrl);
      case 'agent_needs_input':
        return this.buildAgentNeedsInput(payload, frontendUrl);
      case 'agent_task_started':
        return this.buildAgentTaskStarted(payload, frontendUrl);
      case 'agent_task_completed':
        return this.buildAgentTaskCompleted(payload, frontendUrl);
      case 'cost_alert_warning':
        return this.buildCostAlertWarning(payload, frontendUrl);
      case 'cost_alert_exceeded':
        return this.buildCostAlertExceeded(payload, frontendUrl);
      case 'sprint_review_ready':
        return this.buildSprintReviewReady(payload, frontendUrl);
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

  // ============================================================
  // Story 21.2: Interactive Message Builders
  // ============================================================

  private buildDeploymentApproval(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const projectName = this.truncate(payload.projectName || 'Unknown Project', 200);
    const environment = payload.environment || 'unknown';
    const requestedBy = payload.requestedBy || 'Unknown';
    const storyTitle = payload.storyTitle ? this.truncate(payload.storyTitle, 200) : undefined;
    const deploymentId = payload.deploymentId || '';
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/deployments/${deploymentId}`;

    const fields: Array<{ type: string; text: string }> = [
      { type: 'mrkdwn', text: `*Project:*\n${projectName}` },
      { type: 'mrkdwn', text: `*Environment:*\n${environment}` },
      { type: 'mrkdwn', text: `*Requested By:*\n${requestedBy}` },
    ];
    if (storyTitle) {
      fields.push({ type: 'mrkdwn', text: `*Story:*\n${storyTitle}` });
    }

    return {
      text: `Deployment Approval Required: ${projectName} to ${environment}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Deployment Approval Required', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.YELLOW,
          blocks: [
            {
              type: 'section',
              fields,
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              block_id: `deploy_actions_${deploymentId}`,
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Approve' },
                  action_id: `approve_deploy:${deploymentId}`,
                  style: 'primary',
                  value: deploymentId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Reject' },
                  action_id: `reject_deploy:${deploymentId}`,
                  style: 'danger',
                  value: deploymentId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View in DevOS' },
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

  private buildAgentNeedsInput(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const agentName = this.truncate(payload.agentName || 'Unknown Agent', 200);
    const question = this.truncate(payload.question || 'No question provided', 500);
    const agentId = payload.agentId || '';
    const conversationId = payload.conversationId || '';
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/chat/${agentId}`;

    return {
      text: `Agent Needs Your Input: ${agentName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Agent Needs Your Input', emoji: true },
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
                { type: 'mrkdwn', text: `*Type:*\n${payload.agentType || 'unknown'}` },
              ],
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Question:*\n${question}` },
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` },
              ],
            },
            {
              type: 'actions',
              block_id: `agent_input_${agentId}`,
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Respond' },
                  action_id: `respond_agent:${agentId}:${conversationId}`,
                  style: 'primary',
                  value: `${agentId}:${conversationId}`,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View in DevOS' },
                  url: deepLink,
                  action_id: 'view_agent_chat',
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

  private buildAgentTaskStarted(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const agentName = this.truncate(payload.agentName || 'Unknown Agent', 200);
    const storyTitle = this.truncate(payload.storyTitle || 'Unknown Story', 200);
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/stories/${payload.storyId || ''}`;

    return {
      text: `Agent Task Started: ${agentName} working on ${storyTitle}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Agent Task Started', emoji: true },
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
                { type: 'mrkdwn', text: `*Type:*\n${payload.agentType || 'unknown'}` },
                { type: 'mrkdwn', text: `*Story:*\n${storyTitle}` },
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

  private buildAgentTaskCompleted(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const agentName = this.truncate(payload.agentName || 'Unknown Agent', 200);
    const storyTitle = this.truncate(payload.storyTitle || 'Unknown Story', 200);
    const filesChanged = payload.filesChanged ?? 0;
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/stories/${payload.storyId || ''}`;

    return {
      text: `Agent Task Completed: ${agentName} finished ${storyTitle}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Agent Task Completed', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.GREEN,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
                { type: 'mrkdwn', text: `*Type:*\n${payload.agentType || 'unknown'}` },
                { type: 'mrkdwn', text: `*Story:*\n${storyTitle}` },
                { type: 'mrkdwn', text: `*Files Changed:*\n${filesChanged}` },
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

  private buildCostAlertWarning(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const currentCost = typeof payload.currentCost === 'number' ? payload.currentCost.toFixed(2) : '0.00';
    const limit = typeof payload.limit === 'number' ? payload.limit.toFixed(2) : '0.00';
    const percentage = typeof payload.percentage === 'number' ? payload.percentage : 0;
    const currency = payload.currency || 'USD';
    const deepLink = `${frontendUrl}/settings/costs`;

    return {
      text: `Cost Alert: Budget Warning - ${percentage}% of limit reached`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Cost Alert: Budget Warning', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.YELLOW,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Current Cost:*\n${currency} ${currentCost}` },
                { type: 'mrkdwn', text: `*Limit:*\n${currency} ${limit}` },
                { type: 'mrkdwn', text: `*Usage:*\n${percentage}%` },
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
                  text: { type: 'plain_text', text: 'View Cost Dashboard' },
                  url: deepLink,
                  action_id: 'view_costs',
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

  private buildCostAlertExceeded(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const currentCost = typeof payload.currentCost === 'number' ? payload.currentCost.toFixed(2) : '0.00';
    const limit = typeof payload.limit === 'number' ? payload.limit.toFixed(2) : '0.00';
    const currency = payload.currency || 'USD';
    const deepLink = `${frontendUrl}/settings/costs`;

    return {
      text: `Cost Alert: Budget Exceeded - ${currency} ${currentCost} / ${currency} ${limit}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Cost Alert: Budget Exceeded', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.RED,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Current Cost:*\n${currency} ${currentCost}` },
                { type: 'mrkdwn', text: `*Limit:*\n${currency} ${limit}` },
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
                  text: { type: 'plain_text', text: 'View Cost Dashboard' },
                  url: deepLink,
                  action_id: 'view_costs',
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

  private buildSprintReviewReady(payload: Record<string, any>, frontendUrl: string): SlackMessage {
    const sprintName = this.truncate(payload.sprintName || 'Unknown Sprint', 200);
    const completedStories = payload.completedStories ?? 0;
    const totalStories = payload.totalStories ?? 0;
    const deepLink = `${frontendUrl}/projects/${payload.projectId || ''}/sprints`;

    return {
      text: `Sprint Review Ready: ${sprintName} (${completedStories}/${totalStories} stories)`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Sprint Review Ready', emoji: true },
        },
      ],
      attachments: [
        {
          color: COLORS.TEAL,
          blocks: [
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Sprint:*\n${sprintName}` },
                { type: 'mrkdwn', text: `*Completed:*\n${completedStories} of ${totalStories} stories` },
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
                  text: { type: 'plain_text', text: 'View Sprint' },
                  url: deepLink,
                  action_id: 'view_sprint',
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
