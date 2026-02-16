export const OIDC_CONSTANTS = {
  // Redirect URI template (workspace-specific)
  REDIRECT_URI_TEMPLATE: '{appUrl}/api/auth/oidc/{workspaceId}/callback',

  // Default scopes
  DEFAULT_SCOPES: ['openid', 'email', 'profile'],

  // State parameter prefix in Redis (CSRF protection)
  STATE_PREFIX: 'oidc:state:',
  STATE_TTL_SECONDS: 600, // 10 minutes

  // Nonce prefix in Redis (replay protection)
  NONCE_PREFIX: 'oidc:nonce:',
  NONCE_TTL_SECONDS: 600, // 10 minutes

  // PKCE code verifier prefix in Redis
  PKCE_PREFIX: 'oidc:pkce:',
  PKCE_TTL_SECONDS: 600, // 10 minutes

  // JWKS cache prefix in Redis
  JWKS_CACHE_PREFIX: 'oidc:jwks:',
  JWKS_CACHE_TTL_SECONDS: 3600, // 1 hour

  // Discovery document cache prefix in Redis
  DISCOVERY_CACHE_PREFIX: 'oidc:discovery:',
  DISCOVERY_CACHE_TTL_SECONDS: 86400, // 24 hours

  // Provider presets with discovery URLs
  PROVIDER_PRESETS: {
    google: {
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      displayName: 'Google Workspace',
      scopes: ['openid', 'email', 'profile'],
    },
    microsoft: {
      discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
      displayName: 'Microsoft Entra ID',
      scopes: ['openid', 'email', 'profile'],
    },
    okta: {
      // Tenant-specific: https://{domain}.okta.com/.well-known/openid-configuration
      discoveryUrl: '',
      displayName: 'Okta',
      scopes: ['openid', 'email', 'profile', 'groups'],
    },
    auth0: {
      // Tenant-specific: https://{domain}.auth0.com/.well-known/openid-configuration
      discoveryUrl: '',
      displayName: 'Auth0',
      scopes: ['openid', 'email', 'profile'],
    },
    custom: {
      discoveryUrl: '',
      displayName: 'Custom OIDC',
      scopes: ['openid', 'email', 'profile'],
    },
  },

  // PKCE code verifier length (43-128 characters per RFC 7636)
  PKCE_VERIFIER_LENGTH: 64,

  // PKCE code challenge method
  PKCE_CHALLENGE_METHOD: 'S256',

  // Supported token endpoint auth methods
  TOKEN_AUTH_METHODS: ['client_secret_post', 'client_secret_basic'] as const,

  // Maximum configs per workspace
  MAX_CONFIGS_PER_WORKSPACE: 10,

  // ID Token clock skew tolerance (seconds)
  ID_TOKEN_CLOCK_SKEW_SECONDS: 300, // 5 minutes

  // HTTP timeout for external requests (discovery, token exchange, userinfo)
  HTTP_TIMEOUT_MS: 10000, // 10 seconds
} as const;
