/**
 * Context Health Interfaces
 * Story 12.5: Context Health Indicators UI
 *
 * Defines types for the context health assessment system:
 * - TierHealth: Health status for each context tier
 * - ContextHealth: Aggregated health across all tiers + Graphiti
 * - ContextRefreshWithHealth: Enhanced refresh response with health
 * - ContextHealthChangedEvent: Event payload for health transitions
 */

import { ContextRefreshResult } from './context-generation.interfaces';

// -- Tier Health ---------------------------------------------------------------

/**
 * Health status for a single context tier.
 * Each tier (.devoscontext, DEVOS.md, project-state.yaml) has its own health.
 */
export interface TierHealth {
  /** Whether the tier content is valid (parseable, well-formed) */
  valid: boolean;
  /** Whether the file exists on disk */
  exists: boolean;
  /** ISO 8601 timestamp of last modification, null if file not found */
  lastModified: string | null;
  /** True if the file is older than the staleness threshold */
  stale: boolean;
  /** File size in bytes, 0 if not found */
  sizeBytes: number;
  /** Error message if validation failed, null otherwise */
  error: string | null;
}

// -- Overall Context Health ---------------------------------------------------

/**
 * Overall health status values.
 * - healthy: All tiers valid, Graphiti connected, fresh refresh
 * - degraded: One tier stale or Graphiti disconnected, agents can still operate
 * - critical: Multiple tiers invalid/missing, agents may produce incorrect results
 */
export type OverallHealthStatus = 'healthy' | 'degraded' | 'critical';

/**
 * Aggregated health across all context sources for a project.
 * Returned by ContextHealthService.assessHealth().
 */
export interface ContextHealth {
  projectId: string;
  workspaceId: string;
  /** Tier 1: .devoscontext status */
  tier1: TierHealth;
  /** Tier 2: DEVOS.md status */
  tier2: TierHealth;
  /** Tier 3: project-state.yaml status */
  tier3: TierHealth;
  /** Whether Graphiti/Neo4j is connected */
  graphitiConnected: boolean;
  /** Number of episodes in Graphiti */
  graphitiEpisodeCount: number;
  /** Time of last context recovery in ms, 0 if never recovered */
  lastRecoveryTime: number;
  /** Total number of context recoveries */
  recoveryCount: number;
  /** ISO 8601 timestamp of last context refresh, null if never refreshed */
  lastRefreshAt: string | null;
  /** Computed overall health status */
  overallHealth: OverallHealthStatus;
  /** Human-readable issue descriptions */
  issues: string[];
}

// -- Enhanced Refresh Response ------------------------------------------------

/**
 * Enhanced refresh response that includes health alongside refresh result.
 * Returned by POST /api/v1/context/refresh/:projectId.
 */
export interface ContextRefreshWithHealth {
  refresh: ContextRefreshResult;
  health: ContextHealth;
}

// -- Health Change Event ------------------------------------------------------

/**
 * Event payload emitted via EventEmitter2 on `context:health_changed`.
 * Consumers include ContextHealthNotificationHandler and future WebSocket gateways.
 */
export interface ContextHealthChangedEvent {
  projectId: string;
  workspaceId: string;
  previousHealth: OverallHealthStatus;
  currentHealth: OverallHealthStatus;
  issues: string[];
  timestamp: string;
}
