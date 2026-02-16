import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      WorkspaceMember,
      Project,
      SecurityEvent,
      AuditLog,
    ]),
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, SuperAdminGuard, AdminBootstrapService],
  exports: [SuperAdminGuard],
})
export class AdminModule {}
