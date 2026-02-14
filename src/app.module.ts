import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './modules/redis/redis.module';
import { EncryptionModule } from './shared/encryption/encryption.module';
import { GuardsModule } from './common/guards/guards.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { BYOKModule } from './modules/byok/byok.module';
import { UsageModule } from './modules/usage/usage.module';
import { WorkspaceSettingsModule } from './modules/workspace-settings/workspace-settings.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SharedLinksModule } from './modules/shared-links/shared-links.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AgentQueueModule } from './modules/agent-queue/agent-queue.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AgentStatusModule } from './modules/agents/agent-status.module';
import { AgentStatusUpdate } from './database/entities/agent-status-update.entity';
import { ApiUsage } from './database/entities/api-usage.entity';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { StoriesModule } from './modules/stories/stories.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { KanbanPreferencesModule } from './modules/kanban-preferences/kanban-preferences.module';
import { CliSessionsModule } from './modules/cli-sessions/cli-sessions.module';
import { ChatModule } from './modules/chat/chat.module';
import { PushModule } from './modules/push/push.module';
import { ChatRoomModule } from './modules/chat-room/chat-room.module';
import { User } from './database/entities/user.entity';
import { Workspace } from './database/entities/workspace.entity';
import { WorkspaceMember } from './database/entities/workspace-member.entity';
import { BackupCode } from './database/entities/backup-code.entity';
import { AccountDeletion } from './database/entities/account-deletion.entity';
import { SecurityEvent } from './database/entities/security-event.entity';
import { Project } from './database/entities/project.entity';
import { ProjectPreferences } from './database/entities/project-preferences.entity';
import { WorkspaceInvitation } from './database/entities/workspace-invitation.entity';
import { BYOKKey } from './database/entities/byok-key.entity';
import { UsageRecord } from './database/entities/usage-record.entity';
import { WorkspaceSettings } from './database/entities/workspace-settings.entity';
import { Notification } from './database/entities/notification.entity';
import { SharedLink } from './database/entities/shared-link.entity';
import { OnboardingStatus } from './database/entities/onboarding-status.entity';
import { ProvisioningStatus } from './database/entities/provisioning-status.entity';
import { AnalyticsEvent } from './modules/analytics/entities/analytics-event.entity';
import { AnalyticsAggregate } from './modules/analytics/entities/analytics-aggregate.entity';
import { AgentJob } from './modules/agent-queue/entities/agent-job.entity';
import { Agent } from './database/entities/agent.entity';
import { IntegrationConnection } from './database/entities/integration-connection.entity';
import { DeploymentApproval } from './database/entities/deployment-approval.entity';
import { Story } from './database/entities/story.entity';
import { Sprint } from './database/entities/sprint.entity';
import { UserKanbanPreferences } from './database/entities/user-kanban-preferences.entity';
import { CliSession } from './database/entities/cli-session.entity';
import { ChatMessage } from './database/entities/chat-message.entity';
import { ConversationThread } from './database/entities/conversation-thread.entity';
import { ChatRoom } from './database/entities/chat-room.entity';
import { ChatRoomMember } from './database/entities/chat-room-member.entity';
import { ChatRoomInvitation } from './database/entities/chat-room-invitation.entity';
import { UserRoomRestriction } from './database/entities/user-room-restriction.entity';
import { ModerationLog } from './database/entities/moderation-log.entity';
import { PinnedMessage } from './database/entities/pinned-message.entity';
import { NotificationPreferences } from './database/entities/notification-preferences.entity';
import { DeploymentRollback } from './database/entities/deployment-rollback.entity';
import { ContextSnapshot } from './database/entities/context-snapshot.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { PushSubscription } from './database/entities/push-subscription.entity';
import { WorkspaceContextMiddleware } from './common/middleware/workspace-context.middleware';
import { WorkspaceContextInterceptor } from './common/interceptors/workspace-context.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // Enable cron jobs for background tasks
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'devos',
      password: process.env.DATABASE_PASSWORD || 'devos_password',
      database: process.env.DATABASE_NAME || 'devos_db',
      entities: [
        User,
        Workspace,
        WorkspaceMember,
        BackupCode,
        AccountDeletion,
        SecurityEvent,
        WorkspaceInvitation,
        Project,
        ProjectPreferences,
        BYOKKey,
        UsageRecord,
        WorkspaceSettings,
        Notification,
        SharedLink,
        OnboardingStatus,
        ProvisioningStatus,
        AnalyticsEvent,
        AnalyticsAggregate,
        AgentJob,
        Agent,
        IntegrationConnection,
        DeploymentApproval,
        Story,
        Sprint,
        UserKanbanPreferences,
        CliSession,
        ChatMessage,
        ConversationThread,
        ChatRoom,
        ChatRoomMember,
        ChatRoomInvitation,
        UserRoomRestriction,
        ModerationLog,
        PinnedMessage,
        NotificationPreferences,
        DeploymentRollback,
        ContextSnapshot,
        AuditLog,
        AgentStatusUpdate,
        PushSubscription,
        ApiUsage,
      ],
      synchronize: false, // Always false - use migrations
      logging: process.env.NODE_ENV === 'development',
      poolSize: 100, // Max 100 connections per AC
    }),
    DatabaseModule,
    RedisModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute for general endpoints
        // Auth endpoints override with stricter limits via @Throttle() decorators
      },
    ]),
    EncryptionModule,
    GuardsModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    BYOKModule,
    UsageModule,
    WorkspaceSettingsModule,
    NotificationModule,
    SharedLinksModule,
    OnboardingModule,
    TemplatesModule,
    ProvisioningModule,
    AnalyticsModule,
    AgentQueueModule,
    AgentsModule,
    AgentStatusModule,
    IntegrationsModule,
    StoriesModule,
    SprintsModule,
    KanbanPreferencesModule,
    CliSessionsModule,
    ChatModule,
    PushModule,
    ChatRoomModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply WorkspaceContextInterceptor globally to extract workspace_id from JWT (Task 4.3)
    {
      provide: APP_INTERCEPTOR,
      useClass: WorkspaceContextInterceptor,
    },
    // Disable global throttler in test environment
    ...(process.env.NODE_ENV !== 'test'
      ? [
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
          },
        ]
      : []),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply WorkspaceContextMiddleware to all routes (Fix Issue #9)
    // Middleware will only activate when x-workspace-id header is present
    consumer.apply(WorkspaceContextMiddleware).forRoutes('*');
  }
}
