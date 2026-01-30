import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './modules/redis/redis.module';
import { EncryptionModule } from './shared/encryption/encryption.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { User } from './database/entities/user.entity';
import { Workspace } from './database/entities/workspace.entity';
import { WorkspaceMember } from './database/entities/workspace-member.entity';
import { BackupCode } from './database/entities/backup-code.entity';
import { AccountDeletion } from './database/entities/account-deletion.entity';
import { SecurityEvent } from './database/entities/security-event.entity';
import { Project } from './database/entities/project.entity';
import { ProjectPreferences } from './database/entities/project-preferences.entity';
import { WorkspaceInvitation } from './database/entities/workspace-invitation.entity';
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
      ],
      synchronize: false, // Always false - use migrations
      logging: process.env.NODE_ENV === 'development',
      poolSize: 100, // Max 100 connections per AC
    }),
    DatabaseModule,
    RedisModule,
    EncryptionModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
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
