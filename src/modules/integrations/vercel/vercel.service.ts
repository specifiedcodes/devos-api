import {
  Injectable,
  Logger,
  ConflictException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  VercelProjectResponseDto,
  VercelDeploymentResponseDto,
  VercelDeploymentListResponseDto,
} from './dto/vercel.dto';

/**
 * VercelService
 * Story 6.6: Vercel Deployment Integration (Alternative)
 *
 * Manages Vercel REST API interactions for project creation,
 * deployment triggering, status polling, and environment variable management.
 */
@Injectable()
export class VercelService {
  private readonly logger = new Logger(VercelService.name);
  private readonly apiBaseUrl = 'https://api.vercel.com';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute a REST request against Vercel API
   */
  private async executeRequest<T>(
    token: string,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: any,
  ): Promise<T> {
    try {
      const url = `${this.apiBaseUrl}${path}`;
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      let response;
      if (method === 'get' || method === 'delete') {
        response = await firstValueFrom(
          this.httpService[method](url, config),
        );
      } else {
        response = await firstValueFrom(
          this.httpService[method](url, data, config),
        );
      }

      return response.data as T;
    } catch (error: any) {
      // Re-throw known exceptions
      if (
        error instanceof ConflictException ||
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      const status = error?.response?.status;
      const rawMessage =
        error?.response?.data?.error?.message ||
        'Unknown error';

      // Sanitize error message: strip any potential token/credential leaks
      const message = rawMessage.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');

      this.logger.error(
        `Vercel API request failed: status=${status}, message=${message}`,
      );

      if (status === 429) {
        throw new BadGatewayException(
          'Vercel API rate limit exceeded. Please try again later.',
        );
      }

      if (status === 404) {
        return null as T;
      }

      if (status === 409) {
        throw new ConflictException(
          'Vercel project with this name already exists',
        );
      }

      throw new BadGatewayException(`Vercel API error: ${message}`);
    }
  }

  /**
   * Map Vercel deployment status to DevOS status
   */
  private mapDeploymentStatus(vercelState: string): string {
    const statusMap: Record<string, string> = {
      BUILDING: 'building',
      INITIALIZING: 'building',
      QUEUED: 'queued',
      READY: 'success',
      ERROR: 'failed',
      CANCELED: 'canceled',
    };
    return statusMap[vercelState] || 'unknown';
  }

  /**
   * Create a Vercel project
   */
  async createProject(
    token: string,
    options: {
      name: string;
      framework?: string;
      buildCommand?: string;
      outputDirectory?: string;
      installCommand?: string;
      gitRepository?: { type: string; repo: string };
    },
  ): Promise<VercelProjectResponseDto> {
    this.logger.log(`Creating Vercel project: ${options.name}`);

    const body: Record<string, any> = {
      name: options.name,
    };

    if (options.framework) {
      body.framework = options.framework;
    }
    if (options.buildCommand) {
      body.buildCommand = options.buildCommand;
    }
    if (options.outputDirectory) {
      body.outputDirectory = options.outputDirectory;
    }
    if (options.installCommand) {
      body.installCommand = options.installCommand;
    }
    if (options.gitRepository) {
      body.gitRepository = options.gitRepository;
    }

    const result = await this.executeRequest<any>(
      token,
      'post',
      '/v9/projects',
      body,
    );

    const latestDeployment = result.latestDeployments?.[0];

    return {
      id: result.id,
      name: result.name,
      framework: result.framework || undefined,
      projectUrl: `https://vercel.com/~/projects/${result.name}`,
      latestDeploymentUrl: latestDeployment?.url
        ? `https://${latestDeployment.url}`
        : undefined,
      createdAt: result.createdAt
        ? new Date(result.createdAt).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Trigger a deployment on Vercel
   */
  async triggerDeployment(
    token: string,
    options: {
      projectId: string;
      name: string;
      target?: string;
      ref?: string;
      gitSource?: { type: string; ref: string; repoId: string };
    },
  ): Promise<VercelDeploymentResponseDto> {
    this.logger.log(
      `Triggering deployment for Vercel project ${options.projectId}`,
    );

    const body: Record<string, any> = {
      name: options.name,
      project: options.projectId,
      target: options.target || 'production',
    };

    if (options.gitSource) {
      body.gitSource = options.gitSource;
    }

    const result = await this.executeRequest<any>(
      token,
      'post',
      '/v13/deployments',
      body,
    );

    return {
      id: result.id,
      status: this.mapDeploymentStatus(result.readyState || 'BUILDING'),
      projectId: options.projectId,
      url: result.url || undefined,
      target: options.target || 'production',
      ref: options.ref || 'main',
      readyState: result.readyState || 'BUILDING',
      createdAt: result.createdAt
        ? new Date(result.createdAt).toISOString()
        : new Date().toISOString(),
      readyAt: result.ready
        ? new Date(result.ready).toISOString()
        : undefined,
      meta: result.meta || undefined,
    };
  }

  /**
   * Get deployment details
   * Returns null for not-found errors
   */
  async getDeployment(
    token: string,
    deploymentId: string,
  ): Promise<VercelDeploymentResponseDto | null> {
    this.logger.log(`Getting Vercel deployment: ${deploymentId}`);

    const result = await this.executeRequest<any>(
      token,
      'get',
      `/v13/deployments/${deploymentId}`,
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      status: this.mapDeploymentStatus(result.readyState),
      projectId: result.projectId,
      url: result.url || undefined,
      target: result.target || undefined,
      ref: result.meta?.githubCommitRef || undefined,
      readyState: result.readyState,
      createdAt: result.createdAt
        ? new Date(result.createdAt).toISOString()
        : new Date().toISOString(),
      readyAt: result.ready
        ? new Date(result.ready).toISOString()
        : undefined,
      meta: result.meta || undefined,
    };
  }

  /**
   * List deployments for a Vercel project
   */
  async listDeployments(
    token: string,
    projectId: string,
    options?: {
      target?: string;
      state?: string;
      limit?: number;
      since?: number;
    },
  ): Promise<VercelDeploymentListResponseDto> {
    this.logger.log(`Listing deployments for Vercel project: ${projectId}`);

    const params = new URLSearchParams();
    params.append('projectId', projectId);
    params.append('limit', String(options?.limit || 10));

    if (options?.target) {
      params.append('target', options.target);
    }
    if (options?.state) {
      params.append('state', options.state);
    }
    if (options?.since) {
      params.append('since', String(options.since));
    }

    const result = await this.executeRequest<any>(
      token,
      'get',
      `/v6/deployments?${params.toString()}`,
    );

    const deployments = (result?.deployments || []).map((dep: any) => ({
      id: dep.uid || dep.id,
      status: this.mapDeploymentStatus(dep.readyState || dep.state),
      projectId,
      url: dep.url || undefined,
      target: dep.target || undefined,
      ref: dep.meta?.githubCommitRef || undefined,
      createdAt: dep.createdAt
        ? new Date(dep.createdAt).toISOString()
        : dep.created
          ? new Date(dep.created).toISOString()
          : new Date().toISOString(),
    }));

    return {
      deployments,
      total: result?.pagination?.count || deployments.length,
    };
  }

  /**
   * Redeploy a specific Vercel deployment (used for rollback)
   * Story 6.10: Deployment Rollback
   *
   * Vercel doesn't have a native "rollback" API. Instead, we create
   * a new deployment referencing the target deployment's ID.
   */
  async redeployDeployment(
    token: string,
    deploymentId: string,
    projectName: string,
    target?: string,
  ): Promise<VercelDeploymentResponseDto> {
    this.logger.log(`Redeploying Vercel deployment: ${deploymentId}`);

    const body = {
      name: projectName,
      target: target || 'production',
      deploymentId,
    };

    const result = await this.executeRequest<any>(
      token,
      'post',
      '/v13/deployments',
      body,
    );

    if (!result) {
      throw new BadGatewayException(
        `Vercel redeployment failed: no response for deployment ${deploymentId}`,
      );
    }

    return {
      id: result.id,
      status: this.mapDeploymentStatus(result.readyState || 'BUILDING'),
      projectId: result.projectId,
      url: result.url || undefined,
      target: target || 'production',
      readyState: result.readyState || 'BUILDING',
      createdAt: result.createdAt
        ? new Date(result.createdAt).toISOString()
        : new Date().toISOString(),
      readyAt: result.ready
        ? new Date(result.ready).toISOString()
        : undefined,
      meta: result.meta || undefined,
    };
  }

  /**
   * Upsert environment variables for a Vercel project
   */
  async upsertEnvironmentVariables(
    token: string,
    projectId: string,
    variables: Array<{
      key: string;
      value: string;
      target?: string[];
      type?: string;
    }>,
  ): Promise<void> {
    this.logger.log(
      `Upserting ${variables.length} env vars for Vercel project ${projectId}`,
    );

    // Vercel supports batch create via POST /v10/projects/{projectId}/env
    // SECURITY: Variable values may contain secrets - errors must not leak values
    try {
      await this.executeRequest(
        token,
        'post',
        `/v10/projects/${projectId}/env`,
        variables.map((v) => ({
          key: v.key,
          value: v.value,
          target: v.target || ['production', 'preview', 'development'],
          type: v.type || 'encrypted',
        })),
      );
    } catch (error) {
      // Re-throw with sanitized message (strip any leaked variable values)
      const variableKeys = variables.map((v) => v.key).join(', ');
      this.logger.error(
        `Failed to upsert env vars [${variableKeys}] for Vercel project ${projectId}`,
      );
      throw error;
    }

    this.logger.log(
      `Environment variables upserted for Vercel project ${projectId}`,
    );
  }
}
