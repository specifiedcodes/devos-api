import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { TenantConnectionService } from './services/tenant-connection.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Workspace, WorkspaceMember])],
  providers: [TenantConnectionService],
  exports: [TenantConnectionService, TypeOrmModule],
})
export class DatabaseModule {}
