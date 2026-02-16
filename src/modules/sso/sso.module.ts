import { Module, forwardRef } from '@nestjs/common';
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
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';

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
  ],
})
export class SsoModule {}
