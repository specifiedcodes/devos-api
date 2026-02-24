import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomRole } from '../../database/entities/custom-role.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CustomRoleService } from './services/custom-role.service';
import { CustomRoleController } from './controllers/custom-role.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomRole, WorkspaceMember])],
  controllers: [CustomRoleController],
  providers: [CustomRoleService],
  exports: [CustomRoleService],
})
export class CustomRolesModule {}
