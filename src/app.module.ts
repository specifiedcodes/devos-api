import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { StoriesModule } from './modules/stories/stories.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { KanbanPreferencesModule } from './modules/kanban-preferences/kanban-preferences.module';
import { CliSessionsModule } from './modules/cli-sessions/cli-sessions.module';
import { ChatModule } from './modules/chat/chat.module';
import { PushModule } from './modules/push/push.module';
import { ChatRoomModule } from './modules/chat-room/chat-room.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { MemoryModule } from './modules/memory/memory.module';
import { ContextModule } from './modules/context/context.module';
import { ModelRegistryModule } from './modules/model-registry/model-registry.module';
import { BenchmarkModule } from './modules/benchmarks/benchmark.module';
import { ModelPreferencesModule } from './modules/model-preferences/model-preferences.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { LoggingModule } from './modules/logging/logging.module';
import { TracingModule } from './modules/tracing/tracing.module';
import { TracingInterceptor } from './modules/tracing/interceptors/tracing.interceptor';
import { HealthModule } from './modules/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { CorrelationIdMiddleware } from './modules/logging/middleware/correlation-id.middleware';
import { RequestLoggingInterceptor } from './modules/logging/interceptors/request-logging.interceptor';
import { WorkspaceContextMiddleware } from './common/middleware/workspace-context.middleware';
import { WorkspaceContextInterceptor } from './common/interceptors/workspace-context.interceptor';
import { WebSocketSecurityModule } from './modules/websocket-security/ws-security.module';
import { FileStorageModule } from './modules/file-storage/file-storage.module';
import { ProjectFilesModule } from './modules/project-files/project-files.module';
import { SsoModule } from './modules/sso/sso.module';
import { CustomAgentsModule } from './modules/custom-agents/custom-agents.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { BillingModule } from './modules/billing/billing.module';
import { CustomRolesModule } from './modules/custom-roles/custom-roles.module';
import { IpAllowlistModule } from './modules/ip-allowlist/ip-allowlist.module';
import { GeoRestrictionModule } from './modules/geo-restriction/geo-restriction.module';
import { PermissionAuditModule } from './modules/permission-audit/permission-audit.module';
import { PermissionAnalyticsModule } from './modules/permission-analytics/permission-analytics.module';
import { SlackIntegrationModule } from './modules/integrations/slack/slack-integration.module';
import { DiscordIntegrationModule } from './modules/integrations/discord/discord-integration.module';
import { LinearIntegrationModule } from './modules/integrations/linear/linear-integration.module';
import { JiraIntegrationModule } from './modules/integrations/jira/jira-integration.module';
import { WhiteLabelModule } from './modules/white-label/white-label.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // Enable cron jobs for background tasks
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'devos',
      password: process.env.DATABASE_PASSWORD || 'devos_password',
      database: process.env.DATABASE_NAME || 'devos_db',
      autoLoadEntities: true,
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
    NotificationsModule,
    OrchestratorModule,
    MemoryModule,
    ContextModule,
    ModelRegistryModule,
    BenchmarkModule,
    ModelPreferencesModule,
    MetricsModule,
    LoggingModule,
    TracingModule,
    HealthModule,
    AdminModule,
    WebSocketSecurityModule,
    FileStorageModule,
    ProjectFilesModule,
    SsoModule,
    CustomAgentsModule,
    MarketplaceModule,
    BillingModule,
    CustomRolesModule,
    IpAllowlistModule,
    GeoRestrictionModule,
    PermissionAuditModule,
    PermissionAnalyticsModule,
    SlackIntegrationModule,
    DiscordIntegrationModule,
    LinearIntegrationModule,
    JiraIntegrationModule,
    WhiteLabelModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply WorkspaceContextInterceptor globally to extract workspace_id from JWT (Task 4.3)
    {
      provide: APP_INTERCEPTOR,
      useClass: WorkspaceContextInterceptor,
    },
    // Apply RequestLoggingInterceptor globally for structured request/response logging (Story 14.3)
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    // Apply TracingInterceptor globally for HTTP span enrichment (Story 14.4)
    {
      provide: APP_INTERCEPTOR,
      useClass: TracingInterceptor,
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
    // Apply CorrelationIdMiddleware first for trace ID propagation (Story 14.3)
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    // Apply WorkspaceContextMiddleware to all routes (Fix Issue #9)
    // Middleware will only activate when x-workspace-id header is present
    consumer.apply(WorkspaceContextMiddleware).forRoutes('*');
  }
}
