import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { SamlConfiguration } from '../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../database/entities/oidc-configuration.entity';
import { SsoAuditEvent } from '../../database/entities/sso-audit-event.entity';
import { SsoDomain } from '../../database/entities/sso-domain.entity';
import { JitProvisioningConfig } from '../../database/entities/jit-provisioning-config.entity';
import { ScimConfiguration } from '../../database/entities/scim-configuration.entity';
import { ScimToken } from '../../database/entities/scim-token.entity';
import { ScimGroup } from '../../database/entities/scim-group.entity';
import { ScimGroupMembership } from '../../database/entities/scim-group-membership.entity';
import { ScimSyncLog } from '../../database/entities/scim-sync-log.entity';
import { User } from '../../database/entities/user.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SsoAuditAlertRule } from '../../database/entities/sso-audit-alert-rule.entity';
import { SsoAuditWebhook } from '../../database/entities/sso-audit-webhook.entity';
import { SsoAuditWebhookDelivery } from '../../database/entities/sso-audit-webhook-delivery.entity';
import { SamlService } from './saml/saml.service';
import { SamlController } from './saml/saml.controller';
import { SamlConfigService } from './saml/saml-config.service';
import { SamlValidationService } from './saml/saml-validation.service';
import { OidcService } from './oidc/oidc.service';
import { OidcController } from './oidc/oidc.controller';
import { OidcConfigService } from './oidc/oidc-config.service';
import { OidcDiscoveryService } from './oidc/oidc-discovery.service';
import { OidcTokenService } from './oidc/oidc-token.service';
import { SsoAuditService } from './sso-audit.service';
import { DomainVerificationService } from './domain/domain-verification.service';
import { DomainVerificationScheduler } from './domain/domain-verification.scheduler';
import { DomainController } from './domain/domain.controller';
import { JitProvisioningService } from './jit/jit-provisioning.service';
import { JitProvisioningController } from './jit/jit-provisioning.controller';
import { ScimUserService } from './scim/scim-user.service';
import { ScimGroupService } from './scim/scim-group.service';
import { ScimTokenService } from './scim/scim-token.service';
import { ScimSyncLogService } from './scim/scim-sync-log.service';
import { ScimAuthGuard } from './scim/guards/scim-auth.guard';
import { ScimUserController } from './scim/scim-user.controller';
import { ScimGroupController } from './scim/scim-group.controller';
import { ScimAdminController } from './scim/scim-admin.controller';
import { SsoFederatedSession } from '../../database/entities/sso-federated-session.entity';
import { SsoEnforcementPolicy } from '../../database/entities/sso-enforcement-policy.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { SessionFederationService } from './session/session-federation.service';
import { SessionFederationController } from './session/session-federation.controller';
import { SessionCleanupScheduler } from './session/session-cleanup.scheduler';
import { SsoEnforcementService } from './enforcement/sso-enforcement.service';
import { SsoEnforcementController } from './enforcement/sso-enforcement.controller';
import { SsoEnforcementGuard } from './enforcement/sso-enforcement.guard';
import { SsoEnforcementScheduler } from './enforcement/sso-enforcement.scheduler';
import { SsoAuditExportService } from './audit/sso-audit-export.service';
import { SsoAuditAlertService } from './audit/sso-audit-alert.service';
import { SsoAuditWebhookService } from './audit/sso-audit-webhook.service';
import { SsoAuditController } from './audit/sso-audit.controller';
import { SsoAuditScheduler } from './audit/sso-audit.scheduler';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { ModuleRef } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SamlConfiguration,
      OidcConfiguration,
      SsoAuditEvent,
      SsoDomain,
      JitProvisioningConfig,
      ScimConfiguration,
      ScimToken,
      ScimGroup,
      ScimGroupMembership,
      ScimSyncLog,
      SsoFederatedSession,
      SsoEnforcementPolicy,
      SsoAuditAlertRule,
      SsoAuditWebhook,
      SsoAuditWebhookDelivery,
      Workspace,
      User,
      WorkspaceMember,
    ]),
    ConfigModule,
    HttpModule.register({ timeout: 10000 }),
    forwardRef(() => AuthModule),
    RedisModule,
    ScheduleModule,
  ],
  controllers: [
    SamlController,
    OidcController,
    DomainController,
    JitProvisioningController,
    ScimUserController,
    ScimGroupController,
    ScimAdminController,
    SessionFederationController,
    SsoEnforcementController,
    SsoAuditController,
  ],
  providers: [
    SamlService,
    SamlConfigService,
    SamlValidationService,
    OidcService,
    OidcConfigService,
    OidcDiscoveryService,
    OidcTokenService,
    SsoAuditService,
    DomainVerificationService,
    DomainVerificationScheduler,
    JitProvisioningService,
    ScimUserService,
    ScimGroupService,
    ScimTokenService,
    ScimSyncLogService,
    ScimAuthGuard,
    SessionFederationService,
    SessionCleanupScheduler,
    SsoEnforcementService,
    SsoEnforcementGuard,
    SsoEnforcementScheduler,
    SsoAuditExportService,
    SsoAuditAlertService,
    SsoAuditWebhookService,
    SsoAuditScheduler,
  ],
  exports: [
    SamlService,
    SamlConfigService,
    OidcService,
    OidcConfigService,
    SsoAuditService,
    DomainVerificationService,
    JitProvisioningService,
    ScimUserService,
    ScimGroupService,
    ScimTokenService,
    SessionFederationService,
    SsoEnforcementService,
    SsoEnforcementGuard,
    SsoAuditExportService,
    SsoAuditAlertService,
    SsoAuditWebhookService,
  ],
})
export class SsoModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    // Wire up alert and webhook services to SsoAuditService
    // This avoids circular dependency by using lazy references
    const auditService = this.moduleRef.get(SsoAuditService, { strict: false });
    const alertService = this.moduleRef.get(SsoAuditAlertService, { strict: false });
    const webhookService = this.moduleRef.get(SsoAuditWebhookService, { strict: false });

    if (auditService && alertService) {
      auditService.setAlertService(alertService);
    }
    if (auditService && webhookService) {
      auditService.setWebhookService(webhookService);
    }
  }
}
