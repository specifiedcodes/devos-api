/**
 * Webhook Event Types
 * Story 21-8: Webhook Management (AC4)
 *
 * All available outgoing webhook event types.
 * Organized by category for UI display.
 */

export enum WebhookEventType {
  // Agent events
  AGENT_TASK_STARTED = 'agent.task.started',
  AGENT_TASK_COMPLETED = 'agent.task.completed',
  AGENT_TASK_FAILED = 'agent.task.failed',

  // Deployment events
  DEPLOYMENT_STARTED = 'deployment.started',
  DEPLOYMENT_SUCCEEDED = 'deployment.succeeded',
  DEPLOYMENT_FAILED = 'deployment.failed',
  DEPLOYMENT_ROLLBACK = 'deployment.rollback',

  // Story events
  STORY_CREATED = 'story.created',
  STORY_STATUS_CHANGED = 'story.status_changed',
  STORY_COMPLETED = 'story.completed',

  // Sprint events
  SPRINT_STARTED = 'sprint.started',
  SPRINT_COMPLETED = 'sprint.completed',

  // Cost events
  COST_ALERT_WARNING = 'cost.alert.warning',
  COST_ALERT_EXCEEDED = 'cost.alert.exceeded',
}

export interface WebhookEventCategory {
  name: string;
  events: { type: WebhookEventType; label: string; description: string }[];
}

export const WEBHOOK_EVENT_CATEGORIES: WebhookEventCategory[] = [
  {
    name: 'Agent Events',
    events: [
      { type: WebhookEventType.AGENT_TASK_STARTED, label: 'Task Started', description: 'Fired when an agent begins working on a task' },
      { type: WebhookEventType.AGENT_TASK_COMPLETED, label: 'Task Completed', description: 'Fired when an agent completes a task' },
      { type: WebhookEventType.AGENT_TASK_FAILED, label: 'Task Failed', description: 'Fired when an agent encounters an error on a task' },
    ],
  },
  {
    name: 'Deployment Events',
    events: [
      { type: WebhookEventType.DEPLOYMENT_STARTED, label: 'Deployment Started', description: 'Fired when a deployment begins' },
      { type: WebhookEventType.DEPLOYMENT_SUCCEEDED, label: 'Deployment Succeeded', description: 'Fired when a deployment completes successfully' },
      { type: WebhookEventType.DEPLOYMENT_FAILED, label: 'Deployment Failed', description: 'Fired when a deployment fails' },
      { type: WebhookEventType.DEPLOYMENT_ROLLBACK, label: 'Deployment Rollback', description: 'Fired when a deployment is rolled back' },
    ],
  },
  {
    name: 'Story Events',
    events: [
      { type: WebhookEventType.STORY_CREATED, label: 'Story Created', description: 'Fired when a new story is created' },
      { type: WebhookEventType.STORY_STATUS_CHANGED, label: 'Story Status Changed', description: 'Fired when a story status changes' },
      { type: WebhookEventType.STORY_COMPLETED, label: 'Story Completed', description: 'Fired when a story is marked done' },
    ],
  },
  {
    name: 'Sprint Events',
    events: [
      { type: WebhookEventType.SPRINT_STARTED, label: 'Sprint Started', description: 'Fired when a sprint begins' },
      { type: WebhookEventType.SPRINT_COMPLETED, label: 'Sprint Completed', description: 'Fired when a sprint finishes' },
    ],
  },
  {
    name: 'Cost Events',
    events: [
      { type: WebhookEventType.COST_ALERT_WARNING, label: 'Cost Warning', description: 'Fired when spend reaches warning threshold' },
      { type: WebhookEventType.COST_ALERT_EXCEEDED, label: 'Cost Exceeded', description: 'Fired when spend exceeds the limit' },
    ],
  },
];

/**
 * All valid event type strings for validation.
 */
export const ALL_WEBHOOK_EVENT_TYPES: string[] = Object.values(WebhookEventType);

/**
 * Validate that an event type string is valid.
 */
export function isValidWebhookEventType(eventType: string): boolean {
  return ALL_WEBHOOK_EVENT_TYPES.includes(eventType);
}
