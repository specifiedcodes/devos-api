export const SESSION_FEDERATION_CONSTANTS = {
  // Redis key prefixes for session metadata
  REDIS_SESSION_PREFIX: 'sso:session:',         // sso:session:{sessionId} -> full session metadata
  REDIS_USER_SESSIONS_PREFIX: 'sso:user:',      // sso:user:{userId}:sessions -> Set of active session IDs
  REDIS_WORKSPACE_SESSIONS_PREFIX: 'sso:ws:',   // sso:ws:{workspaceId}:sessions -> Set of active session IDs
  REDIS_IDP_SESSION_PREFIX: 'sso:idp:',         // sso:idp:{idpSessionId} -> DevOS session ID (for logout correlation)

  // Default timeouts
  DEFAULT_SESSION_TIMEOUT_MINUTES: 480,         // 8 hours absolute timeout
  DEFAULT_IDLE_TIMEOUT_MINUTES: 30,             // 30 minutes idle timeout
  MIN_SESSION_TIMEOUT_MINUTES: 5,               // Minimum configurable timeout
  MAX_SESSION_TIMEOUT_MINUTES: 43200,           // Maximum: 30 days
  MIN_IDLE_TIMEOUT_MINUTES: 5,                  // Minimum idle timeout
  MAX_IDLE_TIMEOUT_MINUTES: 1440,               // Maximum idle: 24 hours

  // Session expiry warning
  SESSION_EXPIRY_WARNING_MINUTES: 10,           // Warn 10 minutes before expiry

  // Cleanup
  CLEANUP_BATCH_SIZE: 100,                      // Number of expired sessions to clean up per batch
  CLEANUP_CRON_EXPRESSION: '0 */15 * * * *',   // Every 15 minutes
  TERMINATED_SESSION_RETENTION_DAYS: 90,        // Keep terminated sessions for 90 days for audit

  // Redis TTL alignment
  REDIS_SESSION_TTL_BUFFER_SECONDS: 300,        // 5 minutes buffer over absolute timeout for Redis TTL

  // Activity update throttle
  ACTIVITY_UPDATE_THROTTLE_SECONDS: 60,         // Only update last_activity_at once per minute per session

  // Maximum concurrent sessions per user per workspace
  MAX_SESSIONS_PER_USER_WORKSPACE: 5,

  // Force re-authentication cooldown
  FORCE_REAUTH_COOLDOWN_MINUTES: 5,             // Minimum time between force-reauth requests
} as const;
