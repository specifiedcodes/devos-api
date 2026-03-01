import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomRole } from '../../database/entities/custom-role.entity';
import { RolePermission } from '../../database/entities/role-permission.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CustomRoleService } from './services/custom-role.service';
import { PermissionMatrixService } from './services/permission-matrix.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RoleTemplateService } from './services/role-template.service';
import { CustomRoleController } from './controllers/custom-role.controller';
import { PermissionMatrixController } from './controllers/permission-matrix.controller';
import { PermissionAuditModule } from '../permission-audit/permission-audit.module';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../../shared/audit/audit.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([CustomRole, RolePermission, WorkspaceMember]),
    RedisModule,
    AuditModule,
    PermissionAuditModule,
  ],
  controllers: [CustomRoleController, PermissionMatrixController],
  providers: [CustomRoleService, PermissionMatrixService, PermissionCacheService, RoleTemplateService],
  exports: [CustomRoleService, PermissionMatrixService, PermissionCacheService, RoleTemplateService],
})
export class CustomRolesModule {}
