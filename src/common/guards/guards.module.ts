import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { RoleGuard } from './role.guard';
import { PermissionGuard } from './permission.guard';
import { PermissionAuditModule } from '../../modules/permission-audit/permission-audit.module';
import { CustomRolesModule } from '../../modules/custom-roles/custom-roles.module';
import { AuditModule } from '../../shared/audit/audit.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceMember, SecurityEvent]),
    AuditModule,
    PermissionAuditModule,
    CustomRolesModule,
  ],
  providers: [RoleGuard, PermissionGuard],
  exports: [RoleGuard, PermissionGuard, TypeOrmModule],
})
export class GuardsModule {}
