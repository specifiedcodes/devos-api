import {
  Injectable,
  Logger,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  RailwayProjectResponseDto,
  DeploymentResponseDto,
  DeploymentListResponseDto,
} from './dto/railway.dto';

/**
 * RailwayService
 * Story 6.5: Railway Deployment Integration
 *
 * Manages Railway GraphQL API interactions for project creation,
 * deployment triggering, status polling, and environment variable management.
 */
@Injectable()
export class RailwayService {
  private readonly logger = new Logger(RailwayService.name);
  private readonly graphqlEndpoint =
    'https://backboard.railway.app/graphql/v2';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute a GraphQL query/mutation against Railway API
   */
  private async executeGraphQL<T>(
    token: string,
    query: string,
    variables?: Record<string, any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.graphqlEndpoint,
          { query, variables },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const data = response.data;

      if (data.errors && data.errors.length > 0) {
        const errorMessage = data.errors
          .map((e: any) => e.message)
          .join('; ');
        this.logger.error(`Railway GraphQL errors: ${errorMessage}`);

        // Check for specific error patterns
        if (
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.toLowerCase().includes('conflict')
        ) {
          throw new ConflictException(
            'Railway project with this name already exists',
          );
        }

        throw new BadGatewayException(`Railway API error: ${errorMessage}`);
      }

      return data.data as T;
    } catch (error: any) {
      // Re-throw known exceptions
      if (
        error instanceof ConflictException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      const status = error?.response?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `Railway API request failed: status=${status}, message=${message}`,
      );

      if (status === 429) {
        throw new BadGatewayException(
          'Railway API rate limit exceeded. Please try again later.',
        );
      }

      throw new BadGatewayException(`Railway API error: ${message}`);
    }
  }

  /**
   * Map Railway deployment status to DevOS status
   */
  private mapDeploymentStatus(railwayStatus: string): string {
    const statusMap: Record<string, string> = {
      BUILDING: 'building',
      DEPLOYING: 'deploying',
      SUCCESS: 'success',
      FAILED: 'failed',
      CRASHED: 'crashed',
      REMOVED: 'removed',
      QUEUED: 'queued',
      WAITING: 'waiting',
    };
    return statusMap[railwayStatus] || 'unknown';
  }

  /**
   * Create a Railway project
   */
  async createProject(
    token: string,
    options: { name: string; description?: string },
  ): Promise<RailwayProjectResponseDto> {
    this.logger.log(`Creating Railway project: ${options.name}`);

    const mutation = `
      mutation projectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
          description
          createdAt
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      projectCreate: any;
    }>(token, mutation, {
      input: { name: options.name, description: options.description },
    });

    const project = result.projectCreate;
    const environments = (project.environments?.edges || []).map(
      (edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
      }),
    );

    return {
      id: project.id,
      name: project.name,
      description: project.description || undefined,
      projectUrl: `https://railway.app/project/${project.id}`,
      environments,
      createdAt: project.createdAt,
    };
  }

  /**
   * Link a GitHub repository to a Railway project
   * Non-critical: logs warning on failure, does not throw
   */
  async linkGitHubRepoToProject(
    token: string,
    railwayProjectId: string,
    githubRepoFullName: string,
  ): Promise<void> {
    this.logger.log(
      `Linking GitHub repo ${githubRepoFullName} to Railway project ${railwayProjectId}`,
    );

    try {
      const mutation = `
        mutation serviceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `;

      await this.executeGraphQL(token, mutation, {
        input: {
          projectId: railwayProjectId,
          source: { repo: githubRepoFullName },
        },
      });

      this.logger.log(
        `GitHub repo ${githubRepoFullName} linked to Railway project ${railwayProjectId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to link GitHub repo to Railway project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Trigger a deployment on Railway
   */
  async triggerDeployment(
    token: string,
    options: {
      projectId: string;
      environmentId?: string;
      branch?: string;
    },
  ): Promise<DeploymentResponseDto> {
    this.logger.log(
      `Triggering deployment for Railway project ${options.projectId}`,
    );

    const mutation = `
      mutation deploymentTriggerCreate($input: DeploymentTriggerInput!) {
        deploymentTriggerCreate(input: $input) {
          id
          status
          meta
          createdAt
          updatedAt
          environmentId
        }
      }
    `;

    const input: Record<string, any> = {
      projectId: options.projectId,
    };
    if (options.environmentId) {
      input.environmentId = options.environmentId;
    }
    if (options.branch) {
      input.branch = options.branch;
    }

    const result = await this.executeGraphQL<{
      deploymentTriggerCreate: any;
    }>(token, mutation, { input });

    const deployment = result.deploymentTriggerCreate;

    return {
      id: deployment.id,
      status: this.mapDeploymentStatus(deployment.status || 'BUILDING'),
      projectId: options.projectId,
      environmentId: deployment.environmentId || options.environmentId,
      branch: options.branch,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      meta: deployment.meta,
    };
  }

  /**
   * Get deployment details
   * Returns null for not-found errors
   */
  async getDeployment(
    token: string,
    deploymentId: string,
  ): Promise<DeploymentResponseDto | null> {
    this.logger.log(`Getting Railway deployment: ${deploymentId}`);

    const query = `
      query deployment($id: String!) {
        deployment(id: $id) {
          id
          status
          meta
          createdAt
          updatedAt
          projectId
          environmentId
          staticUrl
        }
      }
    `;

    try {
      const result = await this.executeGraphQL<{
        deployment: any;
      }>(token, query, { id: deploymentId });

      if (!result.deployment) {
        return null;
      }

      const deployment = result.deployment;

      return {
        id: deployment.id,
        status: this.mapDeploymentStatus(deployment.status),
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        deploymentUrl: deployment.staticUrl || undefined,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
        meta: deployment.meta,
      };
    } catch (error: any) {
      // Return null for not-found errors
      if (
        error?.message?.includes('not found') ||
        error?.message?.includes('Not Found')
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List deployments for a Railway project
   */
  async listDeployments(
    token: string,
    projectId: string,
    options?: {
      environmentId?: string;
      first?: number;
      after?: string;
    },
  ): Promise<DeploymentListResponseDto> {
    this.logger.log(
      `Listing deployments for Railway project: ${projectId}`,
    );

    const query = `
      query deployments($projectId: String!, $first: Int, $after: String, $environmentId: String) {
        deployments(
          projectId: $projectId
          first: $first
          after: $after
          input: { environmentId: $environmentId }
        ) {
          edges {
            node {
              id
              status
              createdAt
              updatedAt
              projectId
              environmentId
              staticUrl
              meta
            }
          }
          pageInfo {
            totalCount
          }
        }
      }
    `;

    const variables: Record<string, any> = {
      projectId,
      first: options?.first || 10,
    };
    if (options?.after) {
      variables.after = options.after;
    }
    if (options?.environmentId) {
      variables.environmentId = options.environmentId;
    }

    const result = await this.executeGraphQL<{
      deployments: any;
    }>(token, query, variables);

    const deployments = (result.deployments?.edges || []).map(
      (edge: any) => ({
        id: edge.node.id,
        status: this.mapDeploymentStatus(edge.node.status),
        projectId: edge.node.projectId,
        environmentId: edge.node.environmentId,
        deploymentUrl: edge.node.staticUrl || undefined,
        branch: edge.node.meta?.branch,
        createdAt: edge.node.createdAt,
        updatedAt: edge.node.updatedAt,
      }),
    );

    return {
      deployments,
      total: result.deployments?.pageInfo?.totalCount || deployments.length,
    };
  }

  /**
   * Redeploy a specific Railway deployment (used for rollback)
   * Story 6.10: Deployment Rollback
   */
  async redeployDeployment(
    token: string,
    deploymentId: string,
  ): Promise<DeploymentResponseDto> {
    this.logger.log(`Redeploying Railway deployment: ${deploymentId}`);

    const mutation = `
      mutation deploymentRedeploy($id: String!) {
        deploymentRedeploy(id: $id) {
          id
          status
          createdAt
          updatedAt
          projectId
          environmentId
        }
      }
    `;

    const result = await this.executeGraphQL<{
      deploymentRedeploy: any;
    }>(token, mutation, { id: deploymentId });

    const deployment = result.deploymentRedeploy;

    return {
      id: deployment.id,
      status: this.mapDeploymentStatus(deployment.status || 'BUILDING'),
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    };
  }

  /**
   * Upsert environment variables for a Railway project environment
   */
  async upsertEnvironmentVariables(
    token: string,
    projectId: string,
    environmentId: string,
    variables: Record<string, string>,
  ): Promise<void> {
    this.logger.log(
      `Upserting ${Object.keys(variables).length} env vars for Railway project ${projectId}`,
    );

    const mutation = `
      mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `;

    await this.executeGraphQL(token, mutation, {
      input: {
        projectId,
        environmentId,
        variables,
      },
    });

    this.logger.log(
      `Environment variables upserted for Railway project ${projectId}`,
    );
  }
}
