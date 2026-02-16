import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SamlConfiguration } from '../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../database/entities/oidc-configuration.entity';
import { SsoAuditEvent } from '../../database/entities/sso-audit-event.entity';
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
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SamlConfiguration, OidcConfiguration, SsoAuditEvent, User, WorkspaceMember]),
    ConfigModule,
    HttpModule.register({ timeout: 10000 }),
    AuthModule,
  ],
  controllers: [SamlController, OidcController],
  providers: [
    SamlService,
    SamlConfigService,
    SamlValidationService,
    OidcService,
    OidcConfigService,
    OidcDiscoveryService,
    OidcTokenService,
    SsoAuditService,
  ],
  exports: [SamlService, SamlConfigService, OidcService, OidcConfigService, SsoAuditService],
})
export class SsoModule {}
