export const DOMAIN_CONSTANTS = {
  // DNS TXT record prefix
  VERIFICATION_TXT_PREFIX: 'devos-verification=',

  // Verification token length (hex characters)
  VERIFICATION_TOKEN_LENGTH: 64,

  // Domain status values
  STATUS: {
    PENDING: 'pending',
    VERIFIED: 'verified',
    EXPIRED: 'expired',
    FAILED: 'failed',
  },

  // Expiration settings
  PENDING_EXPIRY_DAYS: 7, // Unverified domains expire after 7 days
  VERIFIED_EXPIRY_MONTHS: 12, // Re-verification required every 12 months

  // Verification check limits
  MAX_CHECK_ATTEMPTS: 100, // Max checks before giving up
  CHECK_INTERVAL_MINUTES: 15, // Background check interval

  // Domain validation
  MAX_DOMAINS_PER_WORKSPACE: 20, // Max domains per workspace
  MIN_DOMAIN_LENGTH: 3, // Minimum domain length (a.co)
  MAX_DOMAIN_LENGTH: 253, // Max DNS domain name length

  // Reserved/blocked domains (cannot be registered)
  BLOCKED_DOMAINS: [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'icloud.com',
    'mail.com',
    'protonmail.com',
    'proton.me',
    'zoho.com',
    'yandex.com',
    'gmx.com',
    'tutanota.com',
    'fastmail.com',
    'hey.com',
    'live.com',
    'msn.com',
    'me.com',
    'mac.com',
  ],

  // Redis cache key prefix for domain lookups
  CACHE_KEY_PREFIX: 'sso:domain:',
  CACHE_TTL_SECONDS: 300, // Cache positive domain lookup for 5 minutes
  CACHE_NEGATIVE_TTL_SECONDS: 60, // Cache negative (not found) domain lookup for 1 minute

  // BullMQ queue name for verification jobs
  QUEUE_NAME: 'domain-verification',

  // SSO audit event types for domain operations
  AUDIT_EVENTS: {
    DOMAIN_REGISTERED: 'domain_registered',
    DOMAIN_VERIFIED: 'domain_verified',
    DOMAIN_VERIFICATION_FAILED: 'domain_verification_failed',
    DOMAIN_EXPIRED: 'domain_expired',
    DOMAIN_REMOVED: 'domain_removed',
    DOMAIN_PROVIDER_LINKED: 'domain_provider_linked',
    DOMAIN_PROVIDER_UNLINKED: 'domain_provider_unlinked',
  },
} as const;
