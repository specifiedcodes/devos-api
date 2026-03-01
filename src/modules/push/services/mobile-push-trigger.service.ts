/**
 * Mobile Push Notification Trigger Service
 * Story 22.7: Mobile Push Notifications
 *
 * Integrates with existing notification events and dispatches
 * mobile push notifications via the MobilePushService.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MobilePushService } from './mobile-push.service';
import {
  MobileNotificationCategory,
  NotificationEvent,
  NOTIFICATION_EVENT_TYPES,
} from '../constants/notification-categories';

export interface AgentTaskCompleteEvent {
  userId: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  storyId: string;
  storyTitle: string;
}

export interface AgentErrorEvent {
  userId: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  storyId: string;
  storyTitle: string;
  errorMessage: string;
}

export interface DeploymentStatusEvent {
  userId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  deploymentId: string;
  storyId: string;
  storyTitle: string;
  status: 'succeeded' | 'failed';
  environment: string;
}

export interface ApprovalRequiredEvent {
  userId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  approvalId: string;
  storyId: string;
  storyTitle: string;
  environment: string;
}

export interface CostAlertEvent {
  userId: string;
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  percentage: number;
  limit: number;
  current: number;
}

export interface SprintCompleteEvent {
  userId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  sprintId: string;
  sprintName: string;
  completedStories: number;
  totalStories: number;
}

@Injectable()
export class MobilePushTriggerService implements OnModuleInit {
  private readonly logger = new Logger(MobilePushTriggerService.name);

  constructor(private readonly mobilePushService: MobilePushService) {}

  onModuleInit() {
    this.logger.log('Mobile push trigger service initialized');
  }

  @OnEvent('agent.task.completed')
  async handleAgentTaskComplete(event: AgentTaskCompleteEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.AGENT_TASK_COMPLETE,
      title: `${event.agentName} finished task`,
      body: `Story ${event.storyTitle} implementation complete`,
      category: MobileNotificationCategory.AGENT,
      priority: 'normal',
      data: {
        projectId: event.projectId,
        agentId: event.agentId,
        storyId: event.storyId,
        deepLink: `devos://projects/${event.projectId}/stories/${event.storyId}`,
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent agent task complete notification to user ${event.userId}`);
  }

  @OnEvent('agent.error')
  async handleAgentError(event: AgentErrorEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.AGENT_ERROR,
      title: `${event.agentName} encountered an error`,
      body: `Error on Story ${event.storyTitle}: ${event.errorMessage}`,
      category: MobileNotificationCategory.AGENT,
      priority: 'high',
      data: {
        projectId: event.projectId,
        agentId: event.agentId,
        storyId: event.storyId,
        deepLink: `devos://projects/${event.projectId}/agents/${event.agentId}`,
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent agent error notification to user ${event.userId}`);
  }

  @OnEvent('deployment.succeeded')
  async handleDeploymentSucceeded(event: DeploymentStatusEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.DEPLOYMENT_SUCCEEDED,
      title: `Deployment succeeded`,
      body: `Story ${event.storyTitle} deployed to ${event.environment}`,
      category: MobileNotificationCategory.DEPLOYMENT,
      priority: 'normal',
      data: {
        projectId: event.projectId,
        deploymentId: event.deploymentId,
        storyId: event.storyId,
        deepLink: `devos://projects/${event.projectId}/deployments/${event.deploymentId}`,
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent deployment succeeded notification to user ${event.userId}`);
  }

  @OnEvent('deployment.failed')
  async handleDeploymentFailed(event: DeploymentStatusEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.DEPLOYMENT_FAILED,
      title: `Deployment failed`,
      body: `Failed to deploy Story ${event.storyTitle} to ${event.environment}`,
      category: MobileNotificationCategory.DEPLOYMENT,
      priority: 'high',
      data: {
        projectId: event.projectId,
        deploymentId: event.deploymentId,
        storyId: event.storyId,
        deepLink: `devos://projects/${event.projectId}/deployments/${event.deploymentId}`,
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent deployment failed notification to user ${event.userId}`);
  }

  @OnEvent('approval.required')
  async handleApprovalRequired(event: ApprovalRequiredEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED,
      title: `Approve ${event.environment} deployment?`,
      body: `Story ${event.storyTitle} is ready for ${event.environment} deployment`,
      category: MobileNotificationCategory.DEPLOYMENT,
      priority: 'high',
      data: {
        projectId: event.projectId,
        approvalId: event.approvalId,
        storyId: event.storyId,
        deepLink: `devos://projects/${event.projectId}/approvals/${event.approvalId}`,
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent approval required notification to user ${event.userId}`);
  }

  @OnEvent('cost.alert')
  async handleCostAlert(event: CostAlertEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.COST_ALERT,
      title: `API costs at ${event.percentage}% of monthly limit`,
      body: `Current: $${event.current.toFixed(2)} / Limit: $${event.limit.toFixed(2)}`,
      category: MobileNotificationCategory.COST,
      priority: 'high',
      data: {
        projectId: event.projectId,
        deepLink: event.projectId
          ? `devos://projects/${event.projectId}?tab=costs`
          : 'devos://settings?tab=costs',
      },
    };

    await this.mobilePushService.sendToUser(event.userId, event.workspaceId, notification);
    this.logger.debug(`Sent cost alert notification to user ${event.userId}`);
  }

  @OnEvent('sprint.complete')
  async handleSprintComplete(event: SprintCompleteEvent): Promise<void> {
    const notification: NotificationEvent = {
      type: NOTIFICATION_EVENT_TYPES.SPRINT_COMPLETE,
      title: `${event.sprintName} completed`,
      body: `${event.completedStories}/${event.totalStories} stories done`,
      category: MobileNotificationCategory.SPRINT,
      priority: 'normal',
      data: {
        projectId: event.projectId,
        sprintId: event.sprintId,
        deepLink: `devos://projects/${event.projectId}?tab=sprints&sprintId=${event.sprintId}`,
      },
    };

    await this.mobilePushService.sendToWorkspace(event.workspaceId, notification, event.userId);
    this.logger.debug(`Sent sprint complete notification to workspace ${event.workspaceId}`);
  }

  async sendTestNotification(userId: string, workspaceId: string): Promise<void> {
    const notification: NotificationEvent = {
      type: 'test_notification',
      title: 'Test Notification',
      body: 'This is a test push notification from DevOS',
      category: MobileNotificationCategory.AGENT,
      priority: 'normal',
      data: {
        deepLink: 'devos://notifications',
      },
    };

    await this.mobilePushService.sendToUser(userId, workspaceId, notification);
  }
}
