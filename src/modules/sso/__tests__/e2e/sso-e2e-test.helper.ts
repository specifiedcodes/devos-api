/**
 * SSO E2E Test Helper
 * Provides shared fixtures, mock factories, and utilities for all SSO E2E tests.
 */

// ==================== Mock IdP Fixtures ====================

export const MOCK_SAML_IDP = {
  entityId: 'https://idp.test-corp.com/saml/metadata',
  ssoUrl: 'https://idp.test-corp.com/saml/sso',
  sloUrl: 'https://idp.test-corp.com/saml/slo',
  certificate: '-----BEGIN CERTIFICATE-----\nMIIC...test...cert\n-----END CERTIFICATE-----',
  providerName: 'TestCorp Okta',
  displayName: 'TestCorp SSO',
  attributeMapping: {
    email: 'urn:oid:0.9.2342.19200300.100.1.3',
    firstName: 'urn:oid:2.5.4.42',
    lastName: 'urn:oid:2.5.4.4',
    groups: 'memberOf',
  },
};

export const MOCK_OIDC_PROVIDER = {
  providerType: 'google' as const,
  clientId: 'test-client-id-12345.apps.googleusercontent.com',
  clientSecret: 'test-client-secret-GOCSPX-abcdef',
  discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  scopes: ['openid', 'email', 'profile'],
  allowedDomains: ['test-corp.com'],
};

export const MOCK_MICROSOFT_OIDC = {
  providerType: 'microsoft' as const,
  clientId: 'test-ms-client-id-00000000-0000-0000-0000-000000000001',
  clientSecret: 'test-ms-secret-abc123',
  discoveryUrl: 'https://login.microsoftonline.com/test-tenant-id/v2.0/.well-known/openid-configuration',
  scopes: ['openid', 'email', 'profile'],
  allowedDomains: ['test-corp.com', 'acquired-co.com'],
};

// ==================== Mock SAML Response Fixtures ====================

export const MOCK_SAML_RESPONSE = {
  valid: {
    nameId: 'user@test-corp.com',
    attributes: {
      'urn:oid:0.9.2342.19200300.100.1.3': 'user@test-corp.com',
      'urn:oid:2.5.4.42': 'John',
      'urn:oid:2.5.4.4': 'Doe',
      'memberOf': ['Engineering', 'Engineering Leads'],
    },
    sessionIndex: '_session_index_12345',
    issuer: 'https://idp.test-corp.com/saml/metadata',
  },
  expired: {
    nameId: 'expired@test-corp.com',
    error: 'SAML assertion has expired',
  },
  invalidSignature: {
    nameId: 'invalid@test-corp.com',
    error: 'SAML response signature verification failed',
  },
};

// ==================== Mock OIDC Token Fixtures ====================

// Deterministic base timestamp for OIDC token fixtures (2026-01-15T00:00:00Z)
const OIDC_TOKEN_BASE_TIMESTAMP = 1768435200;

export const MOCK_OIDC_TOKENS = {
  valid: {
    idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-id-token',
    accessToken: 'ya29.test-access-token-abcdef',
    refreshToken: '1//test-refresh-token-xyz',
    expiresIn: 3600,
    tokenType: 'Bearer',
    claims: {
      sub: 'google-user-id-12345',
      email: 'user@test-corp.com',
      email_verified: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
      iss: 'https://accounts.google.com',
      aud: 'test-client-id-12345.apps.googleusercontent.com',
      exp: OIDC_TOKEN_BASE_TIMESTAMP + 3600,
      iat: OIDC_TOKEN_BASE_TIMESTAMP,
      nonce: 'test-nonce-12345',
    },
  },
  expired: {
    error: 'Token has expired',
    errorDescription: 'The ID token has expired',
  },
  invalidAudience: {
    error: 'Invalid audience',
    errorDescription: 'Token audience does not match client_id',
  },
};

// ==================== Test Workspace & User Factories ====================

export function createTestWorkspaceId(): string {
  return '00000000-0000-4000-a000-000000000001';
}

export function createTestUserId(): string {
  return '00000000-0000-4000-a000-000000000002';
}

export function createTestAdminUser() {
  return {
    id: createTestUserId(),
    email: 'admin@test-corp.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  };
}

export function createTestSsoUser(overrides?: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-a000-000000000003',
    email: 'sso-user@test-corp.com',
    firstName: 'SSO',
    lastName: 'User',
    role: 'developer',
    ...overrides,
  };
}

// ==================== Mock Domain Fixtures ====================

export const MOCK_DOMAIN = {
  domain: 'test-corp.com',
  verificationMethod: 'dns' as const,
  verificationToken: 'devos-verification=abc123def456',
};

export const MOCK_SECONDARY_DOMAIN = {
  domain: 'acquired-co.com',
  verificationMethod: 'email' as const,
  verificationToken: 'devos-verification=xyz789ghi012',
};

// ==================== SCIM Fixtures ====================

export const MOCK_SCIM_TOKEN = 'scim-bearer-token-test-abc123';

export const MOCK_SCIM_USER = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  userName: 'scim-user@test-corp.com',
  name: {
    givenName: 'SCIM',
    familyName: 'User',
  },
  emails: [{ value: 'scim-user@test-corp.com', type: 'work', primary: true }],
  active: true,
  externalId: 'ext-user-001',
};

export const MOCK_SCIM_GROUP = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
  displayName: 'Engineering',
  externalId: 'ext-group-001',
  members: [],
};

// ==================== Webhook Test Fixtures ====================

export function createMockWebhookPayload(eventType: string, workspaceId: string) {
  return {
    id: expect.any(String),
    event: {
      id: expect.any(String),
      eventType,
      workspaceId,
      actorId: expect.any(String),
      targetUserId: null,
      ipAddress: expect.any(String),
      details: expect.any(Object),
      createdAt: expect.any(String),
    },
    deliveredAt: expect.any(String),
  };
}

// ==================== Session Fixtures ====================

export const MOCK_FEDERATED_SESSION = {
  userId: createTestUserId(),
  workspaceId: createTestWorkspaceId(),
  providerType: 'saml' as const,
  providerConfigId: '00000000-0000-4000-a000-000000000010',
  idpSessionId: '_session_index_12345',
  devosSessionId: 'devos-session-abc123',
  accessTokenJti: 'jti-access-abc123',
  refreshTokenJti: 'jti-refresh-abc123',
  sessionTimeoutMinutes: 480,
  idleTimeoutMinutes: 60,
};

// ==================== Enforcement Fixtures ====================

export const MOCK_ENFORCEMENT_CONFIG = {
  gracePeriodHours: 72,
  bypassEmails: ['emergency@test-corp.com'],
  ownerBypassEnabled: true,
  bypassServiceAccounts: true,
  enforcementMessage: 'SSO login is required for this workspace',
};

// ==================== Audit Fixtures ====================

export const MOCK_ALERT_RULE = {
  name: 'Failed Login Alert',
  description: 'Alert on 5+ failed logins in 5 minutes',
  eventTypes: ['saml_login_failure', 'oidc_login_failure'],
  threshold: 5,
  windowMinutes: 5,
  cooldownMinutes: 30,
  notificationChannels: ['email'],
};

export const MOCK_WEBHOOK_CONFIG = {
  name: 'Security Webhook',
  url: 'https://hooks.test-corp.com/sso-events',
  secret: 'whsec_test_secret_abc123',
  eventTypes: ['saml_login_success', 'saml_login_failure', 'oidc_login_success', 'oidc_login_failure'],
  headers: { 'X-Custom-Header': 'test-value' },
  retryCount: 3,
  timeoutMs: 5000,
};

// ==================== Helper Utilities ====================

/**
 * Create a mock JWT request object for controller tests
 */
export function createMockRequest(userId: string, workspaceId?: string): Partial<Request> {
  return {
    user: { id: userId, sub: userId, email: 'admin@test-corp.com' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
    ...(workspaceId ? { params: { workspaceId } } : {}),
  } as any;
}

/**
 * Mock response type for controller tests - provides type-safe access to mock functions
 */
export interface MockResponse {
  json: jest.Mock;
  send: jest.Mock;
  set: jest.Mock;
  setHeader: jest.Mock;
  status: jest.Mock;
  redirect: jest.Mock;
}

/**
 * Create a mock response object for controller tests
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Delay helper for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deterministic UUID for tests
 */
export function createTestUuid(suffix: number): string {
  return `00000000-0000-4000-a000-${suffix.toString().padStart(12, '0')}`;
}

/**
 * Create mock audit service
 */
export function createMockAuditService() {
  return {
    logEvent: jest.fn().mockResolvedValue(undefined),
    listEvents: jest.fn().mockResolvedValue({ events: [], total: 0, page: 1, limit: 20 }),
    setAlertService: jest.fn(),
    setWebhookService: jest.fn(),
  };
}

/**
 * Create mock Redis service with in-memory backing store
 */
export function createMockRedisService() {
  const store = new Map<string, string>();
  return {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) || null)),
    set: jest.fn().mockImplementation((key: string, value: string, _ttl?: number) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    /** Retrieve the backing store for assertions (read-only access) */
    getStore: () => new Map(store),
    /** Clear the backing store between tests */
    clearStore: () => store.clear(),
  };
}

/**
 * Create a mock workspace member repository
 */
export function createMockWorkspaceMemberRepository(role: string = 'admin') {
  return {
    findOne: jest.fn().mockResolvedValue({
      userId: createTestUserId(),
      workspaceId: createTestWorkspaceId(),
      role,
    }),
    find: jest.fn().mockResolvedValue([]),
  };
}
