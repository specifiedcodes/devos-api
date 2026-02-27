import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { IntegrationConnection } from '../../database/entities/integration-connection.entity';
import { Project } from '../../database/entities/project.entity';
import { IntegrationConnectionService } from './integration-connection.service';
import {
  IntegrationController,
  IntegrationCallbackController,
} from './integration.controller';
import { GitHubService } from './github/github.service';
import { GitHubRepoController } from './github/github-repo.controller';
import { GitHubBranchController } from './github/github-branch.controller';
import { GitHubPullRequestController } from './github/github-pr.controller';
import { RailwayService } from './railway/railway.service';
import { RailwayController } from './railway/railway.controller';
import { VercelService } from './vercel/vercel.service';
import { VercelController } from './vercel/vercel.controller';
import { SupabaseService } from './supabase/supabase.service';
import { SupabaseController } from './supabase/supabase.controller';
import { DeploymentMonitoringService } from './deployment-monitoring/deployment-monitoring.service';
import { DeploymentMonitoringController } from './deployment-monitoring/deployment-monitoring.controller';
import { DeploymentApprovalService } from './deployment-approval/deployment-approval.service';
import { DeploymentApprovalController } from './deployment-approval/deployment-approval.controller';
import { DeploymentRollbackService } from './deployment-rollback/deployment-rollback.service';
import { DeploymentRollbackController } from './deployment-rollback/deployment-rollback.controller';
import { DeploymentApproval } from '../../database/entities/deployment-approval.entity';
import { DeploymentRollback } from '../../database/entities/deployment-rollback.entity';
import { ProjectPreferences } from '../../database/entities/project-preferences.entity';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { NotificationModule } from '../notification/notification.module';
// Story 21-7: Integration Management aggregation
import { IntegrationManagementService } from './services/integration-management.service';
import { IntegrationManagementController } from './services/integration-management.controller';
import { SlackIntegration } from '../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../database/entities/jira-integration.entity';
import { LinearSyncItem } from '../../database/entities/linear-sync-item.entity';
import { JiraSyncItem } from '../../database/entities/jira-sync-item.entity';
// Story 21-8: Webhook Management
import { WebhookModule } from './webhooks/webhook.module';
import { OutgoingWebhook } from '../../database/entities/outgoing-webhook.entity';

/**
 * IntegrationsModule
 * Story 6.1: GitHub OAuth Integration Setup
 * Story 6.2: GitHub Repository Creation (added GitHubRepoController, Project entity)
 * Story 6.3: GitHub Branch Management (added GitHubBranchController)
 * Story 6.4: GitHub Pull Request Creation (added GitHubPullRequestController, NotificationModule)
 * Story 6.5: Railway Deployment Integration (added RailwayService, RailwayController)
 * Story 6.6: Vercel Deployment Integration (added VercelService, VercelController)
 * Story 6.7: Supabase Database Provisioning (added SupabaseService, SupabaseController)
 * Story 6.8: Deployment Status Monitoring (added DeploymentMonitoringService, DeploymentMonitoringController)
 * Story 6.9: Manual Deployment Approval (added DeploymentApprovalService, DeploymentApprovalController, DeploymentApproval, ProjectPreferences)
 * Story 6.10: Deployment Rollback (added DeploymentRollbackService, DeploymentRollbackController, DeploymentRollback)
 *
 * Comprehensive integrations module replacing GitHubModule.
 * Provides OAuth management, encrypted token storage, integration CRUD,
 * GitHub repository creation/linking, Railway deployment integration,
 * Vercel deployment integration, and Supabase database provisioning.
 *
 * Dependencies (globally available):
 * - EncryptionModule (Global) - For workspace-scoped token encryption
 * - AuditModule (Global) - For audit logging
 * - RedisModule (Global) - For CSRF state storage
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegrationConnection,
      Project,
      DeploymentApproval,
      DeploymentRollback,
      ProjectPreferences,
      // Story 21-7: Integration Management aggregation
      SlackIntegration,
      DiscordIntegration,
      LinearIntegration,
      JiraIntegration,
      LinearSyncItem,
      JiraSyncItem,
      OutgoingWebhook, // Story 21-8: Webhook Management
    ]),
    HttpModule.register({
      timeout: 15000, // 15 second timeout for external API calls (GitHub, Railway, Vercel)
      maxRedirects: 5,
    }),
    OnboardingModule,
    NotificationModule,
    WebhookModule, // Story 21-8: Webhook Management
  ],
  controllers: [
    IntegrationController,
    IntegrationCallbackController,
    GitHubRepoController,
    GitHubBranchController,
    GitHubPullRequestController,
    RailwayController,
    VercelController,
    SupabaseController,
    DeploymentMonitoringController,
    DeploymentApprovalController,
    DeploymentRollbackController,
    IntegrationManagementController, // Story 21-7
  ],
  providers: [IntegrationConnectionService, GitHubService, RailwayService, VercelService, SupabaseService, DeploymentMonitoringService, DeploymentApprovalService, DeploymentRollbackService, IntegrationManagementService],
  exports: [IntegrationConnectionService, GitHubService, RailwayService, VercelService, SupabaseService, DeploymentMonitoringService, DeploymentApprovalService, DeploymentRollbackService, IntegrationManagementService],
})
export class IntegrationsModule {}
