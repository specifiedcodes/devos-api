/**
 * Notification Category Constants
 * Story 22.7: Mobile Push Notifications
 *
 * Defines notification categories for mobile push notifications.
 * Maps to iOS/Android notification channels.
 */

export enum MobileNotificationCategory {
  AGENT = 'agent',
  DEPLOYMENT = 'deployment',
  COST = 'cost',
  SPRINT = 'sprint',
}

export const NOTIFICATION_CHANNEL_NAMES: Record<MobileNotificationCategory, string> = {
  [MobileNotificationCategory.AGENT]: 'Agents',
  [MobileNotificationCategory.DEPLOYMENT]: 'Deployments',
  [MobileNotificationCategory.COST]: 'Costs',
  [MobileNotificationCategory.SPRINT]: 'Sprint',
};

export interface NotificationEvent {
  type: string;
  title: string;
  body: string;
  data: Record<string, string | undefined>;
  category: MobileNotificationCategory;
  priority: 'high' | 'normal';
  actions?: NotificationAction[];
}

export interface NotificationAction {
  actionId: string;
  title: string;
}

export const AGENT_NOTIFICATION_ACTIONS: NotificationAction[] = [
  { actionId: 'view', title: 'View' },
  { actionId: 'dismiss', title: 'Dismiss' },
];

export const DEPLOYMENT_NOTIFICATION_ACTIONS: NotificationAction[] = [
  { actionId: 'view', title: 'View' },
  { actionId: 'approve', title: 'Approve' },
  { actionId: 'dismiss', title: 'Dismiss' },
];

export const COST_NOTIFICATION_ACTIONS: NotificationAction[] = [
  { actionId: 'view', title: 'View Details' },
  { actionId: 'dismiss', title: 'Dismiss' },
];

export const NOTIFICATION_EVENT_TYPES = {
  AGENT_TASK_COMPLETE: 'agent_task_complete',
  AGENT_ERROR: 'agent_error',
  DEPLOYMENT_SUCCEEDED: 'deployment_succeeded',
  DEPLOYMENT_FAILED: 'deployment_failed',
  APPROVAL_NEEDED: 'approval_needed',
  COST_ALERT: 'cost_alert',
  SPRINT_COMPLETE: 'sprint_complete',
} as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[keyof typeof NOTIFICATION_EVENT_TYPES];
