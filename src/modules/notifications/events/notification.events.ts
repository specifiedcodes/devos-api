/**
 * Notification Event Definitions
 * Story 10.5: Notification Triggers
 *
 * Defines all notification event types and their payloads.
 */

/**
 * Notification types for all triggerable events
 */
export type NotificationType =
  | 'epic_completed'
  | 'story_completed'
  | 'deployment_success'
  | 'deployment_failed'
  | 'agent_error'
  | 'agent_message';

/**
 * Notification urgency levels
 */
export type NotificationUrgency = 'very-low' | 'low' | 'normal' | 'high';

/**
 * Notification recipient with workspace context
 */
export interface NotificationRecipient {
  userId: string;
  workspaceId: string;
}

/**
 * Base notification event structure
 */
export interface NotificationEvent {
  type: NotificationType;
  payload: Record<string, any>;
  recipients: NotificationRecipient[];
  urgency: NotificationUrgency;
  batchable: boolean;
}

/**
 * Epic completed event payload
 */
export interface EpicCompletedEvent {
  epicId: string;
  epicNumber: number;
  epicTitle: string;
  storyCount: number;
  projectId: string;
  workspaceId: string;
}

/**
 * Story completed event payload
 */
export interface StoryCompletedEvent {
  storyId: string;
  storyKey: string;
  storyTitle: string;
  epicId: string;
  projectId: string;
  workspaceId: string;
  agentName?: string;
}

/**
 * Deployment succeeded event payload
 */
export interface DeploymentSucceededEvent {
  deploymentId: string;
  projectId: string;
  projectName: string;
  environment: string;
  workspaceId: string;
  url?: string;
}

/**
 * Deployment failed event payload
 */
export interface DeploymentFailedEvent {
  deploymentId: string;
  projectId: string;
  projectName: string;
  environment: string;
  workspaceId: string;
  errorSummary: string;
}

/**
 * Agent error event payload
 */
export interface AgentErrorEvent {
  agentId: string;
  agentName: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  errorMessage: string;
}

/**
 * Agent message event payload
 */
export interface AgentMessageEvent {
  agentId: string;
  agentName: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  userId: string; // Target user for the message
  messagePreview: string;
}

/**
 * Event names used with NestJS EventEmitter
 */
export const NotificationEventNames = {
  EPIC_COMPLETED: 'epic.completed',
  STORY_COMPLETED: 'story.completed',
  DEPLOYMENT_SUCCEEDED: 'deployment.succeeded',
  DEPLOYMENT_FAILED: 'deployment.failed',
  AGENT_ERROR: 'agent.error',
  AGENT_MESSAGE: 'agent.message',
} as const;
