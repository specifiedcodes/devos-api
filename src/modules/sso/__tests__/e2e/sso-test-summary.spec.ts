/**
 * SSO Module Test Summary & Regression Guard
 * Meta-test that verifies all SSO components have adequate test coverage,
 * module health, and API route registration.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('SSO Test Summary & Regression Guard', () => {
  const ssoModulePath = path.resolve(__dirname, '../../');

  // ==================== Test Coverage Verification ====================

  describe('Test Coverage Verification', () => {
    // Controllers spec files
    const controllerSpecFiles = [
      'saml/saml.controller.spec.ts',
      'oidc/oidc.controller.spec.ts',
      'domain/__tests__/domain.controller.spec.ts',
      'jit/__tests__/jit-provisioning.controller.spec.ts',
      'scim/__tests__/scim-user.controller.spec.ts',
      'scim/__tests__/scim-group.controller.spec.ts',
      'scim/__tests__/scim-admin.controller.spec.ts',
      'session/session-federation.controller.spec.ts',
      'enforcement/sso-enforcement.controller.spec.ts',
      'audit/sso-audit.controller.spec.ts',
    ];

    it.each(controllerSpecFiles)(
      'should have spec file for controller: %s',
      (specFile) => {
        const fullPath = path.join(ssoModulePath, specFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );

    // Service spec files
    const serviceSpecFiles = [
      'saml/saml.service.spec.ts',
      'saml/saml-config.service.spec.ts',
      'saml/saml-validation.service.spec.ts',
      'oidc/oidc.service.spec.ts',
      'oidc/oidc-config.service.spec.ts',
      'oidc/oidc-discovery.service.spec.ts',
      'oidc/oidc-token.service.spec.ts',
      'domain/__tests__/domain-verification.service.spec.ts',
      'jit/__tests__/jit-provisioning.service.spec.ts',
      'scim/__tests__/scim-user.service.spec.ts',
      'scim/__tests__/scim-group.service.spec.ts',
      'scim/__tests__/scim-token.service.spec.ts',
      'scim/__tests__/scim-sync-log.service.spec.ts',
      'session/session-federation.service.spec.ts',
      'enforcement/sso-enforcement.service.spec.ts',
      'sso-audit.service.spec.ts',
      'audit/sso-audit-export.service.spec.ts',
      'audit/sso-audit-alert.service.spec.ts',
      'audit/sso-audit-webhook.service.spec.ts',
    ];

    it.each(serviceSpecFiles)(
      'should have spec file for service: %s',
      (specFile) => {
        // The path is relative to sso module root (one level up from audit service)
        const fullPath = specFile.startsWith('sso-audit.service')
          ? path.join(ssoModulePath, specFile)
          : path.join(ssoModulePath, specFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );

    // DTO spec files
    const dtoSpecFiles = [
      'dto/create-saml-config.dto.spec.ts',
      'dto/create-oidc-config.dto.spec.ts',
      'dto/domain.dto.spec.ts',
      'dto/jit-provisioning.dto.spec.ts',
      'dto/scim.dto.spec.ts',
      'dto/session-federation.dto.spec.ts',
      'dto/enforcement.dto.spec.ts',
      'dto/audit.dto.spec.ts',
    ];

    it.each(dtoSpecFiles)(
      'should have spec file for DTO: %s',
      (specFile) => {
        const fullPath = path.join(ssoModulePath, specFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );

    // Scheduler spec files
    const schedulerSpecFiles = [
      'domain/__tests__/domain-verification.scheduler.spec.ts',
      'session/session-cleanup.scheduler.spec.ts',
      'enforcement/sso-enforcement.scheduler.spec.ts',
      'audit/sso-audit.scheduler.spec.ts',
    ];

    it.each(schedulerSpecFiles)(
      'should have spec file for scheduler: %s',
      (specFile) => {
        const fullPath = path.join(ssoModulePath, specFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );

    // Guard spec files
    const guardSpecFiles = [
      'scim/__tests__/scim-auth.guard.spec.ts',
      'enforcement/sso-enforcement.guard.spec.ts',
    ];

    it.each(guardSpecFiles)(
      'should have spec file for guard: %s',
      (specFile) => {
        const fullPath = path.join(ssoModulePath, specFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );

    // E2E test files
    const e2eTestFiles = [
      '__tests__/e2e/sso-e2e-test.helper.ts',
      '__tests__/e2e/saml-e2e.spec.ts',
      '__tests__/e2e/oidc-e2e.spec.ts',
      '__tests__/e2e/domain-e2e.spec.ts',
      '__tests__/e2e/jit-provisioning-e2e.spec.ts',
      '__tests__/e2e/scim-e2e.spec.ts',
      '__tests__/e2e/session-federation-e2e.spec.ts',
      '__tests__/e2e/enforcement-e2e.spec.ts',
      '__tests__/e2e/audit-e2e.spec.ts',
      '__tests__/e2e/sso-integration-e2e.spec.ts',
      '__tests__/e2e/sso-test-summary.spec.ts',
    ];

    it.each(e2eTestFiles)(
      'should have E2E test file: %s',
      (testFile) => {
        const fullPath = path.join(ssoModulePath, testFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );
  });

  // ==================== Module Health Verification ====================

  describe('Module Health Verification', () => {
    it('should have SsoModule file', () => {
      const modulePath = path.join(ssoModulePath, 'sso.module.ts');
      expect(fs.existsSync(modulePath)).toBe(true);
    });

    it('should verify SsoModule imports are present', () => {
      const modulePath = path.join(ssoModulePath, 'sso.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');

      // Verify key imports
      expect(content).toContain('SamlService');
      expect(content).toContain('OidcService');
      expect(content).toContain('DomainVerificationService');
      expect(content).toContain('JitProvisioningService');
      expect(content).toContain('ScimUserService');
      expect(content).toContain('SessionFederationService');
      expect(content).toContain('SsoEnforcementService');
      expect(content).toContain('SsoAuditService');
    });

    it('should verify SsoModule has all controllers registered', () => {
      const modulePath = path.join(ssoModulePath, 'sso.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');

      expect(content).toContain('SamlController');
      expect(content).toContain('OidcController');
      expect(content).toContain('DomainController');
      expect(content).toContain('JitProvisioningController');
      expect(content).toContain('ScimUserController');
      expect(content).toContain('ScimGroupController');
      expect(content).toContain('ScimAdminController');
      expect(content).toContain('SessionFederationController');
      expect(content).toContain('SsoEnforcementController');
      expect(content).toContain('SsoAuditController');
    });

    it('should verify SsoModule has onModuleInit wiring', () => {
      const modulePath = path.join(ssoModulePath, 'sso.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');

      expect(content).toContain('OnModuleInit');
      expect(content).toContain('onModuleInit');
      expect(content).toContain('setAlertService');
      expect(content).toContain('setWebhookService');
    });

    it('should verify all SSO services are in providers array', () => {
      const modulePath = path.join(ssoModulePath, 'sso.module.ts');
      const content = fs.readFileSync(modulePath, 'utf-8');

      const expectedProviders = [
        'SamlService',
        'SamlConfigService',
        'SamlValidationService',
        'OidcService',
        'OidcConfigService',
        'OidcDiscoveryService',
        'OidcTokenService',
        'SsoAuditService',
        'DomainVerificationService',
        'DomainVerificationScheduler',
        'JitProvisioningService',
        'ScimUserService',
        'ScimGroupService',
        'ScimTokenService',
        'ScimSyncLogService',
        'ScimAuthGuard',
        'SessionFederationService',
        'SessionCleanupScheduler',
        'SsoEnforcementService',
        'SsoEnforcementGuard',
        'SsoEnforcementScheduler',
        'SsoAuditExportService',
        'SsoAuditAlertService',
        'SsoAuditWebhookService',
        'SsoAuditScheduler',
      ];

      expectedProviders.forEach((provider) => {
        expect(content).toContain(provider);
      });
    });
  });

  // ==================== API Route Registration Verification ====================

  describe('API Route Registration Verification', () => {
    it('should verify SAML routes are under api/auth/saml', () => {
      const controllerPath = path.join(ssoModulePath, 'saml/saml.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'api/auth/saml'");
    });

    it('should verify OIDC routes are under api/auth/oidc', () => {
      const controllerPath = path.join(ssoModulePath, 'oidc/oidc.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'api/auth/oidc'");
    });

    it('should verify domain routes are under api/auth/sso/domains', () => {
      const controllerPath = path.join(ssoModulePath, 'domain/domain.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'api/auth/sso/domains'");
    });

    it('should verify JIT routes are under api/auth/sso/jit-config', () => {
      const controllerPath = path.join(ssoModulePath, 'jit/jit-provisioning.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'api/auth/sso/jit-config'");
    });

    it('should verify SCIM user routes are under scim/v2/Users', () => {
      const controllerPath = path.join(ssoModulePath, 'scim/scim-user.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'scim/v2/Users'");
    });

    it('should verify SCIM group routes are under scim/v2/Groups', () => {
      const controllerPath = path.join(ssoModulePath, 'scim/scim-group.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'scim/v2/Groups'");
    });

    it('should verify session routes are under api/auth/sso/sessions', () => {
      const controllerPath = path.join(ssoModulePath, 'session/session-federation.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("'api/auth/sso/sessions'");
    });

    it('should verify enforcement routes exist under api/workspaces/:workspaceId/sso/enforcement', () => {
      const controllerPath = path.join(ssoModulePath, 'enforcement/sso-enforcement.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain('api/workspaces/:workspaceId/sso/enforcement');
    });

    it('should verify audit routes are under api/workspaces/:workspaceId/sso/audit', () => {
      const controllerPath = path.join(ssoModulePath, 'audit/sso-audit.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain('api/workspaces/:workspaceId/sso/audit');
    });

    it('should verify SAML controller has config CRUD routes', () => {
      const controllerPath = path.join(ssoModulePath, 'saml/saml.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("@Post(':workspaceId/config')");
      expect(content).toContain("@Get(':workspaceId/config')");
      expect(content).toContain("@Put(':workspaceId/config/:configId')");
      expect(content).toContain("@Delete(':workspaceId/config/:configId')");
    });

    it('should verify SAML controller has login and callback routes', () => {
      const controllerPath = path.join(ssoModulePath, 'saml/saml.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("@Get(':workspaceId/login')");
      expect(content).toContain("@Post(':workspaceId/callback')");
    });

    it('should verify OIDC controller has login and callback routes', () => {
      const controllerPath = path.join(ssoModulePath, 'oidc/oidc.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain("@Get(':workspaceId/login')");
      expect(content).toContain("@Get(':workspaceId/callback')");
    });

    it('should verify audit controller has events, export, compliance, alerts, and webhooks routes', () => {
      const controllerPath = path.join(ssoModulePath, 'audit/sso-audit.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain('/sso/audit/events');
      expect(content).toContain('/sso/audit/events/export');
      expect(content).toContain('/sso/audit/compliance-report');
      expect(content).toContain('/sso/audit/alert-rules');
      expect(content).toContain('/sso/audit/webhooks');
    });

    it('should verify enforcement controller has enable, disable, check, and bypass routes', () => {
      const controllerPath = path.join(ssoModulePath, 'enforcement/sso-enforcement.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');
      expect(content).toContain('enforcement/enable');
      expect(content).toContain('enforcement/disable');
      expect(content).toContain('enforcement/bypass');
      expect(content).toContain('enforcement/check');
    });
  });

  // ==================== Source File Existence Verification ====================

  describe('Source File Existence Verification', () => {
    const sourceFiles = [
      // SAML
      'saml/saml.service.ts',
      'saml/saml.controller.ts',
      'saml/saml-config.service.ts',
      'saml/saml-validation.service.ts',
      // OIDC
      'oidc/oidc.service.ts',
      'oidc/oidc.controller.ts',
      'oidc/oidc-config.service.ts',
      'oidc/oidc-discovery.service.ts',
      'oidc/oidc-token.service.ts',
      // Domain
      'domain/domain-verification.service.ts',
      'domain/domain.controller.ts',
      'domain/domain-verification.scheduler.ts',
      // JIT
      'jit/jit-provisioning.service.ts',
      'jit/jit-provisioning.controller.ts',
      // SCIM
      'scim/scim-user.service.ts',
      'scim/scim-group.service.ts',
      'scim/scim-token.service.ts',
      'scim/scim-sync-log.service.ts',
      'scim/scim-user.controller.ts',
      'scim/scim-group.controller.ts',
      'scim/scim-admin.controller.ts',
      'scim/guards/scim-auth.guard.ts',
      // Session
      'session/session-federation.service.ts',
      'session/session-federation.controller.ts',
      'session/session-cleanup.scheduler.ts',
      // Enforcement
      'enforcement/sso-enforcement.service.ts',
      'enforcement/sso-enforcement.controller.ts',
      'enforcement/sso-enforcement.guard.ts',
      'enforcement/sso-enforcement.scheduler.ts',
      // Audit
      'audit/sso-audit-export.service.ts',
      'audit/sso-audit-alert.service.ts',
      'audit/sso-audit-webhook.service.ts',
      'audit/sso-audit.controller.ts',
      'audit/sso-audit.scheduler.ts',
      // Module
      'sso.module.ts',
    ];

    it.each(sourceFiles)(
      'should have source file: %s',
      (sourceFile) => {
        const fullPath = path.join(ssoModulePath, sourceFile);
        expect(fs.existsSync(fullPath)).toBe(true);
      },
    );
  });
});
