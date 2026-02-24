/**
 * Notification Event Definitions
 * Story 10.5: Notification Triggers
 * Story 21.2: Slack Interactive Components (AC2) - Added interactive event types
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
  | 'deployment_pending_approval'   // Story 21.2
  | 'agent_error'
  | 'agent_message'
  | 'agent_needs_input'             // Story 21.2
  | 'agent_task_started'            // Story 21.2
  | 'agent_task_completed'          // Story 21.2
  | 'cost_alert_warning'            // Story 21.2
  | 'cost_alert_exceeded'           // Story 21.2
  | 'sprint_review_ready'           // Story 21.2
  | 'context_degraded'
  | 'context_critical';

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
 * Context degraded event payload (Story 12.5)
 */
export interface ContextDegradedEvent {
  projectId: string;
  workspaceId: string;
  previousHealth: string;
  currentHealth: string;
  issues: string[];
}

/**
 * Context critical event payload (Story 12.5)
 */
export interface ContextCriticalEvent {
  projectId: string;
  workspaceId: string;
  issues: string[];
  criticalSince: string; // ISO 8601
}

/**
 * Deployment pending approval event payload (Story 21.2)
 */
export interface DeploymentPendingApprovalEvent {
  deploymentId: string;
  projectId: string;
  projectName: string;
  environment: string;
  workspaceId: string;
  requestedBy: string;
  storyTitle?: string;
}

/**
 * Agent needs input event payload (Story 21.2)
 */
export interface AgentNeedsInputEvent {
  agentId: string;
  agentName: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  question: string;
  conversationId?: string;
}

/**
 * Agent task started event payload (Story 21.2)
 */
export interface AgentTaskStartedEvent {
  agentId: string;
  agentName: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  storyTitle: string;
  storyId: string;
}

/**
 * Agent task completed event payload (Story 21.2)
 */
export interface AgentTaskCompletedEvent {
  agentId: string;
  agentName: string;
  agentType: string;
  projectId: string;
  workspaceId: string;
  storyTitle: string;
  storyId: string;
  filesChanged?: number;
}

/**
 * Cost alert warning event payload (Story 21.2)
 */
export interface CostAlertWarningEvent {
  workspaceId: string;
  projectId?: string;
  currentCost: number;
  limit: number;
  percentage: number;
  currency: string;
}

/**
 * Cost alert exceeded event payload (Story 21.2)
 */
export interface CostAlertExceededEvent {
  workspaceId: string;
  projectId?: string;
  currentCost: number;
  limit: number;
  currency: string;
}

/**
 * Sprint review ready event payload (Story 21.2)
 */
export interface SprintReviewReadyEvent {
  workspaceId: string;
  projectId: string;
  sprintName: string;
  completedStories: number;
  totalStories: number;
}

/**
 * Event names used with NestJS EventEmitter
 */
export const NotificationEventNames = {
  EPIC_COMPLETED: 'epic.completed',
  STORY_COMPLETED: 'story.completed',
  DEPLOYMENT_SUCCEEDED: 'deployment.succeeded',
  DEPLOYMENT_FAILED: 'deployment.failed',
  DEPLOYMENT_PENDING_APPROVAL: 'deployment.pending_approval',
  AGENT_ERROR: 'agent.error',
  AGENT_MESSAGE: 'agent.message',
  AGENT_NEEDS_INPUT: 'agent.needs_input',
  AGENT_TASK_STARTED: 'agent.task.started',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  COST_ALERT_WARNING: 'cost.alert.warning',
  COST_ALERT_EXCEEDED: 'cost.alert.exceeded',
  SPRINT_REVIEW_READY: 'sprint.review.ready',
  CONTEXT_HEALTH_CHANGED: 'context:health_changed',
} as const;
