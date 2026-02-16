import { AsyncLocalStorage } from 'async_hooks';

/**
 * LoggingContext
 * Story 14.3: Loki Log Aggregation (AC5)
 *
 * AsyncLocalStorage-based request context for correlation IDs and
 * request-scoped metadata. Provides helpers to retrieve trace ID,
 * user ID, and workspace ID from the current async context.
 */

export interface RequestContext {
  traceId: string;
  userId?: string;
  workspaceId?: string;
}

export const loggingContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current trace/correlation ID from async context.
 * Returns undefined if called outside of a request scope.
 */
export function getTraceId(): string | undefined {
  return loggingContext.getStore()?.traceId;
}

/**
 * Get the current user ID from async context.
 * Returns undefined if no user is authenticated or outside request scope.
 */
export function getUserId(): string | undefined {
  return loggingContext.getStore()?.userId;
}

/**
 * Get the current workspace ID from async context.
 * Returns undefined if no workspace context or outside request scope.
 */
export function getWorkspaceId(): string | undefined {
  return loggingContext.getStore()?.workspaceId;
}
