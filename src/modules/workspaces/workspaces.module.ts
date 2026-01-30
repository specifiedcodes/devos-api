import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesCleanupService } from './workspaces-cleanup.service';
import { WorkspacesController } from './workspaces.controller';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { User } from '../../database/entities/user.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { WorkspaceOwnerGuard } from './guards/workspace-owner.guard';
import { WorkspaceAdminGuard } from './guards/workspace-admin.guard';
import { RoleGuard } from '../../common/guards/role.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, WorkspaceInvitation, User, SecurityEvent]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    ScheduleModule.forRoot(),
    EmailModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    WorkspacesCleanupService,
    WorkspaceOwnerGuard,
    WorkspaceAdminGuard,
    RoleGuard,
  ],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
