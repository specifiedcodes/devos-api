/**
 * DevOpsDeploymentTriggerService
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Detects the deployment platform from project settings and triggers
 * deployments via Railway (Story 6.5) or Vercel (Story 6.6).
 */
import { Injectable, Logger } from '@nestjs/common';
import { RailwayService } from '../../integrations/railway/railway.service';
import { VercelService } from '../../integrations/vercel/vercel.service';
import { IntegrationConnectionService } from '../../integrations/integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { DevOpsDeploymentTriggerResult } from '../interfaces/devops-agent-execution.interfaces';

@Injectable()
export class DevOpsDeploymentTriggerService {
  private readonly logger = new Logger(DevOpsDeploymentTriggerService.name);

  constructor(
    private readonly railwayService: RailwayService,
    private readonly vercelService: VercelService,
    private readonly integrationConnectionService: IntegrationConnectionService,
  ) {}

  /**
   * Detect the deployment platform from project settings.
   * Returns 'railway', 'vercel', or null if no platform configured.
   */
  async detectPlatform(params: {
    workspaceId: string;
    projectId: string;
    preferredPlatform: 'railway' | 'vercel' | 'auto';
  }): Promise<'railway' | 'vercel' | null> {
    if (params.preferredPlatform === 'railway') {
      return 'railway';
    }

    if (params.preferredPlatform === 'vercel') {
      return 'vercel';
    }

    // Auto-detect: check for active connections, Railway first
    this.logger.log(
      `Auto-detecting deployment platform for workspace ${params.workspaceId}`,
    );

    try {
      await this.integrationConnectionService.getDecryptedToken(
        params.workspaceId,
        IntegrationProvider.RAILWAY,
      );
      this.logger.log('Railway connection detected');
      return 'railway';
    } catch {
      // Railway not connected, try Vercel
    }

    try {
      await this.integrationConnectionService.getDecryptedToken(
        params.workspaceId,
        IntegrationProvider.VERCEL,
      );
      this.logger.log('Vercel connection detected');
      return 'vercel';
    } catch {
      // Vercel not connected either
    }

    this.logger.warn(
      `No deployment platform configured for workspace ${params.workspaceId}`,
    );
    return null;
  }

  /**
   * Trigger deployment on the detected platform.
   * Uses RailwayService (Story 6.5) or VercelService (Story 6.6).
   */
  async triggerDeployment(params: {
    platform: 'railway' | 'vercel';
    workspaceId: string;
    projectId: string;
    environment: string;
    commitHash: string;
    githubToken: string;
    repoOwner: string;
    repoName: string;
  }): Promise<DevOpsDeploymentTriggerResult> {
    this.logger.log(
      `Triggering ${params.platform} deployment for project ${params.projectId}`,
    );

    try {
      const token = await this.integrationConnectionService.getDecryptedToken(
        params.workspaceId,
        params.platform === 'railway'
          ? IntegrationProvider.RAILWAY
          : IntegrationProvider.VERCEL,
      );

      if (params.platform === 'railway') {
        return await this.triggerRailwayDeployment(token, params);
      }

      return await this.triggerVercelDeployment(token, params);
    } catch (error: any) {
      const errorMessage =
        error?.message || 'Unknown deployment trigger error';

      this.logger.error(
        `Failed to trigger ${params.platform} deployment: ${errorMessage}`,
      );

      return {
        success: false,
        deploymentId: null,
        deploymentUrl: null,
        platform: params.platform,
        error: errorMessage,
      };
    }
  }

  /**
   * Trigger Railway deployment via RailwayService.
   */
  private async triggerRailwayDeployment(
    token: string,
    params: {
      projectId: string;
      environment: string;
      commitHash: string;
    },
  ): Promise<DevOpsDeploymentTriggerResult> {
    // Note: Railway API deploys from branch HEAD, commitHash is not directly supported.
    // The merge to main (done in prior step) ensures the correct commit is at HEAD.
    const result = await this.railwayService.triggerDeployment(token, {
      projectId: params.projectId,
      branch: 'main',
    });

    return {
      success: true,
      deploymentId: result.id,
      deploymentUrl: result.deploymentUrl || null,
      platform: 'railway',
      error: null,
    };
  }

  /**
   * Trigger Vercel deployment via VercelService.
   */
  private async triggerVercelDeployment(
    token: string,
    params: {
      projectId: string;
      repoOwner: string;
      repoName: string;
      environment: string;
      commitHash: string;
    },
  ): Promise<DevOpsDeploymentTriggerResult> {
    const result = await this.vercelService.triggerDeployment(token, {
      projectId: params.projectId,
      name: params.repoName,
      target: params.environment === 'production' ? 'production' : 'preview',
      ref: params.commitHash,
    });

    return {
      success: true,
      deploymentId: result.id,
      deploymentUrl: result.url ? `https://${result.url}` : null,
      platform: 'vercel',
      error: null,
    };
  }
}
