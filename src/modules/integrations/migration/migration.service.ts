import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IntegrationConnection,
  IntegrationProvider,
} from '../../../database/entities/integration-connection.entity';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

/**
 * Response DTO for deployment migration status.
 */
export interface DeploymentMigrationStatus {
  workspaceId: string;
  vercelConnected: boolean;
  supabaseConnected: boolean;
  railwayConnected: boolean;
  defaultDeploymentPlatform: string | null;
  migrationSteps: MigrationStep[];
  sunsetDate: string;
}

export interface MigrationStep {
  order: number;
  action: string;
  description: string;
  completed: boolean;
}

/**
 * MigrationService
 * Story 28.2: Supabase Deployment Deprecation
 *
 * Provides deployment migration status and guidance for workspaces
 * transitioning from Vercel/Supabase to Railway-only deployment.
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  // Sunset date: 90 days from 2026-03-01
  private readonly sunsetDate: string;

  constructor(
    @InjectRepository(IntegrationConnection)
    private readonly integrationConnectionRepository: Repository<IntegrationConnection>,
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepository: Repository<WorkspaceSettings>,
  ) {
    const sunset = new Date('2026-03-01');
    sunset.setDate(sunset.getDate() + 90);
    this.sunsetDate = sunset.toISOString();
  }

  /**
   * Get deployment migration status for a workspace.
   * Returns which platforms are connected and recommended migration steps.
   */
  async getDeploymentMigrationStatus(
    workspaceId: string,
  ): Promise<DeploymentMigrationStatus> {
    // Check integration connections
    const connections = await this.integrationConnectionRepository.find({
      where: { workspaceId },
    });

    const vercelConnected = connections.some(
      (c) => c.provider === IntegrationProvider.VERCEL && c.status === 'active',
    );
    const supabaseConnected = connections.some(
      (c) => c.provider === IntegrationProvider.SUPABASE && c.status === 'active',
    );
    const railwayConnected = connections.some(
      (c) => c.provider === IntegrationProvider.RAILWAY && c.status === 'active',
    );

    // Get workspace settings
    const settings = await this.workspaceSettingsRepository.findOne({
      where: { workspaceId },
    });
    const defaultPlatform = settings?.defaultDeploymentPlatform || null;

    // Build migration steps
    const migrationSteps: MigrationStep[] = [];
    let order = 1;

    if (!railwayConnected) {
      migrationSteps.push({
        order: order++,
        action: 'connect_railway',
        description: 'Connect your Railway account to this workspace',
        completed: false,
      });
    } else {
      migrationSteps.push({
        order: order++,
        action: 'connect_railway',
        description: 'Railway account connected',
        completed: true,
      });
    }

    if (defaultPlatform !== 'railway') {
      migrationSteps.push({
        order: order++,
        action: 'update_default_platform',
        description: 'Update default deployment platform to Railway',
        completed: false,
      });
    } else {
      migrationSteps.push({
        order: order++,
        action: 'update_default_platform',
        description: 'Default deployment platform is Railway',
        completed: true,
      });
    }

    if (supabaseConnected) {
      migrationSteps.push({
        order: order++,
        action: 'provision_railway_postgres',
        description: 'Provision PostgreSQL on Railway to replace Supabase databases',
        completed: false,
      });

      migrationSteps.push({
        order: order++,
        action: 'migrate_supabase_data',
        description: 'Migrate existing Supabase database data to Railway PostgreSQL',
        completed: false,
      });
    }

    if (vercelConnected) {
      migrationSteps.push({
        order: order++,
        action: 'deploy_on_railway',
        description: 'Deploy your frontend/API services on Railway instead of Vercel',
        completed: false,
      });

      migrationSteps.push({
        order: order++,
        action: 'update_domains',
        description: 'Update custom domains to point to Railway deployments',
        completed: false,
      });
    }

    if (vercelConnected || supabaseConnected) {
      migrationSteps.push({
        order: order++,
        action: 'disconnect_deprecated',
        description: `Disconnect deprecated ${[vercelConnected ? 'Vercel' : '', supabaseConnected ? 'Supabase' : ''].filter(Boolean).join(' and ')} integration(s) before sunset date`,
        completed: false,
      });
    }

    return {
      workspaceId,
      vercelConnected,
      supabaseConnected,
      railwayConnected,
      defaultDeploymentPlatform: defaultPlatform,
      migrationSteps,
      sunsetDate: this.sunsetDate,
    };
  }
}
