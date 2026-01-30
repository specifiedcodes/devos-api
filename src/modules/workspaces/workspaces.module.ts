import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { WorkspaceOwnerGuard } from './guards/workspace-owner.guard';
import { WorkspaceAdminGuard } from './guards/workspace-admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMember, SecurityEvent])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceOwnerGuard, WorkspaceAdminGuard],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
