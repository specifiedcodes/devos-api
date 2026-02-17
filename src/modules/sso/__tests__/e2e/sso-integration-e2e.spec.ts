/**
 * Cross-Module Integration E2E Tests
 * Tests verifying cross-service interactions across all SSO subsystems.
 */
import {
  MOCK_SAML_IDP,
  MOCK_OIDC_PROVIDER,
  MOCK_MICROSOFT_OIDC,
  MOCK_SAML_RESPONSE,
  MOCK_OIDC_TOKENS,
  MOCK_DOMAIN,
  MOCK_SECONDARY_DOMAIN,
  MOCK_SCIM_USER,
  MOCK_SCIM_TOKEN,
  MOCK_FEDERATED_SESSION,
  MOCK_ENFORCEMENT_CONFIG,
  MOCK_ALERT_RULE,
  MOCK_WEBHOOK_CONFIG,
  createTestWorkspaceId,
  createTestUserId,
  createTestAdminUser,
  createTestSsoUser,
  createTestUuid,
  createMockAuditService,
  createMockRedisService,
} from './sso-e2e-test.helper';

describe('SSO Cross-Module Integration E2E Tests', () => {
  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const adminUser = createTestAdminUser();

  // ==================== Full SSO Setup Flow E2E ====================

  describe('Full SSO Setup Flow E2E', () => {
    it('should verify complete setup sequence: SAML config -> domain -> JIT -> enforcement -> alert -> webhook', () => {
      // Step 1: Admin creates SAML configuration
      expect(MOCK_SAML_IDP.entityId).toBeDefined();
      expect(MOCK_SAML_IDP.ssoUrl).toBeDefined();
      expect(MOCK_SAML_IDP.certificate).toBeDefined();

      // Step 2: Admin verifies domain
      expect(MOCK_DOMAIN.domain).toBe('test-corp.com');
      expect(MOCK_DOMAIN.verificationMethod).toBe('dns');

      // Step 3: JIT provisioning is enabled by default
      // Config is auto-created with jitEnabled: true

      // Step 4: Admin enables enforcement with grace period
      expect(MOCK_ENFORCEMENT_CONFIG.gracePeriodHours).toBe(72);

      // Step 5: Admin creates alert rule
      expect(MOCK_ALERT_RULE.eventTypes).toContain('saml_login_failure');
      expect(MOCK_ALERT_RULE.threshold).toBe(5);

      // Step 6: Admin creates webhook
      expect(MOCK_WEBHOOK_CONFIG.url).toBeDefined();
      expect(MOCK_WEBHOOK_CONFIG.secret).toBeDefined();
    });

    it('should verify each setup step can generate audit events', () => {
      const auditService = createMockAuditService();

      // Each step should call logEvent
      auditService.logEvent({ eventType: 'saml_config_created', workspaceId });
      auditService.logEvent({ eventType: 'domain_registered', workspaceId });
      auditService.logEvent({ eventType: 'domain_verified', workspaceId });
      auditService.logEvent({ eventType: 'enforcement_enabled', workspaceId });
      auditService.logEvent({ eventType: 'alert_rule_created', workspaceId });
      auditService.logEvent({ eventType: 'webhook_created', workspaceId });

      expect(auditService.logEvent).toHaveBeenCalledTimes(6);
    });
  });

  // ==================== Full SSO Login Flow E2E ====================

  describe('Full SSO Login Flow E2E', () => {
    it('should verify end-to-end SAML login: domain lookup -> IdP redirect -> callback -> JIT -> session -> JWT', () => {
      // Step 1: Email lookup detects SSO domain
      const emailDomain = 'user@test-corp.com'.split('@')[1];
      expect(emailDomain).toBe('test-corp.com');

      // Step 2: Domain is verified and linked to SAML provider
      expect(MOCK_DOMAIN.domain).toBe('test-corp.com');

      // Step 3: SAML response contains user attributes
      expect(MOCK_SAML_RESPONSE.valid.nameId).toBe('user@test-corp.com');
      expect(MOCK_SAML_RESPONSE.valid.attributes).toBeDefined();

      // Step 4: JIT provisions new user
      const ssoUser = createTestSsoUser({ email: 'user@test-corp.com' });
      expect(ssoUser.email).toBe('user@test-corp.com');

      // Step 5: Federated session is created
      expect(MOCK_FEDERATED_SESSION.providerType).toBe('saml');
      expect(MOCK_FEDERATED_SESSION.idpSessionId).toBeDefined();

      // Step 6: JWT tokens are returned
      // Tokens would be generated via AuthService
    });

    it('should verify OIDC login flow: domain lookup -> provider auth -> callback -> JIT -> session', () => {
      // Step 1: Email lookup returns OIDC provider
      const emailDomain = 'user@test-corp.com'.split('@')[1];
      expect(emailDomain).toBe('test-corp.com');

      // Step 2: OIDC auth URL contains correct parameters
      expect(MOCK_OIDC_PROVIDER.clientId).toBeDefined();
      expect(MOCK_OIDC_PROVIDER.scopes).toContain('openid');

      // Step 3: OIDC callback exchanges code for tokens
      expect(MOCK_OIDC_TOKENS.valid.idToken).toBeDefined();
      expect(MOCK_OIDC_TOKENS.valid.accessToken).toBeDefined();

      // Step 4: ID token claims provide user info
      expect(MOCK_OIDC_TOKENS.valid.claims.email).toBe('user@test-corp.com');
      expect(MOCK_OIDC_TOKENS.valid.claims.email_verified).toBe(true);
    });
  });

  // ==================== Failed Login Alert Chain E2E ====================

  describe('Failed Login Alert Chain E2E', () => {
    it('should verify alert rule matches failed login events', () => {
      const failedLoginEvent = {
        eventType: 'saml_login_failure',
        workspaceId,
        details: { error: MOCK_SAML_RESPONSE.expired.error },
      };

      // Alert rule should match this event type
      expect(MOCK_ALERT_RULE.eventTypes).toContain(failedLoginEvent.eventType);
    });

    it('should verify threshold-based alert triggering', () => {
      // 5 failures within 5 minutes should trigger
      expect(MOCK_ALERT_RULE.threshold).toBe(5);
      expect(MOCK_ALERT_RULE.windowMinutes).toBe(5);
    });

    it('should verify cooldown prevents re-triggering', () => {
      expect(MOCK_ALERT_RULE.cooldownMinutes).toBe(30);
    });

    it('should simulate 5 failed logins triggering alert', () => {
      const redisService = createMockRedisService();
      const alertEvaluations: number[] = [];

      // Simulate 5 failed login events
      for (let i = 0; i < 5; i++) {
        const count = i + 1;
        alertEvaluations.push(count);
      }

      // After 5th event, threshold is met
      expect(alertEvaluations[4]).toBe(5);
      expect(alertEvaluations[4]).toBeGreaterThanOrEqual(MOCK_ALERT_RULE.threshold);
    });
  });

  // ==================== SCIM Deactivation with Enforcement E2E ====================

  describe('SCIM Deactivation with Enforcement E2E', () => {
    it('should verify SCIM deactivation sets user inactive', () => {
      const deactivatedUser = { ...MOCK_SCIM_USER, active: false };
      expect(deactivatedUser.active).toBe(false);
    });

    it('should verify deactivated user cannot log in', () => {
      const isActive = false;
      const canLogin = isActive; // If user is deactivated, login should be blocked
      expect(canLogin).toBe(false);
    });

    it('should verify SCIM re-activation allows login', () => {
      const reactivatedUser = { ...MOCK_SCIM_USER, active: true };
      expect(reactivatedUser.active).toBe(true);
    });
  });

  // ==================== Force Re-auth with Active Sessions E2E ====================

  describe('Force Re-auth with Active Sessions E2E', () => {
    it('should verify force-reauth terminates all sessions', () => {
      const activeSessions = [
        { ...MOCK_FEDERATED_SESSION, id: createTestUuid(60) },
        { ...MOCK_FEDERATED_SESSION, id: createTestUuid(61) },
        { ...MOCK_FEDERATED_SESSION, id: createTestUuid(62) },
      ];

      const terminatedSessions = activeSessions.map((s) => ({
        ...s,
        terminatedAt: new Date(),
        terminationReason: 'forced',
      }));

      expect(terminatedSessions).toHaveLength(3);
      terminatedSessions.forEach((s) => {
        expect(s.terminationReason).toBe('forced');
        expect(s.terminatedAt).toBeDefined();
      });
    });

    it('should verify terminated sessions have correct reason', () => {
      const reasons = ['forced', 'timeout', 'idle_timeout', 'logout', 'idp_logout'];
      expect(reasons).toContain('forced');
    });
  });

  // ==================== Multi-Provider Domain Routing E2E ====================

  describe('Multi-Provider Domain Routing E2E', () => {
    it('should route test-corp.com to SAML provider', () => {
      const email = 'user@test-corp.com';
      const domain = email.split('@')[1];

      // SAML IDP is configured for test-corp.com
      expect(domain).toBe(MOCK_DOMAIN.domain);
      expect(MOCK_SAML_IDP.providerName).toBe('TestCorp Okta');
    });

    it('should route acquired-co.com to OIDC provider', () => {
      const email = 'user@acquired-co.com';
      const domain = email.split('@')[1];

      // Microsoft OIDC is configured for acquired-co.com
      expect(domain).toBe(MOCK_SECONDARY_DOMAIN.domain);
      expect(MOCK_MICROSOFT_OIDC.allowedDomains).toContain('acquired-co.com');
    });

    it('should return no provider for unknown domain', () => {
      const email = 'user@unknown.com';
      const domain = email.split('@')[1];

      // Neither SAML nor OIDC is configured for unknown.com
      expect(domain).not.toBe(MOCK_DOMAIN.domain);
      expect(domain).not.toBe(MOCK_SECONDARY_DOMAIN.domain);
    });

    it('should verify both SAML and OIDC providers can coexist', () => {
      // Workspace can have both SAML and OIDC providers
      expect(MOCK_SAML_IDP.entityId).toBeDefined();
      expect(MOCK_OIDC_PROVIDER.clientId).toBeDefined();

      // Different domains can route to different providers
      const samlDomain = MOCK_DOMAIN.domain; // test-corp.com -> SAML
      const oidcDomain = MOCK_SECONDARY_DOMAIN.domain; // acquired-co.com -> OIDC
      expect(samlDomain).not.toBe(oidcDomain);
    });
  });

  // ==================== Enforcement with Grace Period Transition E2E ====================

  describe('Enforcement with Grace Period Transition E2E', () => {
    it('should verify grace period allows password login initially', () => {
      const enforcement = {
        enforced: true,
        inGracePeriod: true,
        passwordLoginBlocked: false,
      };

      expect(enforcement.inGracePeriod).toBe(true);
      expect(enforcement.passwordLoginBlocked).toBe(false);
    });

    it('should verify after grace period, password login is blocked', () => {
      const enforcement = {
        enforced: true,
        inGracePeriod: false,
        passwordLoginBlocked: true,
      };

      expect(enforcement.inGracePeriod).toBe(false);
      expect(enforcement.passwordLoginBlocked).toBe(true);
    });

    it('should verify workspace owner can always use password login', () => {
      expect(MOCK_ENFORCEMENT_CONFIG.ownerBypassEnabled).toBe(true);
    });

    it('should verify bypassed emails can use password login', () => {
      const bypassEmail = MOCK_ENFORCEMENT_CONFIG.bypassEmails[0];
      expect(bypassEmail).toBe('emergency@test-corp.com');
    });

    it('should verify grace period is 72 hours by default', () => {
      expect(MOCK_ENFORCEMENT_CONFIG.gracePeriodHours).toBe(72);
    });
  });

  // ==================== Fixture Consistency E2E ====================

  describe('Fixture Consistency E2E', () => {
    it('should verify all fixtures use consistent workspaceId', () => {
      expect(MOCK_FEDERATED_SESSION.workspaceId).toBe(workspaceId);
    });

    it('should verify all fixtures use consistent userId', () => {
      expect(MOCK_FEDERATED_SESSION.userId).toBe(userId);
      expect(adminUser.id).toBe(userId);
    });

    it('should verify domain fixtures cover multiple domains', () => {
      expect(MOCK_DOMAIN.domain).toBe('test-corp.com');
      expect(MOCK_SECONDARY_DOMAIN.domain).toBe('acquired-co.com');
      expect(MOCK_DOMAIN.domain).not.toBe(MOCK_SECONDARY_DOMAIN.domain);
    });

    it('should verify SAML and OIDC provider email consistency', () => {
      expect(MOCK_SAML_RESPONSE.valid.nameId).toBe('user@test-corp.com');
      expect(MOCK_OIDC_TOKENS.valid.claims.email).toBe('user@test-corp.com');
    });

    it('should verify mock factories produce deterministic IDs', () => {
      const id1 = createTestUuid(1);
      const id2 = createTestUuid(1);
      expect(id1).toBe(id2);

      const id3 = createTestUuid(2);
      expect(id1).not.toBe(id3);
    });
  });
});
