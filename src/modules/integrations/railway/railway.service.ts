import {
  Injectable,
  Logger,
  ConflictException,
  BadGatewayException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import {
  RailwayProjectResponseDto,
  DeploymentResponseDto,
  DeploymentListResponseDto,
  RailwayServiceEntityDto,
  ServiceConnectionInfoDto,
  BulkDeploymentResponseDto,
  DomainResponseDto,
} from './dto/railway.dto';
import { RailwayCliExecutor } from './railway-cli-executor.service';
import {
  RailwayServiceEntity,
  RailwayServiceType,
  RailwayServiceStatus,
} from '../../../database/entities/railway-service.entity';
import {
  RailwayDeployment,
  DeploymentStatus,
} from '../../../database/entities/railway-deployment.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

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

  constructor(
    private readonly httpService: HttpService,
    private readonly cliExecutor: RailwayCliExecutor,
    @InjectRepository(RailwayServiceEntity)
    private readonly railwayServiceRepo: Repository<RailwayServiceEntity>,
    @InjectRepository(RailwayDeployment)
    private readonly railwayDeploymentRepo: Repository<RailwayDeployment>,
    private readonly auditService: AuditService,
  ) {}

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

  // ============================================================
  // Story 24-1: CLI-Based Provisioning Methods
  // ============================================================

  /**
   * Provision a database or cache service on Railway via CLI.
   *
   * Executes `railway add --database <type> -y`, creates a RailwayServiceEntity
   * record, and emits an audit event.
   *
   * @param token - Decrypted Railway token
   * @param options - Provisioning options
   * @returns RailwayServiceEntityDto of the provisioned service
   */
  async provisionDatabase(
    token: string,
    options: {
      workspaceId: string;
      projectId: string;
      railwayProjectId: string;
      userId: string;
      name: string;
      serviceType: RailwayServiceType;
      databaseType: string;
    },
  ): Promise<RailwayServiceEntityDto> {
    this.logger.log(
      `Provisioning ${options.databaseType} database "${options.name}" for project ${options.projectId.substring(0, 8)}...`,
    );

    // 1. Execute CLI command: railway add --database <type> -y
    const cliResult = await this.cliExecutor.execute({
      command: 'add',
      args: ['--database', options.databaseType],
      flags: ['-y'],
      railwayToken: token,
    });

    if (cliResult.exitCode !== 0 || cliResult.timedOut) {
      const errorMsg = cliResult.timedOut
        ? `Provisioning timed out after ${cliResult.durationMs}ms`
        : `Provisioning failed: ${cliResult.stderr || 'Unknown error'}`;
      this.logger.error(errorMsg);
      throw new BadGatewayException(errorMsg);
    }

    // 2. Parse CLI output to extract the Railway service ID
    const railwayServiceId = this.parseServiceIdFromOutput(cliResult.stdout);

    // 3. Create RailwayServiceEntity record
    const entity = this.railwayServiceRepo.create({
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      railwayProjectId: options.railwayProjectId,
      railwayServiceId,
      name: options.name,
      serviceType: options.serviceType,
      status: RailwayServiceStatus.PROVISIONING,
      deployOrder: 0,
      config: {},
      resourceInfo: { databaseType: options.databaseType },
    });

    const savedEntity = await this.railwayServiceRepo.save(entity);

    // 4. Update status to active (in production this would poll, but for MVP we set it directly)
    savedEntity.status = RailwayServiceStatus.ACTIVE;
    await this.railwayServiceRepo.save(savedEntity);

    // 5. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_SERVICE_PROVISIONED,
        'railway_service',
        savedEntity.id,
        {
          projectId: options.projectId,
          railwayProjectId: options.railwayProjectId,
          railwayServiceId,
          databaseType: options.databaseType,
          serviceName: options.name,
          serviceType: options.serviceType,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for database provisioning: ${(auditError as Error).message}`,
      );
    }

    return this.toServiceEntityDto(savedEntity);
  }

  /**
   * Wait for a Railway service to become ready by polling status.
   *
   * Polls `railway status --json` every 2 seconds until the service reports
   * 'active' status, or throws RequestTimeoutException after timeout.
   *
   * @param token - Decrypted Railway token
   * @param serviceId - Railway service ID to check
   * @param timeoutMs - Maximum wait time (default: 60,000ms)
   */
  async waitForServiceReady(
    token: string,
    serviceId: string,
    timeoutMs: number = 60_000,
  ): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 2_000;

    while (Date.now() - startTime < timeoutMs) {
      const cliResult = await this.cliExecutor.execute({
        command: 'status',
        flags: ['--json'],
        service: serviceId,
        railwayToken: token,
      });

      if (cliResult.exitCode === 0 && cliResult.stdout) {
        try {
          const statusData = JSON.parse(cliResult.stdout);
          if (statusData.status === 'active') {
            this.logger.log(`Service ${serviceId} is now active`);
            return;
          }
        } catch {
          // JSON parse failed, continue polling
        }
      }

      // Wait before next poll
      await this.sleep(Math.min(pollIntervalMs, timeoutMs - (Date.now() - startTime)));
    }

    throw new RequestTimeoutException(
      `Service ${serviceId} did not become ready within ${timeoutMs}ms`,
    );
  }

  /**
   * Get connection info for a Railway service (masked).
   *
   * Returns variable names with masked=true, NEVER returns actual values.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to get connection info for
   * @returns ServiceConnectionInfoDto with masked connection variables
   */
  async getServiceConnectionInfo(
    token: string,
    serviceEntity: RailwayServiceEntity,
  ): Promise<ServiceConnectionInfoDto> {
    this.logger.log(
      `Getting connection info for service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    const cliResult = await this.cliExecutor.execute({
      command: 'variable',
      args: ['list'],
      flags: ['--json'],
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    let variableNames: string[] = [];

    if (cliResult.exitCode === 0 && cliResult.stdout) {
      try {
        const parsed = JSON.parse(cliResult.stdout);
        if (parsed && typeof parsed === 'object') {
          variableNames = Object.keys(parsed);
        }
      } catch {
        this.logger.warn('Failed to parse variable list JSON output');
      }
    }

    return {
      serviceId: serviceEntity.id,
      serviceName: serviceEntity.name,
      serviceType: serviceEntity.serviceType,
      connectionVariables: variableNames.map((name) => ({
        name,
        masked: true,
        present: true,
      })),
    };
  }

  /**
   * List all Railway services for a project ordered by deploy order.
   *
   * @param projectId - DevOS project ID
   * @param workspaceId - DevOS workspace ID
   * @returns Array of RailwayServiceEntity records
   */
  async listServices(
    projectId: string,
    workspaceId: string,
  ): Promise<RailwayServiceEntityDto[]> {
    const services = await this.railwayServiceRepo.find({
      where: { projectId, workspaceId },
      order: { deployOrder: 'ASC' },
    });

    return services.map((s) => this.toServiceEntityDto(s));
  }

  /**
   * Find a single RailwayServiceEntity by ID and workspace.
   *
   * @param serviceEntityId - UUID of the RailwayServiceEntity
   * @param workspaceId - Workspace ID for isolation
   * @returns The entity or null if not found
   */
  async findServiceEntity(
    serviceEntityId: string,
    workspaceId: string,
  ): Promise<RailwayServiceEntity | null> {
    return this.railwayServiceRepo.findOne({
      where: { id: serviceEntityId, workspaceId },
    });
  }

  // ============================================================
  // Story 24-2: CLI-Based Deployment Methods
  // ============================================================

  /**
   * Deploy a single Railway service via CLI.
   *
   * Executes `railway up -s <service>`, creates a RailwayDeployment record,
   * and updates the service entity status.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to deploy
   * @param options - Deployment options
   * @returns The deployment record
   */
  async deployService(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      workspaceId: string;
      userId: string;
      environment?: string;
    },
  ): Promise<any> {
    this.logger.log(
      `Deploying service "${serviceEntity.name}" (${serviceEntity.railwayServiceId}) for project ${serviceEntity.projectId.substring(0, 8)}...`,
    );

    const startTime = Date.now();

    // 1. Create RailwayDeployment record with status building
    const deployment = this.railwayDeploymentRepo.create({
      railwayServiceEntityId: serviceEntity.id,
      projectId: serviceEntity.projectId,
      workspaceId: options.workspaceId,
      railwayDeploymentId: `cli-deploy-${Date.now()}`,
      status: DeploymentStatus.BUILDING,
      triggeredBy: options.userId,
      triggerType: 'manual',
      startedAt: new Date(),
      meta: {},
    });
    const savedDeployment = await this.railwayDeploymentRepo.save(deployment);

    // 2. Update service entity to deploying
    serviceEntity.status = RailwayServiceStatus.DEPLOYING;
    await this.railwayServiceRepo.save(serviceEntity);

    // 3. Execute CLI command: railway up -s <service>
    const cliResult = await this.cliExecutor.execute({
      command: 'up',
      service: serviceEntity.railwayServiceId,
      environment: options.environment,
      railwayToken: token,
    });

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // 4. Update deployment status based on exit code
    if (cliResult.exitCode === 0 && !cliResult.timedOut) {
      savedDeployment.status = DeploymentStatus.SUCCESS;
      savedDeployment.buildDurationSeconds = durationSeconds;
      savedDeployment.deployDurationSeconds = durationSeconds;
      savedDeployment.completedAt = new Date();

      // Extract deployment URL from output if present
      const urlMatch = cliResult.stdout.match(/https?:\/\/[^\s]+\.up\.railway\.app[^\s]*/);
      if (urlMatch) {
        savedDeployment.deploymentUrl = urlMatch[0];
        serviceEntity.deploymentUrl = urlMatch[0];
      }

      // Update service entity to active
      serviceEntity.status = RailwayServiceStatus.ACTIVE;
      await this.railwayServiceRepo.save(serviceEntity);
    } else {
      savedDeployment.status = DeploymentStatus.FAILED;
      savedDeployment.errorMessage = cliResult.timedOut
        ? `Deployment timed out after ${cliResult.durationMs}ms`
        : cliResult.stderr || 'Unknown deployment error';
      savedDeployment.completedAt = new Date();
      savedDeployment.buildDurationSeconds = durationSeconds;

      // Update service entity to failed
      serviceEntity.status = RailwayServiceStatus.FAILED;
      await this.railwayServiceRepo.save(serviceEntity);
    }

    await this.railwayDeploymentRepo.save(savedDeployment);

    // 5. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_SERVICE_DEPLOYED,
        'railway_deployment',
        savedDeployment.id,
        {
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          serviceType: serviceEntity.serviceType,
          status: savedDeployment.status,
          durationSeconds,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for service deployment: ${(auditError as Error).message}`,
      );
    }

    return savedDeployment;
  }

  /**
   * Deploy all services in dependency order.
   *
   * Fetches all RailwayServiceEntity records ordered by deployOrder ASC,
   * groups by deployOrder, deploys groups sequentially with services within
   * a group in parallel via Promise.allSettled.
   *
   * If database/API group (order 0-1) fails, halts deployment.
   * If frontend/worker group (order 2+) fails, reports partial failure.
   *
   * @param token - Decrypted Railway token
   * @param options - Bulk deployment options
   * @returns BulkDeploymentResponseDto with per-service status
   */
  async deployAllServices(
    token: string,
    options: {
      projectId: string;
      workspaceId: string;
      userId: string;
      environment?: string;
    },
  ): Promise<BulkDeploymentResponseDto> {
    const bulkDeploymentId = `bulk-${Date.now()}`;
    const startedAt = new Date().toISOString();

    this.logger.log(
      `Starting bulk deployment for project ${options.projectId.substring(0, 8)}...`,
    );

    // 1. Fetch all services ordered by deploy order
    const services = await this.railwayServiceRepo.find({
      where: { projectId: options.projectId, workspaceId: options.workspaceId },
      order: { deployOrder: 'ASC' },
    });

    // 2. Emit RAILWAY_BULK_DEPLOY_STARTED audit event
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_BULK_DEPLOY_STARTED,
        'railway_deployment',
        bulkDeploymentId,
        {
          projectId: options.projectId,
          serviceCount: services.length,
          environment: options.environment,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log bulk deploy started audit: ${(auditError as Error).message}`,
      );
    }

    // 3. Group by deployOrder
    const groups = new Map<number, RailwayServiceEntity[]>();
    for (const svc of services) {
      const existing = groups.get(svc.deployOrder) || [];
      existing.push(svc);
      groups.set(svc.deployOrder, existing);
    }

    // 4. Deploy groups sequentially
    const serviceResults: Array<{
      serviceId: string;
      serviceName: string;
      status: DeploymentStatus;
      deploymentUrl?: string;
      error?: string;
    }> = [];

    let overallFailed = false;
    let halted = false;

    const sortedOrders = [...groups.keys()].sort((a, b) => a - b);

    for (const order of sortedOrders) {
      if (halted) {
        // Mark remaining services as cancelled
        const groupServices = groups.get(order) || [];
        for (const svc of groupServices) {
          serviceResults.push({
            serviceId: svc.id,
            serviceName: svc.name,
            status: DeploymentStatus.CANCELLED,
            error: 'Deployment halted due to earlier failure',
          });
        }
        continue;
      }

      const groupServices = groups.get(order) || [];

      // Deploy all services in this group in parallel
      const results = await Promise.allSettled(
        groupServices.map(async (svc) => {
          const deployResult = await this.deployService(token, svc, {
            workspaceId: options.workspaceId,
            userId: options.userId,
            environment: options.environment,
          });
          return { svc, deployResult };
        }),
      );

      // Process results
      let groupHasFailure = false;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const svc = groupServices[i];

        if (result.status === 'fulfilled') {
          const deployment = result.value.deployResult;
          serviceResults.push({
            serviceId: svc.id,
            serviceName: svc.name,
            status: deployment.status,
            deploymentUrl: deployment.deploymentUrl,
            error: deployment.errorMessage,
          });
          if (deployment.status === DeploymentStatus.FAILED) {
            groupHasFailure = true;
            overallFailed = true;
          }
        } else {
          serviceResults.push({
            serviceId: svc.id,
            serviceName: svc.name,
            status: DeploymentStatus.FAILED,
            error: result.reason?.message || 'Unknown deployment error',
          });
          groupHasFailure = true;
          overallFailed = true;
        }
      }

      // If critical group (order 0-1) has failures, halt deployment
      if (groupHasFailure && order <= 1) {
        halted = true;
      }
    }

    // 5. Determine overall status
    let overallStatus: 'success' | 'partial_failure' | 'failed';
    if (halted) {
      overallStatus = 'failed';
    } else if (overallFailed) {
      overallStatus = 'partial_failure';
    } else {
      overallStatus = 'success';
    }

    // 6. Emit RAILWAY_BULK_DEPLOY_COMPLETED audit event
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED,
        'railway_deployment',
        bulkDeploymentId,
        {
          projectId: options.projectId,
          status: overallStatus,
          serviceCount: services.length,
          successCount: serviceResults.filter((s) => s.status === DeploymentStatus.SUCCESS).length,
          failedCount: serviceResults.filter((s) => s.status === DeploymentStatus.FAILED).length,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log bulk deploy completed audit: ${(auditError as Error).message}`,
      );
    }

    return {
      deploymentId: bulkDeploymentId,
      services: serviceResults,
      startedAt,
      status: overallStatus,
    };
  }

  /**
   * Redeploy a Railway service via CLI.
   *
   * Executes `railway redeploy -s <service>`, creates a RailwayDeployment record
   * with triggerType 'redeploy'.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to redeploy
   * @param options - Redeploy options
   * @returns The deployment record
   */
  async redeployService(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      workspaceId: string;
      userId: string;
    },
  ): Promise<any> {
    this.logger.log(
      `Redeploying service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    const startTime = Date.now();

    // 1. Create RailwayDeployment record
    const deployment = this.railwayDeploymentRepo.create({
      railwayServiceEntityId: serviceEntity.id,
      projectId: serviceEntity.projectId,
      workspaceId: options.workspaceId,
      railwayDeploymentId: `cli-redeploy-${Date.now()}`,
      status: DeploymentStatus.BUILDING,
      triggeredBy: options.userId,
      triggerType: 'redeploy',
      startedAt: new Date(),
      meta: {},
    });
    const savedDeployment = await this.railwayDeploymentRepo.save(deployment);

    // 2. Execute CLI command: railway redeploy -s <service>
    const cliResult = await this.cliExecutor.execute({
      command: 'redeploy',
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // 3. Update deployment status
    if (cliResult.exitCode === 0 && !cliResult.timedOut) {
      savedDeployment.status = DeploymentStatus.SUCCESS;
      savedDeployment.buildDurationSeconds = durationSeconds;
      savedDeployment.deployDurationSeconds = durationSeconds;
      savedDeployment.completedAt = new Date();

      serviceEntity.status = RailwayServiceStatus.ACTIVE;
      await this.railwayServiceRepo.save(serviceEntity);
    } else {
      savedDeployment.status = DeploymentStatus.FAILED;
      savedDeployment.errorMessage = cliResult.timedOut
        ? `Redeployment timed out after ${cliResult.durationMs}ms`
        : cliResult.stderr || 'Unknown redeployment error';
      savedDeployment.completedAt = new Date();
      savedDeployment.buildDurationSeconds = durationSeconds;

      serviceEntity.status = RailwayServiceStatus.FAILED;
      await this.railwayServiceRepo.save(serviceEntity);
    }

    await this.railwayDeploymentRepo.save(savedDeployment);

    // 4. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_SERVICE_DEPLOYED,
        'railway_deployment',
        savedDeployment.id,
        {
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          action: 'redeploy',
          status: savedDeployment.status,
          durationSeconds,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for redeployment: ${(auditError as Error).message}`,
      );
    }

    return savedDeployment;
  }

  /**
   * Restart a Railway service via CLI.
   *
   * Executes `railway restart -s <service>`. Does NOT create a deployment record
   * since restart is not a deployment operation.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to restart
   * @param options - Restart options
   * @returns Success response
   */
  async restartService(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      workspaceId: string;
      userId: string;
    },
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Restarting service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    // Execute CLI command: railway restart -s <service>
    const cliResult = await this.cliExecutor.execute({
      command: 'restart',
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    if (cliResult.exitCode !== 0 || cliResult.timedOut) {
      const errorMsg = cliResult.timedOut
        ? `Restart timed out after ${cliResult.durationMs}ms`
        : `Restart failed: ${cliResult.stderr || 'Unknown error'}`;
      this.logger.error(errorMsg);
      throw new BadGatewayException(errorMsg);
    }

    return { success: true };
  }

  // ============================================================
  // Story 24-3: Environment Variable Management Methods
  // ============================================================

  /**
   * List all environment variables for a Railway service (names only, masked).
   *
   * Executes `railway variable list --json -s <service>` via CLI.
   * Returns variable names with masked=true, NEVER returns actual values.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to list variables for
   * @returns Array of { name, masked: true, present: true }
   */
  async listServiceVariables(
    token: string,
    serviceEntity: RailwayServiceEntity,
  ): Promise<Array<{ name: string; masked: boolean; present: boolean }>> {
    this.logger.log(
      `Listing service variables for "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    const cliResult = await this.cliExecutor.execute({
      command: 'variable',
      args: ['list'],
      flags: ['--json'],
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    if (cliResult.exitCode !== 0 || !cliResult.stdout) {
      return [];
    }

    try {
      const parsed = JSON.parse(cliResult.stdout);
      if (parsed && typeof parsed === 'object') {
        return Object.keys(parsed).map((name) => ({
          name,
          masked: true,
          present: true,
        }));
      }
    } catch {
      this.logger.warn('Failed to parse variable list JSON output');
    }

    return [];
  }

  /**
   * Set environment variables on a Railway service via CLI.
   *
   * For each key-value pair, executes `railway variable set KEY=VALUE -s <service>`.
   * Emits RAILWAY_ENV_VAR_SET audit event with variable NAMES only (never values).
   * Optionally triggers auto-redeploy if configured.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to set variables on
   * @param variables - Key-value pairs of environment variables
   * @param options - Options including workspaceId, userId, autoRedeploy
   */
  async setServiceVariables(
    token: string,
    serviceEntity: RailwayServiceEntity,
    variables: Record<string, string>,
    options: {
      workspaceId: string;
      userId: string;
      autoRedeploy?: boolean;
    },
  ): Promise<void> {
    const variableNames = Object.keys(variables);

    this.logger.log(
      `Setting ${variableNames.length} variable(s) on service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    // Execute CLI command for each variable
    for (const [key, value] of Object.entries(variables)) {
      const cliResult = await this.cliExecutor.execute({
        command: 'variable',
        args: ['set', `${key}=${value}`],
        service: serviceEntity.railwayServiceId,
        railwayToken: token,
      });

      if (cliResult.exitCode !== 0 || cliResult.timedOut) {
        const errorMsg = cliResult.timedOut
          ? `Setting variable timed out after ${cliResult.durationMs}ms`
          : `Failed to set variable: ${cliResult.stderr || 'Unknown error'}`;
        this.logger.error(errorMsg);
        throw new BadGatewayException(errorMsg);
      }
    }

    // Emit audit event with variable NAMES only (never values)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_ENV_VAR_SET,
        'railway_service',
        serviceEntity.id,
        {
          variableNames,
          variableCount: variableNames.length,
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for env var set: ${(auditError as Error).message}`,
      );
    }

    // Optionally trigger auto-redeploy
    if (options.autoRedeploy) {
      await this.deployService(token, serviceEntity, {
        workspaceId: options.workspaceId,
        userId: options.userId,
      });
    }
  }

  /**
   * Delete an environment variable from a Railway service via CLI.
   *
   * Executes `railway variable delete KEY -s <service>`.
   * Emits RAILWAY_ENV_VAR_DELETED audit event with variable name only.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to delete variable from
   * @param variableName - Name of the variable to delete
   * @param options - Options including workspaceId and userId
   */
  async deleteServiceVariable(
    token: string,
    serviceEntity: RailwayServiceEntity,
    variableName: string,
    options: {
      workspaceId: string;
      userId: string;
    },
  ): Promise<void> {
    this.logger.log(
      `Deleting variable "${variableName}" from service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    const cliResult = await this.cliExecutor.execute({
      command: 'variable',
      args: ['delete', variableName],
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    if (cliResult.exitCode !== 0 || cliResult.timedOut) {
      const errorMsg = cliResult.timedOut
        ? `Deleting variable timed out after ${cliResult.durationMs}ms`
        : `Failed to delete variable: ${cliResult.stderr || 'Unknown error'}`;
      this.logger.error(errorMsg);
      throw new BadGatewayException(errorMsg);
    }

    // Emit audit event with variable name only
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_ENV_VAR_DELETED,
        'railway_service',
        serviceEntity.id,
        {
          variableName,
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for env var delete: ${(auditError as Error).message}`,
      );
    }
  }

  // ============================================================
  // Story 24-4: Domain Management Methods
  // ============================================================

  /**
   * Add a domain to a Railway service via CLI.
   *
   * If a custom domain is provided, executes `railway domain <domain> -s <service>`.
   * If no custom domain, executes `railway domain -s <service>` to generate a Railway domain.
   * Updates entity customDomain or deploymentUrl accordingly.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to add domain to
   * @param options - Domain options
   * @returns DomainResponseDto with domain, type, status, and DNS instructions
   */
  async addDomain(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      workspaceId: string;
      userId: string;
      customDomain?: string;
    },
  ): Promise<DomainResponseDto> {
    const isCustom = !!options.customDomain;
    const domainLabel = options.customDomain || 'Railway-generated domain';

    this.logger.log(
      `Adding domain "${domainLabel}" to service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    // 1. Build CLI args: 'domain <customDomain>' or just 'domain'
    const args: string[] = options.customDomain ? [options.customDomain] : [];

    // 2. Execute CLI command
    const cliResult = await this.cliExecutor.execute({
      command: 'domain',
      args: args.length > 0 ? args : undefined,
      service: serviceEntity.railwayServiceId,
      railwayToken: token,
    });

    if (cliResult.exitCode !== 0 || cliResult.timedOut) {
      const errorMsg = cliResult.timedOut
        ? `Domain operation timed out after ${cliResult.durationMs}ms`
        : `Failed to add domain: ${cliResult.stderr || 'Unknown error'}`;
      this.logger.error(errorMsg);
      throw new BadGatewayException(errorMsg);
    }

    // 3. Parse output to extract domain URL
    const parsedDomain = this.parseDomainFromOutput(cliResult.stdout, options.customDomain);

    // 4. Update entity based on domain type
    if (isCustom) {
      serviceEntity.customDomain = options.customDomain!;
    } else {
      serviceEntity.deploymentUrl = parsedDomain;
    }
    await this.railwayServiceRepo.save(serviceEntity);

    // 5. Build response DTO
    const domainResponse: DomainResponseDto = {
      domain: isCustom ? options.customDomain! : parsedDomain,
      type: isCustom ? 'custom' : 'railway',
      status: isCustom ? 'pending_dns' : 'active',
    };

    // Add DNS instructions for custom domains
    if (isCustom) {
      domainResponse.dnsInstructions = {
        type: 'CNAME',
        name: options.customDomain!,
        value: `${serviceEntity.railwayServiceId}.up.railway.app`,
      };
    }

    // 6. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_DOMAIN_ADDED,
        'railway_service',
        serviceEntity.id,
        {
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          domain: domainResponse.domain,
          domainType: domainResponse.type,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for domain addition: ${(auditError as Error).message}`,
      );
    }

    return domainResponse;
  }

  /**
   * Remove a domain from a Railway service via GraphQL API.
   *
   * Railway CLI does not support domain removal directly, so we use the GraphQL API.
   * Clears the corresponding field on the entity (customDomain or deploymentUrl).
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to remove domain from
   * @param options - Removal options
   */
  async removeDomain(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      workspaceId: string;
      userId: string;
      domain: string;
    },
  ): Promise<void> {
    this.logger.log(
      `Removing domain "${options.domain}" from service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    // 1. Remove via Railway GraphQL API
    const mutation = `
      mutation domainDelete($id: String!) {
        domainDelete(id: $id)
      }
    `;

    await this.executeGraphQL(token, mutation, {
      id: options.domain,
    });

    // 2. Clear the appropriate field on the entity
    if (serviceEntity.customDomain === options.domain) {
      serviceEntity.customDomain = null as any;
    } else if (serviceEntity.deploymentUrl === options.domain) {
      serviceEntity.deploymentUrl = null as any;
    }
    await this.railwayServiceRepo.save(serviceEntity);

    // 3. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_DOMAIN_REMOVED,
        'railway_service',
        serviceEntity.id,
        {
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          domain: options.domain,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for domain removal: ${(auditError as Error).message}`,
      );
    }
  }

  /**
   * Get all domains for a Railway service via GraphQL API.
   *
   * Fetches domain info including status (active, pending_dns, pending_ssl).
   * Classifies domains as 'railway' or 'custom' based on the domain pattern.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to get domains for
   * @returns Array of DomainResponseDto
   */
  async getDomains(
    token: string,
    serviceEntity: RailwayServiceEntity,
  ): Promise<DomainResponseDto[]> {
    this.logger.log(
      `Getting domains for service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    const query = `
      query domains($serviceId: String!) {
        domains(serviceId: $serviceId) {
          edges {
            node {
              domain
              status {
                dnsStatus
              }
            }
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      domains: {
        edges: Array<{
          node: {
            domain: string;
            status: { dnsStatus: string };
          };
        }>;
      };
    }>(token, query, { serviceId: serviceEntity.railwayServiceId });

    const edges = result.domains?.edges || [];

    return edges.map((edge) => {
      const domainStr = edge.node.domain;
      const isRailwayDomain = domainStr.includes('.up.railway.app');
      const dnsStatus = edge.node.status?.dnsStatus || 'DNS_PENDING';

      const dto: DomainResponseDto = {
        domain: domainStr,
        type: isRailwayDomain ? 'railway' : 'custom',
        status: this.mapDnsStatus(dnsStatus),
      };

      // Add DNS instructions for custom domains with pending status
      if (!isRailwayDomain && dto.status !== 'active') {
        dto.dnsInstructions = {
          type: 'CNAME',
          name: domainStr,
          value: `${serviceEntity.railwayServiceId}.up.railway.app`,
        };
      }

      return dto;
    });
  }

  // ============================================================
  // Story 24-5: Log Streaming & Deployment History Methods
  // ============================================================

  /**
   * Stream logs from a Railway service via CLI.
   *
   * Executes `railway logs -s <service>` with optional --build and -n flags.
   * Each log line is sanitized before delivery via the onLog callback.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to get logs for
   * @param options - Log streaming options
   */
  async streamLogs(
    token: string,
    serviceEntity: RailwayServiceEntity,
    options: {
      buildLogs?: boolean;
      lines?: number;
      onLog?: (line: string) => void;
    },
  ): Promise<string[]> {
    this.logger.log(
      `Streaming logs for service "${serviceEntity.name}" (${serviceEntity.railwayServiceId})`,
    );

    // Build flags
    const flags: string[] = [];
    if (options.buildLogs) {
      flags.push('--build');
    }
    if (options.lines) {
      flags.push('-n', String(options.lines));
    }

    const cliResult = await this.cliExecutor.execute({
      command: 'logs',
      service: serviceEntity.railwayServiceId,
      flags: flags.length > 0 ? flags : undefined,
      railwayToken: token,
    });

    if (cliResult.timedOut) {
      throw new BadGatewayException(
        `Log streaming timed out after ${cliResult.durationMs}ms`,
      );
    }

    if (cliResult.exitCode !== 0) {
      throw new BadGatewayException(
        `Failed to stream logs: ${cliResult.stderr || 'Unknown error'}`,
      );
    }

    // Parse and deliver log lines
    const logLines = cliResult.stdout
      .split('\n')
      .filter((line) => line.length > 0);

    if (options.onLog) {
      for (const line of logLines) {
        options.onLog(line);
      }
    }

    return logLines;
  }

  /**
   * Get deployment history for a service with pagination.
   *
   * Queries RailwayDeployment records ordered by createdAt DESC.
   * Supports pagination and optional status filtering.
   *
   * @param serviceEntityId - UUID of the RailwayServiceEntity
   * @param options - Pagination and filtering options
   * @returns Paginated deployment history
   */
  async getDeploymentHistory(
    serviceEntityId: string,
    options: {
      page?: number;
      limit?: number;
      status?: DeploymentStatus;
    },
  ): Promise<{
    deployments: RailwayDeployment[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      railwayServiceEntityId: serviceEntityId,
    };

    if (options.status) {
      where.status = options.status;
    }

    const [deployments, total] = await this.railwayDeploymentRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { deployments, total, page, limit };
  }

  /**
   * Get a single deployment by ID with workspace isolation.
   *
   * @param deploymentId - UUID of the RailwayDeployment
   * @param workspaceId - Workspace ID for isolation
   * @returns The deployment or null if not found
   */
  async getDeploymentById(
    deploymentId: string,
    workspaceId: string,
  ): Promise<RailwayDeployment | null> {
    return this.railwayDeploymentRepo.findOne({
      where: { id: deploymentId, workspaceId },
    });
  }

  /**
   * Rollback a deployment to a previous version.
   *
   * Looks up the target deployment, reuses redeployDeployment GraphQL method
   * to redeploy it, and creates a new RailwayDeployment with triggerType 'rollback'.
   *
   * @param token - Decrypted Railway token
   * @param serviceEntity - The RailwayServiceEntity to rollback
   * @param targetDeploymentId - DevOS deployment ID to rollback to
   * @param options - Rollback options
   * @returns The new deployment record
   */
  async rollbackDeployment(
    token: string,
    serviceEntity: RailwayServiceEntity,
    targetDeploymentId: string,
    options: {
      workspaceId: string;
      userId: string;
    },
  ): Promise<RailwayDeployment> {
    // 1. Look up the target deployment
    const targetDeployment = await this.railwayDeploymentRepo.findOne({
      where: { id: targetDeploymentId, workspaceId: options.workspaceId },
    });

    if (!targetDeployment) {
      throw new NotFoundException(
        `Deployment ${targetDeploymentId} not found`,
      );
    }

    this.logger.log(
      `Rolling back service "${serviceEntity.name}" to deployment ${targetDeploymentId}`,
    );

    // 2. Call redeployDeployment GraphQL with the target Railway deployment ID
    const redeployResult = await this.redeployDeployment(
      token,
      targetDeployment.railwayDeploymentId,
    );

    // 3. Create a new deployment record with triggerType 'rollback'
    const newDeployment = this.railwayDeploymentRepo.create({
      railwayServiceEntityId: serviceEntity.id,
      projectId: serviceEntity.projectId,
      workspaceId: options.workspaceId,
      railwayDeploymentId: redeployResult.id,
      status: DeploymentStatus.BUILDING,
      triggeredBy: options.userId,
      triggerType: 'rollback',
      startedAt: new Date(),
      meta: {
        rollbackFromDeploymentId: targetDeploymentId,
        rollbackFromRailwayDeploymentId: targetDeployment.railwayDeploymentId,
      },
    });

    const savedDeployment = await this.railwayDeploymentRepo.save(newDeployment);

    // 4. Update service entity status
    serviceEntity.status = RailwayServiceStatus.DEPLOYING;
    await this.railwayServiceRepo.save(serviceEntity);

    // 5. Emit audit event (non-blocking)
    try {
      await this.auditService.log(
        options.workspaceId,
        options.userId,
        AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK,
        'railway_deployment',
        savedDeployment.id,
        {
          serviceId: serviceEntity.id,
          serviceName: serviceEntity.name,
          rollbackFromDeploymentId: targetDeploymentId,
          newDeploymentId: savedDeployment.id,
          projectId: serviceEntity.projectId,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for deployment rollback: ${(auditError as Error).message}`,
      );
    }

    return savedDeployment;
  }

  /**
   * Check Railway connection health by executing `railway whoami`.
   *
   * @param token - Decrypted Railway token
   * @returns Health check result with connected status and optional username/error
   */
  async checkHealth(
    token: string,
  ): Promise<{ connected: boolean; username?: string; error?: string }> {
    const cliResult = await this.cliExecutor.execute({
      command: 'whoami',
      railwayToken: token,
    });

    if (cliResult.timedOut) {
      return {
        connected: false,
        error: `Health check timed out after ${cliResult.durationMs}ms`,
      };
    }

    if (cliResult.exitCode !== 0) {
      return {
        connected: false,
        error: cliResult.stderr || 'Not logged in or invalid token',
      };
    }

    // Parse username from whoami output
    // Typical output: "Logged in as testuser (test@example.com)"
    const usernameMatch = cliResult.stdout.match(/as\s+(\S+)/);
    const username = usernameMatch ? usernameMatch[1] : cliResult.stdout.trim();

    return {
      connected: true,
      username,
    };
  }

  // ---- Private Helpers ----

  /**
   * Parse the Railway service ID from CLI add command output.
   * Railway CLI outputs text like "Created service main-db (railway-svc-id-123)"
   * or just outputs the service info. We extract the ID from parentheses or
   * generate a placeholder if parsing fails.
   */
  private parseServiceIdFromOutput(output: string): string {
    // Try to extract ID from parentheses: (service-id-here)
    const parenMatch = output.match(/\(([a-zA-Z0-9-]+)\)/);
    if (parenMatch) {
      return parenMatch[1];
    }

    // Try to extract UUID-like pattern
    const uuidMatch = output.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    if (uuidMatch) {
      return uuidMatch[0];
    }

    // Fallback: generate a placeholder ID from the output hash
    return `cli-provisioned-${Date.now()}`;
  }

  /**
   * Convert a RailwayServiceEntity to a DTO for API responses.
   */
  private toServiceEntityDto(entity: RailwayServiceEntity): RailwayServiceEntityDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      railwayServiceId: entity.railwayServiceId,
      name: entity.name,
      serviceType: entity.serviceType,
      status: entity.status,
      deploymentUrl: entity.deploymentUrl,
      customDomain: entity.customDomain,
      deployOrder: entity.deployOrder,
      config: entity.config,
      createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : String(entity.createdAt),
      updatedAt: entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : String(entity.updatedAt),
    };
  }

  /**
   * Parse domain URL from CLI output.
   *
   * Attempts to extract a domain from the CLI stdout. Falls back to generating
   * a default Railway domain using the service ID.
   *
   * @param output - CLI stdout content
   * @param customDomain - Optional custom domain that was requested
   * @returns The parsed or generated domain string
   */
  private parseDomainFromOutput(output: string, customDomain?: string): string {
    if (customDomain) {
      return customDomain;
    }

    // Try to extract a .up.railway.app domain from the output
    const railwayDomainMatch = output.match(
      /([a-zA-Z0-9-]+\.up\.railway\.app)/,
    );
    if (railwayDomainMatch) {
      return railwayDomainMatch[1];
    }

    // Try to extract any URL-like domain from the output
    const domainMatch = output.match(
      /([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/,
    );
    if (domainMatch) {
      return domainMatch[1];
    }

    // Fallback: generate a placeholder domain
    return `service-${Date.now()}.up.railway.app`;
  }

  /**
   * Map Railway DNS status string to DomainResponseDto status.
   */
  private mapDnsStatus(dnsStatus: string): 'active' | 'pending_dns' | 'pending_ssl' | 'error' {
    const statusMap: Record<string, 'active' | 'pending_dns' | 'pending_ssl' | 'error'> = {
      DNS_ACTIVE: 'active',
      ACTIVE: 'active',
      DNS_PENDING: 'pending_dns',
      PENDING: 'pending_dns',
      SSL_PENDING: 'pending_ssl',
      ERROR: 'error',
      FAILED: 'error',
    };
    return statusMap[dnsStatus] || 'pending_dns';
  }

  /**
   * Sleep helper for polling.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}
