export const SSO_ENFORCEMENT_CONSTANTS = {
  // Redis key prefixes
  REDIS_ENFORCEMENT_PREFIX: 'sso:enforcement:',     // sso:enforcement:{workspaceId} -> cached enforcement policy
  REDIS_BYPASS_CHECK_PREFIX: 'sso:bypass:',          // sso:bypass:{workspaceId}:{email} -> boolean bypass result

  // Grace period
  DEFAULT_GRACE_PERIOD_HOURS: 72,                    // 3 days default grace period
  MIN_GRACE_PERIOD_HOURS: 0,                         // Immediate enforcement allowed
  MAX_GRACE_PERIOD_HOURS: 720,                       // Maximum: 30 days

  // Bypass limits
  MAX_BYPASS_EMAILS: 50,                             // Maximum number of bypass email addresses per workspace

  // Cache TTL
  ENFORCEMENT_CACHE_TTL_SECONDS: 300,                // 5 minutes cache for enforcement policy
  BYPASS_CACHE_TTL_SECONDS: 300,                     // 5 minutes cache for bypass check results

  // Grace period scheduler
  GRACE_PERIOD_CHECK_CRON: '0 */5 * * * *',         // Check grace periods every 5 minutes
  GRACE_PERIOD_NOTIFICATION_HOURS: [72, 48, 24, 1],  // Send reminder notifications at these hours before enforcement

  // Login enforcement messages
  DEFAULT_ENFORCEMENT_MESSAGE: 'Your organization requires SSO login. Please use your corporate identity provider.',
  GRACE_PERIOD_MESSAGE: 'Your organization is transitioning to SSO. Password login will be disabled in {hours} hours.',

  // Validation
  MIN_ACTIVE_PROVIDERS_FOR_ENFORCEMENT: 1,           // At least 1 active SSO provider required to enable enforcement
} as const;
