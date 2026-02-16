import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      WorkspaceMember,
      Project,
      SecurityEvent,
    ]),
  ],
  controllers: [AdminUsersController, AdminAnalyticsController],
  providers: [AdminUsersService, AdminAnalyticsService, SuperAdminGuard, AdminBootstrapService],
  exports: [SuperAdminGuard],
})
export class AdminModule {}
