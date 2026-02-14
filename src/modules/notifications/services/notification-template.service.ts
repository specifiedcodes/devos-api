/**
 * NotificationTemplateService
 * Story 10.5: Notification Triggers
 *
 * Generates notification content (titles, bodies, icons, actions)
 * based on notification type and payload.
 */

import { Injectable } from '@nestjs/common';
import { NotificationType } from '../events/notification.events';

/**
 * Notification action button
 */
export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

@Injectable()
export class NotificationTemplateService {
  /**
   * Generate notification title based on type and payload
   */
  generateTitle(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'epic_completed':
        return `Epic ${payload.epicNumber}: ${payload.epicTitle} completed!`;

      case 'story_completed':
        return `Story ${payload.storyId} completed`;

      case 'deployment_success':
        return 'Deployment successful';

      case 'deployment_failed':
        return 'Deployment failed';

      case 'agent_error':
        return `${payload.agentName} needs attention`;

      case 'agent_message':
        return `Message from ${payload.agentName}`;

      default:
        return 'Notification';
    }
  }

  /**
   * Generate notification body based on type and payload
   */
  generateBody(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'epic_completed':
        return `All ${payload.storyCount} stories are done.`;

      case 'story_completed':
        if (payload.agentName) {
          return `${payload.agentName} finished: ${payload.storyTitle}`;
        }
        return `Completed: ${payload.storyTitle}`;

      case 'deployment_success':
        return `${payload.projectName} deployed to ${payload.environment}`;

      case 'deployment_failed':
        return `${payload.projectName}: ${payload.errorSummary}`;

      case 'agent_error':
        return this.truncate(payload.errorMessage, 100);

      case 'agent_message':
        return this.truncate(payload.messagePreview, 100);

      default:
        return '';
    }
  }

  /**
   * Generate deep link URL based on type and payload
   */
  generateDeepLink(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'epic_completed':
        return `/projects/${payload.projectId}/epics/${payload.epicId}`;

      case 'story_completed':
        return `/projects/${payload.projectId}/stories/${payload.storyId}`;

      case 'deployment_success':
      case 'deployment_failed':
        return `/projects/${payload.projectId}/deployments/${payload.deploymentId}`;

      case 'agent_error':
        return `/projects/${payload.projectId}/agents/${payload.agentId}`;

      case 'agent_message':
        return `/projects/${payload.projectId}/chat/${payload.agentId}`;

      default:
        return '/';
    }
  }

  /**
   * Get icon path based on type and payload
   */
  getIcon(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'epic_completed':
        return '/icons/epic-complete.svg';

      case 'story_completed':
        return '/icons/story-complete.svg';

      case 'deployment_success':
        return '/icons/deploy-success.svg';

      case 'deployment_failed':
        return '/icons/deploy-failed.svg';

      case 'agent_error':
      case 'agent_message':
        if (payload.agentType) {
          return `/icons/agent-${payload.agentType}.svg`;
        }
        return '/icons/agent-default.svg';

      default:
        return '/icons/notification.svg';
    }
  }

  /**
   * Get action buttons based on notification type
   */
  getActions(type: NotificationType): NotificationAction[] {
    switch (type) {
      case 'epic_completed':
        return [{ action: 'view-epic', title: 'View Epic' }];

      case 'story_completed':
        return [{ action: 'view-story', title: 'View Story' }];

      case 'deployment_success':
        return [
          { action: 'view-deployment', title: 'View' },
          { action: 'open-url', title: 'Open Site' },
        ];

      case 'deployment_failed':
        return [{ action: 'view-logs', title: 'View Logs' }];

      case 'agent_error':
        return [{ action: 'view-agent', title: 'View Agent' }];

      case 'agent_message':
        return [{ action: 'reply', title: 'Reply' }];

      default:
        return [];
    }
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
