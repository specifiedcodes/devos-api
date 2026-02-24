import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiToken } from '../../database/entities/api-token.entity';
import { PermissionWebhook } from '../../database/entities/permission-webhook.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { ApiTokenService } from './services/api-token.service';
import { PermissionCheckService } from './services/permission-check.service';
import { PermissionWebhookService } from './services/permission-webhook.service';
import { ApiTokenGuard } from './guards/api-token.guard';
import {
  PermissionCheckController,
  ApiTokenController,
  PermissionWebhookController,
} from './controllers/permission-analytics.controller';
import { CustomRolesModule } from '../custom-roles/custom-roles.module';
import { PermissionAuditModule } from '../permission-audit/permission-audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiToken, PermissionWebhook, WorkspaceMember]),
    CustomRolesModule,
    PermissionAuditModule,
  ],
  controllers: [
    PermissionCheckController,
    ApiTokenController,
    PermissionWebhookController,
  ],
  providers: [
    ApiTokenService,
    PermissionCheckService,
    PermissionWebhookService,
    ApiTokenGuard,
  ],
  exports: [ApiTokenService, PermissionCheckService, PermissionWebhookService],
})
export class PermissionAnalyticsModule {}
