import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomRole } from '../../database/entities/custom-role.entity';
import { RolePermission } from '../../database/entities/role-permission.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CustomRoleService } from './services/custom-role.service';
import { PermissionMatrixService } from './services/permission-matrix.service';
import { CustomRoleController } from './controllers/custom-role.controller';
import { PermissionMatrixController } from './controllers/permission-matrix.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomRole, RolePermission, WorkspaceMember])],
  controllers: [CustomRoleController, PermissionMatrixController],
  providers: [CustomRoleService, PermissionMatrixService],
  exports: [CustomRoleService, PermissionMatrixService],
})
export class CustomRolesModule {}
