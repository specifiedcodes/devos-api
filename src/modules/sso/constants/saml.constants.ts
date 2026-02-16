export const SAML_CONSTANTS = {
  // SP Entity ID template (workspace-specific)
  SP_ENTITY_ID_TEMPLATE: 'https://devos.com/saml/{workspaceId}',

  // ACS URL template (receives SAML Response from IdP)
  ACS_URL_TEMPLATE: 'https://devos.com/api/auth/saml/{workspaceId}/callback',

  // SLO URL template (receives LogoutRequest from IdP)
  SLO_URL_TEMPLATE: 'https://devos.com/api/auth/saml/{workspaceId}/logout',

  // Default NameID format
  DEFAULT_NAME_ID_FORMAT: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

  // Supported NameID formats
  SUPPORTED_NAME_ID_FORMATS: [
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
  ],

  // Default authentication context
  DEFAULT_AUTHN_CONTEXT: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',

  // SAML bindings
  BINDINGS: {
    HTTP_REDIRECT: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
    HTTP_POST: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  },

  // Known provider presets
  PROVIDER_PRESETS: {
    OKTA: 'Okta',
    AZURE_AD: 'Azure AD',
    ONELOGIN: 'OneLogin',
    GOOGLE_WORKSPACE: 'Google Workspace',
    CUSTOM: 'Custom',
  },

  // Default attribute mapping
  DEFAULT_ATTRIBUTE_MAPPING: {
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    groups: 'groups',
  } as Record<string, string>,

  // Relay state key prefix in Redis (stores AuthnRequest ID for InResponseTo validation)
  RELAY_STATE_PREFIX: 'saml:relay:',
  RELAY_STATE_TTL_SECONDS: 300, // 5 minutes

  // Certificate expiration warning thresholds (days)
  CERT_WARN_30_DAYS: 30,
  CERT_WARN_7_DAYS: 7,

  // Maximum configs per workspace (for multi-IdP in Story 17.7)
  MAX_CONFIGS_PER_WORKSPACE: 10,
} as const;
