import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RailwayService } from '../railway/railway.service';
import { VercelService } from '../vercel/vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { DeploymentResponseDto } from '../railway/dto/railway.dto';
import { VercelDeploymentResponseDto } from '../vercel/dto/vercel.dto';
import {
  UnifiedDeploymentDto,
  UnifiedDeploymentListResponseDto,
  ActiveDeploymentsResponseDto,
  ActiveDeploymentDto,
  DeploymentSummaryResponseDto,
  PlatformDeploymentBreakdownDto,
} from './dto/deployment-monitoring.dto';

/**
 * Railway status -> normalized status map
 * Story 6.8: Deployment Status Monitoring
 */
const RAILWAY_STATUS_MAP: Record<string, string> = {
  building: 'building',
  deploying: 'deploying',
  success: 'success',
  failed: 'failed',
  crashed: 'crashed',
  removed: 'removed',
  queued: 'queued',
  waiting: 'building',
  unknown: 'unknown',
};

/**
 * Vercel status -> normalized status map
 * Story 6.8: Deployment Status Monitoring
 */
const VERCEL_STATUS_MAP: Record<string, string> = {
  building: 'building',
  queued: 'queued',
  success: 'success',
  failed: 'failed',
  canceled: 'canceled',
  unknown: 'unknown',
};

/**
 * Terminal statuses (deployments that are finished)
 */
const TERMINAL_STATUSES = new Set([
  'success',
  'failed',
  'crashed',
  'canceled',
  'removed',
]);

/**
 * DeploymentMonitoringService
 * Story 6.8: Deployment Status Monitoring
 *
 * Provides unified deployment monitoring by aggregating data from
 * Railway and Vercel services. Supports listing, detail, active
 * deployment polling, and deployment summary statistics.
 */
@Injectable()
export class DeploymentMonitoringService {
  private readonly logger = new Logger(DeploymentMonitoringService.name);

  constructor(
    private readonly railwayService: RailwayService,
    private readonly vercelService: VercelService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get platform context: project and tokens for Railway/Vercel
   * Tokens are null if integration not connected (graceful degradation)
   */
  private async getPlatformContext(
    workspaceId: string,
    projectId: string,
  ): Promise<{
    project: Project;
    railwayToken: string | null;
    vercelToken: string | null;
  }> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    const railwayToken = await this.tryGetToken(
      workspaceId,
      IntegrationProvider.RAILWAY,
    );
    const vercelToken = await this.tryGetToken(
      workspaceId,
      IntegrationProvider.VERCEL,
    );

    return { project, railwayToken, vercelToken };
  }

  /**
   * Gracefully try to get a platform token
   * Returns null if integration not connected
   */
  private async tryGetToken(
    workspaceId: string,
    provider: IntegrationProvider,
  ): Promise<string | null> {
    try {
      return await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        provider,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null; // Integration not connected
      }
      this.logger.warn(
        `Failed to get ${provider} token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Normalize a Railway deployment to unified format
   */
  normalizeRailwayDeployment(
    deployment: DeploymentResponseDto,
  ): UnifiedDeploymentDto {
    const normalizedStatus =
      RAILWAY_STATUS_MAP[deployment.status] || 'unknown';
    const startedAt = deployment.createdAt;
    const completedAt = this.isTerminalStatus(normalizedStatus)
      ? deployment.updatedAt
      : undefined;
    const duration = this.calculateDuration(startedAt, completedAt);

    return {
      id: deployment.id,
      platform: 'railway',
      status: deployment.status,
      normalizedStatus,
      branch: deployment.branch,
      commitSha: deployment.commitSha,
      deploymentUrl: deployment.deploymentUrl,
      startedAt,
      completedAt,
      duration,
      logs: null,
      meta: deployment.meta || {},
    };
  }

  /**
   * Normalize a Vercel deployment to unified format
   * Note: VercelService.listDeployments() does NOT include readyAt in its
   * response objects (only getDeployment() does), so completedAt/duration
   * may be null for deployments fetched via the list endpoint.
   */
  normalizeVercelDeployment(
    deployment: VercelDeploymentResponseDto,
  ): UnifiedDeploymentDto {
    const normalizedStatus =
      VERCEL_STATUS_MAP[deployment.status] || 'unknown';
    const startedAt = deployment.createdAt;
    // readyAt is only available from getDeployment(), not listDeployments()
    const completedAt =
      this.isTerminalStatus(normalizedStatus) && deployment.readyAt
        ? deployment.readyAt
        : undefined;
    const duration = this.calculateDuration(startedAt, completedAt);

    return {
      id: deployment.id,
      platform: 'vercel',
      status: deployment.status,
      normalizedStatus,
      branch: deployment.ref,
      commitSha: undefined,
      deploymentUrl: deployment.url
        ? `https://${deployment.url}`
        : undefined,
      startedAt,
      completedAt,
      duration,
      logs: null,
      meta: deployment.meta || {},
    };
  }

  /**
   * Check if a normalized status is terminal (deployment finished)
   */
  isTerminalStatus(normalizedStatus: string): boolean {
    return TERMINAL_STATUSES.has(normalizedStatus);
  }

  /**
   * Calculate duration in seconds between two timestamps
   * Returns null if completedAt is not provided or timestamps are invalid
   */
  calculateDuration(
    startedAt: string,
    completedAt?: string,
  ): number | null {
    if (!completedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 1000);
  }

  /**
   * Get unified deployment list from Railway and Vercel
   * Merges, sorts, filters, and paginates results
   */
  async getUnifiedDeployments(
    workspaceId: string,
    projectId: string,
    options: {
      platform?: string;
      status?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<UnifiedDeploymentListResponseDto> {
    const { project, railwayToken, vercelToken } =
      await this.getPlatformContext(workspaceId, projectId);

    const platform = options.platform || 'all';
    const page = options.page || 1;
    const perPage = options.perPage || 10;

    // Fetch enough from each platform to cover the requested page after merge/sort.
    // We need (page * perPage) items total, so fetch at least that from each platform
    // to ensure we have enough data after merging and sorting.
    const fetchLimit = Math.min(page * perPage, 100);

    let allDeployments: UnifiedDeploymentDto[] = [];

    const railwayConnected = !!railwayToken;
    const vercelConnected = !!vercelToken;
    const railwayLinked = !!project.railwayProjectId;
    const vercelLinked = !!project.vercelProjectId;

    // Fetch Railway deployments
    if (
      (platform === 'all' || platform === 'railway') &&
      railwayConnected &&
      railwayLinked
    ) {
      try {
        const railwayResult = await this.railwayService.listDeployments(
          railwayToken!,
          project.railwayProjectId!,
          { first: fetchLimit },
        );
        const normalized = railwayResult.deployments.map((d) =>
          this.normalizeRailwayDeployment(d),
        );
        allDeployments = allDeployments.concat(normalized);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Railway deployments: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fetch Vercel deployments
    if (
      (platform === 'all' || platform === 'vercel') &&
      vercelConnected &&
      vercelLinked
    ) {
      try {
        const vercelResult = await this.vercelService.listDeployments(
          vercelToken!,
          project.vercelProjectId!,
          { limit: fetchLimit },
        );
        const normalized = vercelResult.deployments.map((d) =>
          this.normalizeVercelDeployment(d),
        );
        allDeployments = allDeployments.concat(normalized);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Vercel deployments: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Sort by startedAt descending
    allDeployments.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

    // Apply status filter
    let filteredDeployments = allDeployments;
    if (options.status) {
      filteredDeployments = allDeployments.filter(
        (d) => d.normalizedStatus === options.status,
      );
    }

    // Apply pagination
    const total = filteredDeployments.length;
    const startIndex = (page - 1) * perPage;
    const paginatedDeployments = filteredDeployments.slice(
      startIndex,
      startIndex + perPage,
    );

    return {
      deployments: paginatedDeployments,
      total,
      page,
      perPage,
      platforms: {
        railway: {
          connected: railwayConnected,
          projectLinked: railwayLinked,
        },
        vercel: {
          connected: vercelConnected,
          projectLinked: vercelLinked,
        },
      },
    };
  }

  /**
   * Get deployment detail from the specified platform
   * Returns null if deployment not found
   */
  async getDeploymentDetail(
    workspaceId: string,
    projectId: string,
    deploymentId: string,
    platform: string,
  ): Promise<UnifiedDeploymentDto | null> {
    if (platform !== 'railway' && platform !== 'vercel') {
      throw new BadRequestException(
        `Invalid platform: ${platform}. Must be "railway" or "vercel"`,
      );
    }

    const { project, railwayToken, vercelToken } =
      await this.getPlatformContext(workspaceId, projectId);

    if (platform === 'railway') {
      if (!railwayToken) {
        throw new BadRequestException(
          'Railway integration not connected for this workspace',
        );
      }

      const deployment = await this.railwayService.getDeployment(
        railwayToken,
        deploymentId,
      );

      if (!deployment) return null;
      return this.normalizeRailwayDeployment(deployment);
    }

    if (platform === 'vercel') {
      if (!vercelToken) {
        throw new BadRequestException(
          'Vercel integration not connected for this workspace',
        );
      }

      const deployment = await this.vercelService.getDeployment(
        vercelToken,
        deploymentId,
      );

      if (!deployment) return null;
      return this.normalizeVercelDeployment(deployment);
    }

    return null;
  }

  /**
   * Get active (in-progress) deployments across all platforms
   * Used for polling-based real-time updates
   */
  async getActiveDeployments(
    workspaceId: string,
    projectId: string,
  ): Promise<ActiveDeploymentsResponseDto> {
    const { project, railwayToken, vercelToken } =
      await this.getPlatformContext(workspaceId, projectId);

    let allDeployments: UnifiedDeploymentDto[] = [];

    // Fetch recent Railway deployments
    if (railwayToken && project.railwayProjectId) {
      try {
        const railwayResult = await this.railwayService.listDeployments(
          railwayToken,
          project.railwayProjectId,
          { first: 5 },
        );
        const normalized = railwayResult.deployments.map((d) =>
          this.normalizeRailwayDeployment(d),
        );
        allDeployments = allDeployments.concat(normalized);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Railway deployments for active check: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fetch recent Vercel deployments
    if (vercelToken && project.vercelProjectId) {
      try {
        const vercelResult = await this.vercelService.listDeployments(
          vercelToken,
          project.vercelProjectId,
          { limit: 5 },
        );
        const normalized = vercelResult.deployments.map((d) =>
          this.normalizeVercelDeployment(d),
        );
        allDeployments = allDeployments.concat(normalized);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Vercel deployments for active check: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Filter for non-terminal statuses
    const now = new Date();
    const activeDeployments: ActiveDeploymentDto[] = allDeployments
      .filter((d) => !this.isTerminalStatus(d.normalizedStatus))
      .map((d) => ({
        id: d.id,
        platform: d.platform,
        status: d.status,
        normalizedStatus: d.normalizedStatus,
        branch: d.branch,
        startedAt: d.startedAt,
        elapsedSeconds: Math.max(
          0,
          Math.round(
            (now.getTime() - new Date(d.startedAt).getTime()) / 1000,
          ),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );

    return {
      activeDeployments,
      hasActiveDeployments: activeDeployments.length > 0,
      pollingIntervalMs: 10000,
    };
  }

  /**
   * Get deployment summary statistics for the project dashboard
   */
  async getDeploymentSummary(
    workspaceId: string,
    projectId: string,
  ): Promise<DeploymentSummaryResponseDto> {
    const { project, railwayToken, vercelToken } =
      await this.getPlatformContext(workspaceId, projectId);

    let railwayDeployments: UnifiedDeploymentDto[] = [];
    let vercelDeployments: UnifiedDeploymentDto[] = [];

    // Fetch Railway deployments (limit 20)
    if (railwayToken && project.railwayProjectId) {
      try {
        const railwayResult = await this.railwayService.listDeployments(
          railwayToken,
          project.railwayProjectId,
          { first: 20 },
        );
        railwayDeployments = railwayResult.deployments.map((d) =>
          this.normalizeRailwayDeployment(d),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Railway deployments for summary: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fetch Vercel deployments (limit 20)
    if (vercelToken && project.vercelProjectId) {
      try {
        const vercelResult = await this.vercelService.listDeployments(
          vercelToken,
          project.vercelProjectId,
          { limit: 20 },
        );
        vercelDeployments = vercelResult.deployments.map((d) =>
          this.normalizeVercelDeployment(d),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Vercel deployments for summary: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const allDeployments = [
      ...railwayDeployments,
      ...vercelDeployments,
    ];

    // Calculate counts
    // Note: 'removed' is a terminal status but is not counted as success/failed/canceled;
    // it is included in totalDeployments and completedCount for accurate success rate calculation.
    const totalDeployments = allDeployments.length;
    const successCount = allDeployments.filter(
      (d) => d.normalizedStatus === 'success',
    ).length;
    const failedCount = allDeployments.filter(
      (d) =>
        d.normalizedStatus === 'failed' || d.normalizedStatus === 'crashed',
    ).length;
    const inProgressCount = allDeployments.filter(
      (d) => !this.isTerminalStatus(d.normalizedStatus),
    ).length;
    const canceledCount = allDeployments.filter(
      (d) =>
        d.normalizedStatus === 'canceled' ||
        d.normalizedStatus === 'removed',
    ).length;

    // Calculate success rate
    const completedCount = totalDeployments - inProgressCount;
    const successRate =
      completedCount > 0
        ? parseFloat(((successCount / completedCount) * 100).toFixed(2))
        : 0;

    // Calculate average duration of completed deployments
    const durationsInSeconds = allDeployments
      .filter((d) => d.duration != null && d.duration > 0)
      .map((d) => d.duration as number);
    const averageDurationSeconds =
      durationsInSeconds.length > 0
        ? Math.round(
            durationsInSeconds.reduce((a, b) => a + b, 0) /
              durationsInSeconds.length,
          )
        : null;

    // Find last deployment (most recent by startedAt)
    const sortedByDate = [...allDeployments].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    const lastDeployment =
      sortedByDate.length > 0 ? sortedByDate[0] : null;

    // Build platform breakdown
    const buildBreakdown = (
      deployments: UnifiedDeploymentDto[],
    ): PlatformDeploymentBreakdownDto => ({
      total: deployments.length,
      success: deployments.filter((d) => d.normalizedStatus === 'success')
        .length,
      failed: deployments.filter(
        (d) =>
          d.normalizedStatus === 'failed' ||
          d.normalizedStatus === 'crashed',
      ).length,
      inProgress: deployments.filter(
        (d) => !this.isTerminalStatus(d.normalizedStatus),
      ).length,
    });

    return {
      totalDeployments,
      successCount,
      failedCount,
      inProgressCount,
      canceledCount,
      successRate,
      averageDurationSeconds,
      lastDeployment,
      platformBreakdown: {
        railway: buildBreakdown(railwayDeployments),
        vercel: buildBreakdown(vercelDeployments),
      },
    };
  }
}
