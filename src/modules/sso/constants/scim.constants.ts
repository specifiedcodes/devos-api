export const SCIM_CONSTANTS = {
  // SCIM 2.0 Schema URIs (RFC 7643)
  SCHEMAS: {
    USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
    GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
    LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
    PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
    ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
    SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    RESOURCE_TYPE: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
    SCHEMA: 'urn:ietf:params:scim:schemas:core:2.0:Schema',
  },

  // SCIM content type
  CONTENT_TYPE: 'application/scim+json',

  // Token configuration
  TOKEN_PREFIX: 'devos_sc',
  TOKEN_BYTES: 32,
  TOKEN_HASH_ALGORITHM: 'sha256',

  // Rate limiting
  RATE_LIMIT_WINDOW_SECONDS: 60,
  RATE_LIMIT_MAX_REQUESTS: 100,
  RATE_LIMIT_KEY_PREFIX: 'scim:ratelimit:',

  // Pagination defaults
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 500,
  DEFAULT_START_INDEX: 1,

  // Supported SCIM filter attributes for /Users
  USER_FILTER_ATTRIBUTES: [
    'userName',
    'email',
    'externalId',
    'displayName',
    'active',
  ] as const,

  // Supported SCIM filter attributes for /Groups
  GROUP_FILTER_ATTRIBUTES: [
    'displayName',
    'externalId',
  ] as const,

  // Supported SCIM filter operators
  FILTER_OPERATORS: ['eq', 'ne', 'co', 'sw', 'ew', 'gt', 'ge', 'lt', 'le'] as const,

  // Valid workspace roles for SCIM group mapping
  VALID_ROLES: ['admin', 'developer', 'viewer'] as const,

  // SCIM PATCH operations
  PATCH_OPERATIONS: ['add', 'remove', 'replace'] as const,

  // Redis cache key prefixes
  CACHE_KEY_PREFIX: 'scim:config:',
  CACHE_TTL_SECONDS: 300, // 5 minutes

  // SSO Audit event types for SCIM
  AUDIT_EVENTS: {
    SCIM_USER_CREATED: 'scim_user_created',
    SCIM_USER_UPDATED: 'scim_user_updated',
    SCIM_USER_DEACTIVATED: 'scim_user_deactivated',
    SCIM_USER_REACTIVATED: 'scim_user_reactivated',
    SCIM_USER_DELETED: 'scim_user_deleted',
    SCIM_GROUP_CREATED: 'scim_group_created',
    SCIM_GROUP_UPDATED: 'scim_group_updated',
    SCIM_GROUP_DELETED: 'scim_group_deleted',
    SCIM_TOKEN_CREATED: 'scim_token_created',
    SCIM_TOKEN_REVOKED: 'scim_token_revoked',
    SCIM_TOKEN_ROTATED: 'scim_token_rotated',
    SCIM_CONFIG_UPDATED: 'scim_config_updated',
    SCIM_AUTH_FAILURE: 'scim_auth_failure',
    SCIM_RATE_LIMITED: 'scim_rate_limited',
  } as const,

  // Error detail types (SCIM error response scimType field)
  ERROR_TYPES: {
    INVALID_FILTER: 'invalidFilter',
    TOO_MANY: 'tooMany',
    UNIQUENESS: 'uniqueness',
    MUTABILITY: 'mutability',
    INVALID_VALUE: 'invalidValue',
    INVALID_PATH: 'invalidPath',
    NO_TARGET: 'noTarget',
    INVALID_SYNTAX: 'invalidSyntax',
  } as const,
} as const;
