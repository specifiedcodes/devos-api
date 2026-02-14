/**
 * NotificationTriggerService
 * Story 10.5: Notification Triggers
 *
 * Listens to system events and triggers notifications.
 * Integrates with NestJS EventEmitter2 for event handling.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationRecipientResolver } from './notification-recipient.resolver';
import {
  NotificationEvent,
  NotificationEventNames,
  EpicCompletedEvent,
  StoryCompletedEvent,
  DeploymentSucceededEvent,
  DeploymentFailedEvent,
  AgentErrorEvent,
  AgentMessageEvent,
} from '../events/notification.events';

@Injectable()
export class NotificationTriggerService {
  private readonly logger = new Logger(NotificationTriggerService.name);

  constructor(
    private readonly dispatchService: NotificationDispatchService,
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {}

  /**
   * Handle epic completion event
   * Triggers: epic.completed
   */
  @OnEvent(NotificationEventNames.EPIC_COMPLETED)
  async handleEpicCompleted(event: EpicCompletedEvent): Promise<void> {
    try {
      this.logger.log(`Epic completed: ${event.epicTitle} (${event.epicId})`);

      const recipients = await this.recipientResolver.forWorkspace(event.workspaceId);

      const notification: NotificationEvent = {
        type: 'epic_completed',
        payload: {
          epicNumber: event.epicNumber,
          epicTitle: event.epicTitle,
          storyCount: event.storyCount,
          projectId: event.projectId,
          epicId: event.epicId,
        },
        recipients,
        urgency: 'normal',
        batchable: true,
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process epic completion: ${event.epicId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Handle story completion event
   * Triggers: story.completed
   */
  @OnEvent(NotificationEventNames.STORY_COMPLETED)
  async handleStoryCompleted(event: StoryCompletedEvent): Promise<void> {
    try {
      this.logger.log(`Story completed: ${event.storyTitle} (${event.storyId})`);

      const recipients = await this.recipientResolver.forProject(event.projectId);

      const notification: NotificationEvent = {
        type: 'story_completed',
        payload: {
          storyId: event.storyId,
          storyKey: event.storyKey,
          storyTitle: event.storyTitle,
          epicId: event.epicId,
          projectId: event.projectId,
          agentName: event.agentName,
        },
        recipients,
        urgency: 'normal',
        batchable: true,
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process story completion: ${event.storyId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Handle deployment success event
   * Triggers: deployment.succeeded
   */
  @OnEvent(NotificationEventNames.DEPLOYMENT_SUCCEEDED)
  async handleDeploymentSuccess(event: DeploymentSucceededEvent): Promise<void> {
    try {
      this.logger.log(`Deployment succeeded: ${event.projectName} to ${event.environment}`);

      const recipients = await this.recipientResolver.forProject(event.projectId);

      const notification: NotificationEvent = {
        type: 'deployment_success',
        payload: {
          deploymentId: event.deploymentId,
          projectId: event.projectId,
          projectName: event.projectName,
          environment: event.environment,
          url: event.url,
        },
        recipients,
        urgency: 'normal',
        batchable: true,
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process deployment success: ${event.deploymentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Handle deployment failure event
   * Triggers: deployment.failed
   * Critical - sent immediately, not batched
   */
  @OnEvent(NotificationEventNames.DEPLOYMENT_FAILED)
  async handleDeploymentFailed(event: DeploymentFailedEvent): Promise<void> {
    try {
      this.logger.warn(`Deployment failed: ${event.projectName} - ${event.errorSummary}`);

      const recipients = await this.recipientResolver.forProject(event.projectId);

      const notification: NotificationEvent = {
        type: 'deployment_failed',
        payload: {
          deploymentId: event.deploymentId,
          projectId: event.projectId,
          projectName: event.projectName,
          environment: event.environment,
          errorSummary: event.errorSummary,
        },
        recipients,
        urgency: 'high',
        batchable: false, // Critical - send immediately
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process deployment failure: ${event.deploymentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Handle agent error event
   * Triggers: agent.error
   * Critical - sent immediately, not batched
   */
  @OnEvent(NotificationEventNames.AGENT_ERROR)
  async handleAgentError(event: AgentErrorEvent): Promise<void> {
    try {
      this.logger.warn(`Agent error: ${event.agentName} - ${event.errorMessage}`);

      const recipients = await this.recipientResolver.forProject(event.projectId);

      const notification: NotificationEvent = {
        type: 'agent_error',
        payload: {
          agentId: event.agentId,
          agentName: event.agentName,
          agentType: event.agentType,
          projectId: event.projectId,
          errorMessage: event.errorMessage,
        },
        recipients,
        urgency: 'high',
        batchable: false, // Critical - send immediately
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process agent error: ${event.agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Handle agent message event
   * Triggers: agent.message
   */
  @OnEvent(NotificationEventNames.AGENT_MESSAGE)
  async handleAgentMessage(event: AgentMessageEvent): Promise<void> {
    try {
      this.logger.log(`Agent message from ${event.agentName} to user ${event.userId}`);

      // Only send to the specific user
      const recipients = await this.recipientResolver.forUser(event.userId, event.workspaceId);

      const notification: NotificationEvent = {
        type: 'agent_message',
        payload: {
          agentId: event.agentId,
          agentName: event.agentName,
          agentType: event.agentType,
          projectId: event.projectId,
          messagePreview: event.messagePreview,
        },
        recipients,
        urgency: 'normal',
        batchable: true,
      };

      await this.dispatchService.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Failed to process agent message: ${event.agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
