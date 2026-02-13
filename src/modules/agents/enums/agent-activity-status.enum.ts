/**
 * Agent Activity Status Enum
 * Story 9.3: Agent Status Updates
 *
 * Fine-grained activity statuses for tracking what agents are doing.
 * This extends the existing AgentStatus lifecycle enum with activity-level detail.
 */

/**
 * AgentActivityStatus represents what an agent is actively doing.
 * Stored in Agent.activityStatus column and tracked in AgentStatusUpdate history.
 */
export enum AgentActivityStatus {
  // Lifecycle statuses (mirror existing AgentStatus for compatibility)
  CREATED = 'created',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',

  // Fine-grained activity statuses (NEW)
  IDLE = 'idle', // Agent running but no active task
  THINKING = 'thinking', // Agent processing/planning
  CODING = 'coding', // Agent writing code
  TESTING = 'testing', // Agent running tests
  REVIEWING = 'reviewing', // Agent reviewing code/PR
  DEBUGGING = 'debugging', // Agent debugging issues
  COMMITTING = 'committing', // Agent making git commits
  DEPLOYING = 'deploying', // Agent performing deployments
  WAITING_INPUT = 'waiting_input', // Agent waiting for user input
  RECOVERING = 'recovering', // Agent recovering context
  ERROR = 'error', // Agent encountered non-fatal error
}

/**
 * StatusUpdateCategory for filtering and display
 */
export enum StatusUpdateCategory {
  TASK_LIFECYCLE = 'task_lifecycle', // Started/completed task
  PROGRESS = 'progress', // Progress milestones
  ERROR = 'error', // Errors and warnings
  WAITING = 'waiting', // Waiting states
}

/**
 * Map activity statuses to their default category
 */
export const ACTIVITY_STATUS_CATEGORY_MAP: Record<
  AgentActivityStatus,
  StatusUpdateCategory
> = {
  // Lifecycle statuses -> task_lifecycle
  [AgentActivityStatus.CREATED]: StatusUpdateCategory.TASK_LIFECYCLE,
  [AgentActivityStatus.INITIALIZING]: StatusUpdateCategory.TASK_LIFECYCLE,
  [AgentActivityStatus.RUNNING]: StatusUpdateCategory.TASK_LIFECYCLE,
  [AgentActivityStatus.PAUSED]: StatusUpdateCategory.WAITING,
  [AgentActivityStatus.COMPLETED]: StatusUpdateCategory.TASK_LIFECYCLE,
  [AgentActivityStatus.FAILED]: StatusUpdateCategory.ERROR,
  [AgentActivityStatus.TERMINATED]: StatusUpdateCategory.TASK_LIFECYCLE,

  // Activity statuses
  [AgentActivityStatus.IDLE]: StatusUpdateCategory.TASK_LIFECYCLE,
  [AgentActivityStatus.THINKING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.CODING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.TESTING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.REVIEWING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.DEBUGGING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.COMMITTING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.DEPLOYING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.WAITING_INPUT]: StatusUpdateCategory.WAITING,
  [AgentActivityStatus.RECOVERING]: StatusUpdateCategory.PROGRESS,
  [AgentActivityStatus.ERROR]: StatusUpdateCategory.ERROR,
};

/**
 * Statuses that should post to chat as milestones
 */
export const MILESTONE_STATUSES: AgentActivityStatus[] = [
  AgentActivityStatus.CREATED,
  AgentActivityStatus.INITIALIZING,
  AgentActivityStatus.COMPLETED,
  AgentActivityStatus.FAILED,
  AgentActivityStatus.TERMINATED,
  AgentActivityStatus.WAITING_INPUT,
  AgentActivityStatus.ERROR,
];

/**
 * Type guard to check if a string is a valid AgentActivityStatus
 */
export function isAgentActivityStatus(
  value: string,
): value is AgentActivityStatus {
  return Object.values(AgentActivityStatus).includes(
    value as AgentActivityStatus,
  );
}

/**
 * Type guard to check if a string is a valid StatusUpdateCategory
 */
export function isStatusUpdateCategory(
  value: string,
): value is StatusUpdateCategory {
  return Object.values(StatusUpdateCategory).includes(
    value as StatusUpdateCategory,
  );
}
