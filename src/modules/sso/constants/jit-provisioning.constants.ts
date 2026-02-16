export const JIT_PROVISIONING_CONSTANTS = {
  // Default attribute mapping for SAML assertions
  DEFAULT_SAML_ATTRIBUTE_MAPPING: {
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    displayName: 'displayName',
    groups: 'groups',
    department: 'department',
    jobTitle: 'jobTitle',
  },

  // Default attribute mapping for OIDC claims
  DEFAULT_OIDC_ATTRIBUTE_MAPPING: {
    email: 'email',
    firstName: 'given_name',
    lastName: 'family_name',
    displayName: 'name',
    groups: 'groups',
    department: 'department',
    jobTitle: 'jobTitle',
  },

  // Valid DevOS profile fields that can be mapped
  VALID_PROFILE_FIELDS: [
    'email',
    'firstName',
    'lastName',
    'displayName',
    'groups',
    'department',
    'jobTitle',
  ] as const,

  // Valid workspace roles for group mapping
  VALID_ROLES: ['admin', 'developer', 'viewer'] as const,

  // Conflict resolution strategies
  CONFLICT_RESOLUTION: {
    LINK_EXISTING: 'link_existing',
    REJECT: 'reject',
    PROMPT_ADMIN: 'prompt_admin',
  } as const,

  // SSO audit event types for provisioning
  AUDIT_EVENTS: {
    USER_PROVISIONED: 'jit_user_provisioned',
    USER_PROFILE_UPDATED: 'jit_user_profile_updated',
    USER_ROLE_UPDATED: 'jit_user_role_updated',
    USER_LINKED: 'jit_user_linked_existing',
    USER_REJECTED: 'jit_user_rejected',
    PROVISIONING_ERROR: 'jit_provisioning_error',
    CONFIG_CREATED: 'jit_config_created',
    CONFIG_UPDATED: 'jit_config_updated',
  } as const,

  // Random password for SSO-provisioned users (they never use it)
  RANDOM_PASSWORD_BYTES: 32,

  // bcrypt salt rounds for random password
  BCRYPT_SALT_ROUNDS: 12,

  // Maximum group-to-role mapping entries per workspace
  MAX_GROUP_ROLE_MAPPINGS: 50,

  // Redis cache key prefix for JIT config
  CACHE_KEY_PREFIX: 'sso:jit-config:',
  CACHE_TTL_SECONDS: 300, // 5 minutes
} as const;
