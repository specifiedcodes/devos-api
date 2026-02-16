import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { AlertRule } from '../../database/entities/alert-rule.entity';
import { AlertHistory } from '../../database/entities/alert-history.entity';
import { Incident } from '../../database/entities/incident.entity';
import { IncidentUpdate } from '../../database/entities/incident-update.entity';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AlertRuleEngine } from './services/alert-rule-engine.service';
import { AlertNotificationService } from './services/alert-notification.service';
import { AlertRuleSeedService } from './services/alert-rule-seed.service';
import { IncidentService } from './services/incident.service';
import { IncidentNotificationService } from './services/incident-notification.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AlertRulesController } from './controllers/alert-rules.controller';
import { IncidentController } from './controllers/incident.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { HealthModule } from '../health/health.module';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      WorkspaceMember,
      Project,
      SecurityEvent,
      AlertRule,
      AlertHistory,
      Incident,
      IncidentUpdate,
    ]),
    HealthModule,
    EmailModule,
    NotificationModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAnalyticsController,
    AlertRulesController,
    IncidentController,
  ],
  providers: [
    AdminUsersService,
    AdminAnalyticsService,
    SuperAdminGuard,
    AdminBootstrapService,
    AlertRuleEngine,
    AlertNotificationService,
    AlertRuleSeedService,
    IncidentService,
    IncidentNotificationService,
  ],
  exports: [SuperAdminGuard],
})
export class AdminModule {}
