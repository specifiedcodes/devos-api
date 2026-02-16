import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SamlConfiguration } from '../../database/entities/saml-configuration.entity';
import { SsoAuditEvent } from '../../database/entities/sso-audit-event.entity';
import { User } from '../../database/entities/user.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SamlService } from './saml/saml.service';
import { SamlController } from './saml/saml.controller';
import { SamlConfigService } from './saml/saml-config.service';
import { SamlValidationService } from './saml/saml-validation.service';
import { SsoAuditService } from './sso-audit.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SamlConfiguration, SsoAuditEvent, User, WorkspaceMember]),
    ConfigModule,
    AuthModule,
  ],
  controllers: [SamlController],
  providers: [
    SamlService,
    SamlConfigService,
    SamlValidationService,
    SsoAuditService,
  ],
  exports: [SamlService, SamlConfigService, SsoAuditService],
})
export class SsoModule {}
