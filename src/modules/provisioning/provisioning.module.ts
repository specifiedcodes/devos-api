import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ProvisioningStatus } from '../../database/entities/provisioning-status.entity';
import { Project } from '../../database/entities/project.entity';
import { ProvisioningStatusService } from './services/provisioning-status.service';
import { ProvisioningOrchestratorService } from './services/provisioning-orchestrator.service';
import { ProvisioningController } from './controllers/provisioning.controller';
import { ProjectWorkspaceAccessGuard } from '../../shared/guards/project-workspace-access.guard';
import { IntegrationsModule } from '../integrations/integrations.module';

/**
 * ProvisioningModule
 *
 * Manages multi-step resource provisioning during project creation
 * - Tracks GitHub repo creation, database provisioning, deployment setup, project initialization
 * - Provides REST API for status tracking
 * - Orchestrates async provisioning workflow
 *
 * Part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 * Updated in Story 6.2: GitHub Repository Creation (imports IntegrationsModule)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProvisioningStatus, Project]),
    ConfigModule, // For ServiceAuthGuard
    IntegrationsModule, // Story 6.2: Provides GitHubService and IntegrationConnectionService
  ],
  controllers: [ProvisioningController],
  providers: [
    ProvisioningStatusService,
    ProvisioningOrchestratorService,
    ProjectWorkspaceAccessGuard,
  ],
  exports: [
    ProvisioningStatusService,
    ProvisioningOrchestratorService,
  ],
})
export class ProvisioningModule {}
