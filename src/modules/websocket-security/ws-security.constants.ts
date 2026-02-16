/**
 * WebSocket Security Constants
 * Story 15.7: WebSocket Security Hardening (AC10)
 *
 * All configuration constants for WebSocket security: rate limits,
 * timeouts, Redis key patterns, TTLs, buffer limits, alert thresholds,
 * and event names.
 */

/** Rate limit thresholds for WebSocket connections. */
export const WS_RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 100,
  ROOM_JOINS_PER_MINUTE: 50,
  BROADCASTS_PER_SECOND: 20,
} as const;

/** Timeout configuration in milliseconds. */
export const WS_TIMEOUTS = {
  PING_TIMEOUT: 20000,
  PING_INTERVAL: 25000,
  TOKEN_EXPIRY_GRACE: 60000,
  TOKEN_EXPIRY_WARNING: 300000,
} as const;

/** Redis key prefix patterns for WebSocket state. */
export const WS_REDIS_KEYS = {
  MEMBERSHIP_CACHE: 'ws:membership',
  EVENT_BUFFER: 'ws:events',
  RATE_MSG: 'ws:rate:msg',
  RATE_JOIN: 'ws:rate:join',
  RATE_BROADCAST: 'ws:rate:broadcast',
  BANNED: 'ws:banned',
  CONNECTIONS: 'ws:connections',
  ROOMS: 'ws:rooms',
  AUDIT: 'ws:audit',
  AUTH_FAILURES: 'ws:auth_failures',
  CONN_TRACKING: 'ws:conn_tracking',
  VIOLATIONS: 'ws:violations',
} as const;

/** Redis key TTLs in seconds. */
export const WS_REDIS_TTLS = {
  MEMBERSHIP_CACHE: 300,
  EVENT_BUFFER: 300,
  RATE_WINDOW: 120,
  BAN_DURATION: 900,
  ROOM_TRACKING: 600,
  AUDIT: 86400,
} as const;

/** Buffer size limits. */
export const WS_BUFFER_LIMITS = {
  MAX_EVENTS_PER_ROOM: 500,
  MAX_RECONNECT_ATTEMPTS: 10,
} as const;

/** Alert detection thresholds. */
export const WS_ALERT_THRESHOLDS = {
  AUTH_FAILURES_PER_IP: 10,
  AUTH_FAILURE_WINDOW: 300,
  CONNECTION_FLOOD: 50,
  CONNECTION_FLOOD_WINDOW: 60,
  HIGH_RATE_PERCENT: 80,
} as const;

/** WebSocket event names used across the security module. */
export const WS_EVENTS = {
  JOIN: 'join',
  LEAVE: 'leave',
  ROOM_JOINED: 'room:joined',
  AUTH_REFRESH: 'auth:refresh',
  AUTH_REFRESHED: 'auth:refreshed',
  AUTH_REFRESH_FAILED: 'auth:refresh_failed',
  AUTH_EXPIRING: 'auth:expiring',
  RATE_LIMIT_WARNING: 'rate_limit:warning',
  RATE_LIMIT_EXCEEDED: 'rate_limit:exceeded',
  RATE_LIMIT_BANNED: 'rate_limit:banned',
  RECONNECTION_REPLAY_START: 'reconnection:replay_start',
  RECONNECTION_REPLAY_END: 'reconnection:replay_end',
  ERROR: 'error',
} as const;
