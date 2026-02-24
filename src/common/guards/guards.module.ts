import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { RoleGuard } from './role.guard';
import { PermissionGuard } from './permission.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceMember, SecurityEvent]),
  ],
  providers: [RoleGuard, PermissionGuard],
  exports: [RoleGuard, PermissionGuard, TypeOrmModule],
})
export class GuardsModule {}
