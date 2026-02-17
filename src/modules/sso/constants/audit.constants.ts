export const SSO_AUDIT_CONSTANTS = {
  // Redis key prefixes
  REDIS_ALERT_COUNTER_PREFIX: 'sso:audit:alert:counter:',
  REDIS_ALERT_COOLDOWN_PREFIX: 'sso:audit:alert:cooldown:',

  // Retention
  DEFAULT_RETENTION_DAYS: 730,
  MIN_RETENTION_DAYS: 90,
  MAX_RETENTION_DAYS: 2555,
  RETENTION_CLEANUP_CRON: '0 3 * * *',
  RETENTION_BATCH_SIZE: 1000,

  // Export
  MAX_EXPORT_ROWS: 50000,
  EXPORT_BATCH_SIZE: 5000,
  CSV_DELIMITER: ',',

  // Webhooks
  WEBHOOK_DELIVERY_CRON: '*/30 * * * * *',
  WEBHOOK_MAX_PAYLOAD_SIZE: 65536,
  WEBHOOK_RESPONSE_BODY_MAX_LENGTH: 1000,
  WEBHOOK_HMAC_ALGORITHM: 'sha256',
  WEBHOOK_SIGNATURE_HEADER: 'X-DevOS-Signature-256',
  WEBHOOK_EVENT_HEADER: 'X-DevOS-Event',
  WEBHOOK_DELIVERY_ID_HEADER: 'X-DevOS-Delivery',
  WEBHOOK_TIMESTAMP_HEADER: 'X-DevOS-Timestamp',
  WEBHOOK_DELIVERY_LOG_RETENTION_DAYS: 30,

  // Alert rules
  MAX_ALERT_RULES_PER_WORKSPACE: 20,
  ALERT_EVALUATION_CRON: '0 * * * * *',

  // Compliance reports
  COMPLIANCE_REPORT_CACHE_TTL_SECONDS: 3600,

  // Default alert rules (created automatically when SSO is first configured)
  DEFAULT_ALERT_RULES: [
    {
      name: 'Failed SSO Logins',
      description: 'Alert when 5+ failed SSO logins occur within 5 minutes',
      eventTypes: ['sso_login_failure', 'saml_login_failure', 'oidc_login_failure'],
      threshold: 5,
      windowMinutes: 5,
      cooldownMinutes: 30,
    },
    {
      name: 'IdP Configuration Changes',
      description: 'Alert on any SSO provider configuration changes',
      eventTypes: [
        'saml_config_created', 'saml_config_updated', 'saml_config_deleted',
        'oidc_config_created', 'oidc_config_updated', 'oidc_config_deleted',
      ],
      threshold: 1,
      windowMinutes: 1,
      cooldownMinutes: 5,
    },
    {
      name: 'SSO Enforcement Changes',
      description: 'Alert when SSO enforcement settings are modified',
      eventTypes: ['enforcement_enabled', 'enforcement_disabled', 'enforcement_updated'],
      threshold: 1,
      windowMinutes: 1,
      cooldownMinutes: 5,
    },
  ],
} as const;
