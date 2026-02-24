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
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditSavedSearch } from '../../database/entities/audit-saved-search.entity';
import { Template } from '../../database/entities/template.entity';
import { TemplateAuditEvent } from '../../database/entities/template-audit-event.entity';
import { TemplateAnalyticsEvent } from '../../database/entities/template-analytics-event.entity';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBootstrapService } from './services/admin-bootstrap.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AlertRuleEngine } from './services/alert-rule-engine.service';
import { AlertNotificationService } from './services/alert-notification.service';
import { AlertRuleSeedService } from './services/alert-rule-seed.service';
import { IncidentService } from './services/incident.service';
import { IncidentNotificationService } from './services/incident-notification.service';
import { AdminAuditLogService } from './services/admin-audit-log.service';
import { AdminFeaturedTemplatesService } from './services/admin-featured-templates.service';
import { AdminTemplateAnalyticsService } from './services/admin-template-analytics.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AlertRulesController } from './controllers/alert-rules.controller';
import { IncidentController } from './controllers/incident.controller';
import { AdminAuditLogController } from './controllers/admin-audit-log.controller';
import { AdminFeaturedTemplatesController } from './controllers/admin-featured-templates.controller';
import { AdminTemplateAnalyticsController } from './controllers/admin-template-analytics.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { HealthModule } from '../health/health.module';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { TemplatesModule } from '../templates/templates.module';

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
      AuditLog,
      AuditSavedSearch,
      Template,
      TemplateAuditEvent,
      TemplateAnalyticsEvent,
    ]),
    HealthModule,
    EmailModule,
    NotificationModule,
    TemplatesModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAnalyticsController,
    AlertRulesController,
    IncidentController,
    AdminAuditLogController,
    AdminFeaturedTemplatesController,
    // Story 19-9: Template Analytics
    AdminTemplateAnalyticsController,
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
    AdminAuditLogService,
    AdminFeaturedTemplatesService,
    // Story 19-9: Template Analytics
    AdminTemplateAnalyticsService,
  ],
  exports: [SuperAdminGuard, AdminFeaturedTemplatesService, AdminTemplateAnalyticsService],
})
export class AdminModule {}
