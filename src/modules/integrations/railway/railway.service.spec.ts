import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ConflictException, BadGatewayException, RequestTimeoutException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RailwayService } from './railway.service';
import { RailwayCliExecutor } from './railway-cli-executor.service';
import { RailwayServiceEntity, RailwayServiceType, RailwayServiceStatus } from '../../../database/entities/railway-service.entity';
import { RailwayDeployment, DeploymentStatus } from '../../../database/entities/railway-deployment.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

describe('RailwayService', () => {
  let service: RailwayService;
  let mockHttpService: any;

  const mockToken = 'railway_test_token';

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    const mockCliExecutor = {
      execute: jest.fn(),
    };

    const mockServiceRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockDeploymentRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    const mockProjectResponse = {
      data: {
        projectCreate: {
          id: 'railway-project-uuid',
          name: 'my-app',
          description: 'My App Description',
          createdAt: '2026-02-01T10:00:00Z',
          environments: {
            edges: [
              { node: { id: 'env-uuid', name: 'production' } },
            ],
          },
        },
      },
    };

    it('should call Railway GraphQL with correct mutation and return project details', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      const result = await service.createProject(mockToken, {
        name: 'my-app',
        description: 'My App Description',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('projectCreate'),
          variables: expect.objectContaining({
            input: { name: 'my-app', description: 'My App Description' },
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer railway_test_token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe('railway-project-uuid');
      expect(result.name).toBe('my-app');
      expect(result.description).toBe('My App Description');
      expect(result.projectUrl).toBe(
        'https://railway.app/project/railway-project-uuid',
      );
      expect(result.environments).toEqual([
        { id: 'env-uuid', name: 'production' },
      ]);
      expect(result.createdAt).toBe('2026-02-01T10:00:00Z');
    });

    it('should throw ConflictException when project name exists', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            errors: [{ message: 'Project already exists' }],
          }),
        ),
      );

      await expect(
        service.createProject(mockToken, { name: 'existing-app' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for Railway API errors', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            errors: [{ message: 'Internal server error' }],
          }),
        ),
      );

      await expect(
        service.createProject(mockToken, { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for network errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.createProject(mockToken, { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('linkGitHubRepoToProject', () => {
    it('should call Railway GraphQL with correct mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: { serviceCreate: { id: 'service-uuid', name: 'my-repo' } },
          }),
        ),
      );

      await service.linkGitHubRepoToProject(
        mockToken,
        'railway-project-uuid',
        'testuser/my-repo',
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('serviceCreate'),
          variables: expect.objectContaining({
            input: expect.objectContaining({
              projectId: 'railway-project-uuid',
              source: { repo: 'testuser/my-repo' },
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should not throw on error (silently logs warning)', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Failed to link repo')),
      );

      // Should not throw
      await expect(
        service.linkGitHubRepoToProject(
          mockToken,
          'railway-project-uuid',
          'testuser/my-repo',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('triggerDeployment', () => {
    const mockDeploymentResponse = {
      data: {
        deploymentTriggerCreate: {
          id: 'deployment-uuid',
          status: 'BUILDING',
          environmentId: 'env-uuid',
          createdAt: '2026-02-01T10:05:00Z',
          updatedAt: null,
          meta: {},
        },
      },
    };

    it('should call Railway GraphQL with correct mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockDeploymentResponse)),
      );

      const result = await service.triggerDeployment(mockToken, {
        projectId: 'railway-project-uuid',
        environmentId: 'env-uuid',
        branch: 'main',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('deploymentTriggerCreate'),
        }),
        expect.any(Object),
      );

      expect(result.id).toBe('deployment-uuid');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe('railway-project-uuid');
    });

    it('should return deployment details with BUILDING status mapped', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockDeploymentResponse)),
      );

      const result = await service.triggerDeployment(mockToken, {
        projectId: 'railway-project-uuid',
      });

      expect(result.status).toBe('building');
      expect(result.createdAt).toBe('2026-02-01T10:05:00Z');
    });

    it('should throw BadGatewayException for Railway API errors', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            errors: [{ message: 'Deployment failed' }],
          }),
        ),
      );

      await expect(
        service.triggerDeployment(mockToken, {
          projectId: 'railway-project-uuid',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getDeployment', () => {
    const createDeploymentResponse = (status: string) => ({
      data: {
        deployment: {
          id: 'deployment-uuid',
          status,
          projectId: 'railway-project-uuid',
          environmentId: 'env-uuid',
          staticUrl: 'https://my-app.up.railway.app',
          createdAt: '2026-02-01T10:05:00Z',
          updatedAt: '2026-02-01T10:08:00Z',
          meta: { image: 'test-image' },
        },
      },
    });

    it('should return deployment with mapped status', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createDeploymentResponse('SUCCESS'))),
      );

      const result = await service.getDeployment(
        mockToken,
        'deployment-uuid',
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('deployment-uuid');
      expect(result!.status).toBe('success');
      expect(result!.deploymentUrl).toBe(
        'https://my-app.up.railway.app',
      );
    });

    it('should return null for not-found', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: { deployment: null },
          }),
        ),
      );

      const result = await service.getDeployment(
        mockToken,
        'nonexistent-uuid',
      );

      expect(result).toBeNull();
    });

    it('should map all Railway statuses correctly', async () => {
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

      for (const [railwayStatus, expectedStatus] of Object.entries(
        statusMap,
      )) {
        mockHttpService.post.mockReturnValue(
          of(
            createAxiosResponse(
              createDeploymentResponse(railwayStatus),
            ),
          ),
        );

        const result = await service.getDeployment(
          mockToken,
          'deployment-uuid',
        );

        expect(result!.status).toBe(expectedStatus);
      }
    });

    it('should map unknown status to "unknown"', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse(
            createDeploymentResponse('UNKNOWN_STATUS'),
          ),
        ),
      );

      const result = await service.getDeployment(
        mockToken,
        'deployment-uuid',
      );

      expect(result!.status).toBe('unknown');
    });
  });

  describe('listDeployments', () => {
    const mockListResponse = {
      data: {
        deployments: {
          edges: [
            {
              node: {
                id: 'dep-1',
                status: 'SUCCESS',
                projectId: 'railway-project-uuid',
                environmentId: 'env-uuid',
                staticUrl: 'https://my-app.up.railway.app',
                createdAt: '2026-02-01T10:05:00Z',
                updatedAt: '2026-02-01T10:08:00Z',
                meta: { branch: 'main' },
              },
            },
            {
              node: {
                id: 'dep-2',
                status: 'BUILDING',
                projectId: 'railway-project-uuid',
                environmentId: 'env-uuid',
                staticUrl: null,
                createdAt: '2026-02-01T10:10:00Z',
                updatedAt: null,
                meta: { branch: 'feature' },
              },
            },
          ],
          pageInfo: { totalCount: 5 },
        },
      },
    };

    it('should return paginated deployment list', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockListResponse)),
      );

      const result = await service.listDeployments(
        mockToken,
        'railway-project-uuid',
      );

      expect(result.deployments).toHaveLength(2);
      expect(result.deployments[0].id).toBe('dep-1');
      expect(result.deployments[0].status).toBe('success');
      expect(result.deployments[1].status).toBe('building');
      expect(result.total).toBe(5);
    });

    it('should pass environmentId filter when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockListResponse)),
      );

      await service.listDeployments(mockToken, 'railway-project-uuid', {
        environmentId: 'env-uuid',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          variables: expect.objectContaining({
            environmentId: 'env-uuid',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('upsertEnvironmentVariables', () => {
    it('should call Railway GraphQL with correct mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: { variableCollectionUpsert: true },
          }),
        ),
      );

      await service.upsertEnvironmentVariables(
        mockToken,
        'railway-project-uuid',
        'env-uuid',
        { DATABASE_URL: 'postgresql://...', NODE_ENV: 'production' },
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('variableCollectionUpsert'),
          variables: expect.objectContaining({
            input: expect.objectContaining({
              projectId: 'railway-project-uuid',
              environmentId: 'env-uuid',
              variables: {
                DATABASE_URL: 'postgresql://...',
                NODE_ENV: 'production',
              },
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should throw BadGatewayException for API errors', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            errors: [{ message: 'Variable update failed' }],
          }),
        ),
      );

      await expect(
        service.upsertEnvironmentVariables(
          mockToken,
          'railway-project-uuid',
          'env-uuid',
          { NODE_ENV: 'production' },
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('mapDeploymentStatus (via getDeployment)', () => {
    it('should map BUILDING to building', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'BUILDING',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('building');
    });

    it('should map DEPLOYING to deploying', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'DEPLOYING',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('deploying');
    });

    it('should map FAILED to failed', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'FAILED',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('failed');
    });

    it('should map CRASHED to crashed', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'CRASHED',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('crashed');
    });

    it('should map REMOVED to removed', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'REMOVED',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('removed');
    });

    it('should map QUEUED to queued', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'QUEUED',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('queued');
    });

    it('should map WAITING to waiting', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'WAITING',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('waiting');
    });

    it('should map unknown status to unknown', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              deployment: {
                id: 'dep-1',
                status: 'SOME_NEW_STATUS',
                projectId: 'proj-1',
                createdAt: '2026-02-01T10:00:00Z',
              },
            },
          }),
        ),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('unknown');
    });
  });

  describe('redeployDeployment', () => {
    const mockRedeployResponse = {
      data: {
        deploymentRedeploy: {
          id: 'new-deployment-uuid',
          status: 'BUILDING',
          createdAt: '2026-02-01T10:05:00Z',
          updatedAt: null,
          projectId: 'railway-project-uuid',
          environmentId: 'env-uuid',
        },
      },
    };

    it('should successfully redeploy a deployment', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockRedeployResponse)),
      );

      const result = await service.redeployDeployment(
        mockToken,
        'target-deployment-uuid',
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('deploymentRedeploy'),
          variables: { id: 'target-deployment-uuid' },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer railway_test_token',
          }),
        }),
      );

      expect(result.id).toBe('new-deployment-uuid');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe('railway-project-uuid');
      expect(result.environmentId).toBe('env-uuid');
    });

    it('should throw BadGatewayException on GraphQL error', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            errors: [{ message: 'Deployment not found' }],
          }),
        ),
      );

      await expect(
        service.redeployDeployment(mockToken, 'invalid-deployment-uuid'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on network error', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.redeployDeployment(mockToken, 'target-deployment-uuid'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getRailwayStatus (via service integration)', () => {
    // getRailwayStatus is on IntegrationConnectionService, not RailwayService
    // These tests are placed in integration-connection.service.spec.ts
  });
});

// ============================================================
// Story 24-1: Railway Database & Resource Provisioning Tests
// ============================================================

describe('RailwayService - CLI Provisioning Methods (Story 24-1)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockAuditService: any;

  const mockToken = 'railway_test_token';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockRailwayProjectId = 'rp-railway-project-uuid';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    mockCliExecutor = {
      execute: jest.fn(),
    };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: 'new-service-entity-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-service-entity-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockDeploymentRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();

    // Restore mocks after clear
    mockServiceRepo.create.mockImplementation((dto: any) => ({ ...dto, id: 'new-service-entity-uuid' }));
    mockServiceRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-service-entity-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockAuditService.log.mockResolvedValue(undefined);
  });

  // ---- provisionDatabase tests ----

  describe('provisionDatabase', () => {
    const provisionOptions = {
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      railwayProjectId: mockRailwayProjectId,
      userId: mockUserId,
      name: 'main-db',
      serviceType: RailwayServiceType.DATABASE,
      databaseType: 'postgres' as const,
    };

    it('should call CLI with "add --database postgres -y" for postgres type', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service main-db (railway-svc-id-123)',
        stderr: '',
        durationMs: 3000,
        timedOut: false,
      });

      await service.provisionDatabase(mockToken, provisionOptions);

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'add',
          args: ['--database', 'postgres'],
          flags: ['-y'],
          railwayToken: mockToken,
        }),
      );
    });

    it('should call CLI with "add --database redis -y" for redis type', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service cache (railway-svc-id-456)',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      const redisOptions = {
        ...provisionOptions,
        name: 'cache',
        serviceType: RailwayServiceType.CACHE,
        databaseType: 'redis' as const,
      };

      await service.provisionDatabase(mockToken, redisOptions);

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'add',
          args: ['--database', 'redis'],
          flags: ['-y'],
          railwayToken: mockToken,
        }),
      );
    });

    it('should create a RailwayServiceEntity with serviceType database and deployOrder 0 for postgres', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service main-db (railway-svc-id-123)',
        stderr: '',
        durationMs: 3000,
        timedOut: false,
      });

      await service.provisionDatabase(mockToken, provisionOptions);

      expect(mockServiceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          railwayProjectId: mockRailwayProjectId,
          name: 'main-db',
          serviceType: RailwayServiceType.DATABASE,
          status: RailwayServiceStatus.PROVISIONING,
          deployOrder: 0,
        }),
      );
      expect(mockServiceRepo.save).toHaveBeenCalled();
    });

    it('should create a RailwayServiceEntity with serviceType cache for redis', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service cache (railway-svc-id-456)',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      const redisOptions = {
        ...provisionOptions,
        name: 'cache',
        serviceType: RailwayServiceType.CACHE,
        databaseType: 'redis' as const,
      };

      await service.provisionDatabase(mockToken, redisOptions);

      expect(mockServiceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceType: RailwayServiceType.CACHE,
          deployOrder: 0,
        }),
      );
    });

    it('should emit RAILWAY_SERVICE_PROVISIONED audit event on success', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service main-db (railway-svc-id-123)',
        stderr: '',
        durationMs: 3000,
        timedOut: false,
      });

      await service.provisionDatabase(mockToken, provisionOptions);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_SERVICE_PROVISIONED,
        'railway_service',
        expect.any(String),
        expect.objectContaining({
          projectId: mockProjectId,
          databaseType: 'postgres',
          serviceName: 'main-db',
        }),
      );
    });

    it('should throw BadGatewayException when CLI exits with non-zero code', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Failed to provision database',
        durationMs: 1000,
        timedOut: false,
      });

      await expect(
        service.provisionDatabase(mockToken, provisionOptions),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException when CLI times out', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs: 120000,
        timedOut: true,
      });

      await expect(
        service.provisionDatabase(mockToken, provisionOptions),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should return a RailwayServiceEntityDto with correct fields', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service main-db (railway-svc-id-123)',
        stderr: '',
        durationMs: 3000,
        timedOut: false,
      });

      const result = await service.provisionDatabase(mockToken, provisionOptions);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('projectId', mockProjectId);
      expect(result).toHaveProperty('name', 'main-db');
      expect(result).toHaveProperty('serviceType', RailwayServiceType.DATABASE);
      expect(result).toHaveProperty('deployOrder', 0);
    });

    it('should not include token in audit log payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Created service main-db (railway-svc-id-123)',
        stderr: '',
        durationMs: 3000,
        timedOut: false,
      });

      await service.provisionDatabase(mockToken, provisionOptions);

      const auditPayload = mockAuditService.log.mock.calls[0][5];
      expect(JSON.stringify(auditPayload)).not.toContain(mockToken);
    });
  });

  // ---- waitForServiceReady tests ----

  describe('waitForServiceReady', () => {
    it('should return when CLI status reports service as active', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ status: 'active' }),
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      // Should resolve without throwing
      await expect(
        service.waitForServiceReady(mockToken, 'railway-svc-id-123', 10000),
      ).resolves.not.toThrow();
    });

    it('should poll multiple times until status is active', async () => {
      let callCount = 0;
      mockCliExecutor.execute.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({ status: 'provisioning' }),
            stderr: '',
            durationMs: 500,
            timedOut: false,
          });
        }
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ status: 'active' }),
          stderr: '',
          durationMs: 500,
          timedOut: false,
        });
      });

      await service.waitForServiceReady(mockToken, 'railway-svc-id-123', 30000);

      expect(mockCliExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('should throw RequestTimeoutException after timeout', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ status: 'provisioning' }),
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      // Use a very short timeout to make the test fast
      await expect(
        service.waitForServiceReady(mockToken, 'railway-svc-id-123', 100),
      ).rejects.toThrow(RequestTimeoutException);
    }, 10000);

    it('should call CLI with status --json', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ status: 'active' }),
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      await service.waitForServiceReady(mockToken, 'railway-svc-id-123', 10000);

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'status',
          flags: expect.arrayContaining(['--json']),
          railwayToken: mockToken,
        }),
      );
    });
  });

  // ---- getServiceConnectionInfo tests ----

  describe('getServiceConnectionInfo', () => {
    const mockServiceEntity: Partial<RailwayServiceEntity> = {
      id: 'entity-uuid-1',
      name: 'main-db',
      railwayServiceId: 'railway-svc-id-123',
      serviceType: RailwayServiceType.DATABASE,
    };

    it('should return connection variables with masked=true and present=true', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({
          DATABASE_URL: 'postgresql://user:pass@host:5432/db',
          PGHOST: 'host',
          PGPORT: '5432',
        }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      const result = await service.getServiceConnectionInfo(
        mockToken,
        mockServiceEntity as RailwayServiceEntity,
      );

      expect(result.serviceId).toBe('entity-uuid-1');
      expect(result.serviceName).toBe('main-db');
      expect(result.serviceType).toBe(RailwayServiceType.DATABASE);
      expect(result.connectionVariables).toHaveLength(3);
      expect(result.connectionVariables[0]).toEqual(
        expect.objectContaining({
          name: 'DATABASE_URL',
          masked: true,
          present: true,
        }),
      );
    });

    it('should NEVER return actual variable values', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({
          DATABASE_URL: 'postgresql://user:pass@host:5432/db',
          REDIS_URL: 'redis://user:pass@host:6379',
        }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      const result = await service.getServiceConnectionInfo(
        mockToken,
        mockServiceEntity as RailwayServiceEntity,
      );

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('postgresql://user:pass');
      expect(resultStr).not.toContain('redis://user:pass');
      expect(resultStr).not.toContain('host:5432');
      expect(resultStr).not.toContain('host:6379');
    });

    it('should call CLI with "variable list --json -s <service>"', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ DATABASE_URL: 'some-value' }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      await service.getServiceConnectionInfo(
        mockToken,
        mockServiceEntity as RailwayServiceEntity,
      );

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'variable',
          args: ['list'],
          flags: expect.arrayContaining(['--json']),
          service: 'railway-svc-id-123',
          railwayToken: mockToken,
        }),
      );
    });

    it('should return empty connectionVariables when CLI returns empty output', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: '{}',
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      const result = await service.getServiceConnectionInfo(
        mockToken,
        mockServiceEntity as RailwayServiceEntity,
      );

      expect(result.connectionVariables).toEqual([]);
    });
  });

  // ---- listServices tests ----

  describe('listServices', () => {
    it('should return all services for a project ordered by deployOrder', async () => {
      const mockServices = [
        { id: 'svc-1', name: 'postgres', serviceType: RailwayServiceType.DATABASE, deployOrder: 0, status: RailwayServiceStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() },
        { id: 'svc-2', name: 'api', serviceType: RailwayServiceType.API, deployOrder: 1, status: RailwayServiceStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() },
        { id: 'svc-3', name: 'frontend', serviceType: RailwayServiceType.WEB, deployOrder: 2, status: RailwayServiceStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockServiceRepo.find.mockResolvedValue(mockServices);

      const result = await service.listServices(mockProjectId, mockWorkspaceId);

      expect(mockServiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: mockProjectId, workspaceId: mockWorkspaceId },
          order: { deployOrder: 'ASC' },
        }),
      );

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('postgres');
      expect(result[1].name).toBe('api');
      expect(result[2].name).toBe('frontend');
    });

    it('should return empty array when no services exist', async () => {
      mockServiceRepo.find.mockResolvedValue([]);

      const result = await service.listServices(mockProjectId, mockWorkspaceId);

      expect(result).toEqual([]);
    });
  });
});

// ============================================================
// Story 24-2: Railway Service Deployment via CLI Tests
// ============================================================

describe('RailwayService - CLI Deployment Methods (Story 24-2)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockDeploymentRepo: any;
  let mockAuditService: any;

  const mockToken = 'railway_test_token';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockRailwayProjectId = 'rp-railway-project-uuid';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  const mockServiceEntity: any = {
    id: 'svc-entity-uuid-1',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    railwayProjectId: mockRailwayProjectId,
    railwayServiceId: 'railway-svc-api-001',
    name: 'api',
    serviceType: RailwayServiceType.API,
    status: RailwayServiceStatus.ACTIVE,
    deployOrder: 1,
    config: {},
    resourceInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    mockCliExecutor = {
      execute: jest.fn(),
    };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockDeploymentRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();

    // Restore mocks after clear
    mockServiceRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' }));
    mockServiceRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockDeploymentRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' }));
    mockDeploymentRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockAuditService.log.mockResolvedValue(undefined);
  });

  // ---- deployService tests ----

  describe('deployService', () => {
    it('should create a RailwayDeployment record before starting deployment', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful\nhttps://api.up.railway.app',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockDeploymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          railwayServiceEntityId: 'svc-entity-uuid-1',
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          status: DeploymentStatus.BUILDING,
        }),
      );
      expect(mockDeploymentRepo.save).toHaveBeenCalled();
    });

    it('should call CLI with "up -s <service>" when service provided', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'up',
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should pass environment flag when environment provided', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        environment: 'staging',
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'up',
          environment: 'staging',
        }),
      );
    });

    it('should update deployment to success on exit code 0', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful\nhttps://api.up.railway.app',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      const result = await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      // The final save should have status success
      const lastSaveCall = mockDeploymentRepo.save.mock.calls[mockDeploymentRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.status).toBe(DeploymentStatus.SUCCESS);
    });

    it('should update deployment to failed on non-zero exit code', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Build failed',
        durationMs: 3000,
        timedOut: false,
      });

      const result = await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      const lastSaveCall = mockDeploymentRepo.save.mock.calls[mockDeploymentRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.status).toBe(DeploymentStatus.FAILED);
      expect(lastSaveCall.errorMessage).toBeDefined();
    });

    it('should update RailwayServiceEntity status to active on success', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: RailwayServiceStatus.ACTIVE,
        }),
      );
    });

    it('should record buildDurationSeconds on completion', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 45000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      const lastSaveCall = mockDeploymentRepo.save.mock.calls[mockDeploymentRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.buildDurationSeconds).toBeDefined();
      expect(typeof lastSaveCall.buildDurationSeconds).toBe('number');
    });

    it('should emit RAILWAY_SERVICE_DEPLOYED audit event on success', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_SERVICE_DEPLOYED,
        'railway_deployment',
        expect.any(String),
        expect.objectContaining({
          serviceId: 'svc-entity-uuid-1',
          serviceName: 'api',
        }),
      );
    });

    it('should not include token in audit log payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      if (mockAuditService.log.mock.calls.length > 0) {
        const auditPayload = mockAuditService.log.mock.calls[0][5];
        expect(JSON.stringify(auditPayload)).not.toContain(mockToken);
      }
    });

    it('should set triggeredBy and triggerType on deployment record', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockDeploymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggeredBy: mockUserId,
          triggerType: 'manual',
        }),
      );
    });
  });

  // ---- deployAllServices tests ----

  describe('deployAllServices', () => {
    const dbService: any = {
      id: 'svc-db-uuid',
      name: 'postgres',
      serviceType: RailwayServiceType.DATABASE,
      status: RailwayServiceStatus.ACTIVE,
      railwayServiceId: 'railway-svc-db-001',
      deployOrder: 0,
      projectId: mockProjectId,
      workspaceId: mockWorkspaceId,
      railwayProjectId: mockRailwayProjectId,
      config: {},
      resourceInfo: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const apiService: any = {
      id: 'svc-api-uuid',
      name: 'api',
      serviceType: RailwayServiceType.API,
      status: RailwayServiceStatus.ACTIVE,
      railwayServiceId: 'railway-svc-api-001',
      deployOrder: 1,
      projectId: mockProjectId,
      workspaceId: mockWorkspaceId,
      railwayProjectId: mockRailwayProjectId,
      config: {},
      resourceInfo: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const webService: any = {
      id: 'svc-web-uuid',
      name: 'frontend',
      serviceType: RailwayServiceType.WEB,
      status: RailwayServiceStatus.ACTIVE,
      railwayServiceId: 'railway-svc-web-001',
      deployOrder: 2,
      projectId: mockProjectId,
      workspaceId: mockWorkspaceId,
      railwayProjectId: mockRailwayProjectId,
      config: {},
      resourceInfo: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should deploy databases (order 0) before APIs (order 1) before frontends (order 2)', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService, apiService, webService]);
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      const result = await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result.services).toHaveLength(3);
      expect(result.status).toBe('success');
    });

    it('should halt deployment if database (order 0) fails', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService, apiService, webService]);

      let callCount = 0;
      mockCliExecutor.execute.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // DB deploy fails
          return Promise.resolve({
            exitCode: 1,
            stdout: '',
            stderr: 'Database deploy failed',
            durationMs: 3000,
            timedOut: false,
          });
        }
        return Promise.resolve({
          exitCode: 0,
          stdout: 'Deploy successful',
          stderr: '',
          durationMs: 5000,
          timedOut: false,
        });
      });

      const result = await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result.status).toBe('failed');
      // API and web should not have been deployed since DB failed
      const apiResult = result.services.find((s: any) => s.serviceName === 'api');
      const webResult = result.services.find((s: any) => s.serviceName === 'frontend');
      // They should either not exist or have a non-success status
      if (apiResult) {
        expect(apiResult.status).not.toBe(DeploymentStatus.SUCCESS);
      }
    });

    it('should return partial_failure when frontend fails but DB and API succeed', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService, apiService, webService]);

      let callCount = 0;
      mockCliExecutor.execute.mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          // Frontend deploy fails
          return Promise.resolve({
            exitCode: 1,
            stdout: '',
            stderr: 'Frontend deploy failed',
            durationMs: 3000,
            timedOut: false,
          });
        }
        return Promise.resolve({
          exitCode: 0,
          stdout: 'Deploy successful',
          stderr: '',
          durationMs: 5000,
          timedOut: false,
        });
      });

      const result = await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result.status).toBe('partial_failure');
    });

    it('should return success when all services deploy successfully', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService, apiService, webService]);
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      const result = await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result.status).toBe('success');
      expect(result.services).toHaveLength(3);
    });

    it('should emit RAILWAY_BULK_DEPLOY_STARTED and RAILWAY_BULK_DEPLOY_COMPLETED audit events', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService]);
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_BULK_DEPLOY_STARTED,
        'railway_deployment',
        expect.any(String),
        expect.objectContaining({
          projectId: mockProjectId,
          serviceCount: 1,
        }),
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED,
        'railway_deployment',
        expect.any(String),
        expect.objectContaining({
          projectId: mockProjectId,
        }),
      );
    });

    it('should return BulkDeploymentResponseDto with per-service status', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService, apiService]);
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      const result = await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result).toHaveProperty('deploymentId');
      expect(result).toHaveProperty('services');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('status');
      expect(result.services[0]).toHaveProperty('serviceId');
      expect(result.services[0]).toHaveProperty('serviceName');
      expect(result.services[0]).toHaveProperty('status');
    });

    it('should fetch services ordered by deployOrder ASC', async () => {
      mockServiceRepo.find.mockResolvedValue([dbService]);
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Deploy successful',
        stderr: '',
        durationMs: 5000,
        timedOut: false,
      });

      await service.deployAllServices(mockToken, {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockServiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: mockProjectId,
            workspaceId: mockWorkspaceId,
          }),
          order: { deployOrder: 'ASC' },
        }),
      );
    });
  });

  // ---- redeployService tests ----

  describe('redeployService', () => {
    it('should call CLI with "redeploy -s <service>"', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Redeployment started',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.redeployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'redeploy',
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should create a RailwayDeployment record with triggerType redeploy', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Redeployment started',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.redeployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockDeploymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'redeploy',
          railwayServiceEntityId: 'svc-entity-uuid-1',
        }),
      );
    });

    it('should update deployment status to success on exit code 0', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Redeployment started',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.redeployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      const lastSaveCall = mockDeploymentRepo.save.mock.calls[mockDeploymentRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.status).toBe(DeploymentStatus.SUCCESS);
    });

    it('should update deployment status to failed on non-zero exit code', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Redeployment failed',
        durationMs: 2000,
        timedOut: false,
      });

      await service.redeployService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      const lastSaveCall = mockDeploymentRepo.save.mock.calls[mockDeploymentRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.status).toBe(DeploymentStatus.FAILED);
    });
  });

  // ---- restartService tests ---- (Story 24-2)

  describe('restartService', () => {
    it('should call CLI with "restart -s <service>"', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Service restarted',
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      await service.restartService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'restart',
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should NOT create a deployment record (restart is not a deployment)', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Service restarted',
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      await service.restartService(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
      expect(mockDeploymentRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException on CLI failure', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Service restart failed',
        durationMs: 1000,
        timedOut: false,
      });

      await expect(
        service.restartService(mockToken, mockServiceEntity, {
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});

// ============================================================
// Story 24-3: Railway Service - Environment Variable Management Tests
// ============================================================

describe('RailwayService - Environment Variable Management (Story 24-3)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockDeploymentRepo: any;
  let mockAuditService: any;

  const mockToken = 'railway_test_token';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const mockServiceEntity: any = {
    id: 'svc-entity-uuid-1',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'rp-railway-project-uuid',
    railwayServiceId: 'railway-svc-api-001',
    name: 'api',
    serviceType: RailwayServiceType.API,
    status: RailwayServiceStatus.ACTIVE,
    deployOrder: 1,
    config: {},
    resourceInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockHttpService = { post: jest.fn() };
    mockCliExecutor = { execute: jest.fn() };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockDeploymentRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();

    mockServiceRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' }));
    mockServiceRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockDeploymentRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' }));
    mockDeploymentRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockAuditService.log.mockResolvedValue(undefined);
  });

  // ---- listServiceVariables tests ----

  describe('listServiceVariables', () => {
    it('should call CLI with "variable list --json -s <service>"', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ DATABASE_URL: 'postgres://...', NODE_ENV: 'production' }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      await service.listServiceVariables(mockToken, mockServiceEntity);

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'variable',
          args: ['list'],
          flags: expect.arrayContaining(['--json']),
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should return variable names with masked=true and present=true', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ DATABASE_URL: 'postgres://user:pass@host/db', API_KEY: 'sk-secret-123' }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      const result = await service.listServiceVariables(mockToken, mockServiceEntity);

      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'DATABASE_URL', masked: true, present: true }),
        expect.objectContaining({ name: 'API_KEY', masked: true, present: true }),
      ]));
    });

    it('should NEVER return actual variable values in the response', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({
          DATABASE_URL: 'postgresql://user:supersecret@host:5432/mydb',
          SECRET_KEY: 'my-super-secret-key-12345',
          REDIS_URL: 'redis://user:redispass@redis-host:6379',
        }),
        stderr: '',
        durationMs: 1000,
        timedOut: false,
      });

      const result = await service.listServiceVariables(mockToken, mockServiceEntity);

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('postgresql://user:supersecret');
      expect(resultStr).not.toContain('my-super-secret-key-12345');
      expect(resultStr).not.toContain('redis://user:redispass');
      expect(resultStr).not.toContain('supersecret');
      expect(resultStr).not.toContain('redispass');
    });

    it('should return empty array when CLI returns empty object', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: '{}', stderr: '', durationMs: 500, timedOut: false,
      });

      const result = await service.listServiceVariables(mockToken, mockServiceEntity);
      expect(result).toEqual([]);
    });

    it('should return empty array when CLI fails', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1, stdout: '', stderr: 'Error', durationMs: 500, timedOut: false,
      });

      const result = await service.listServiceVariables(mockToken, mockServiceEntity);
      expect(result).toEqual([]);
    });

    it('should handle invalid JSON output gracefully', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'not valid json', stderr: '', durationMs: 500, timedOut: false,
      });

      const result = await service.listServiceVariables(mockToken, mockServiceEntity);
      expect(result).toEqual([]);
    });
  });

  // ---- setServiceVariables tests ----

  describe('setServiceVariables', () => {
    it('should call CLI with "variable set KEY=VALUE -s <service>" for each variable', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.setServiceVariables(mockToken, mockServiceEntity, {
        DATABASE_URL: 'postgres://host/db',
        NODE_ENV: 'production',
      }, { workspaceId: mockWorkspaceId, userId: mockUserId });

      expect(mockCliExecutor.execute).toHaveBeenCalledTimes(2);
      // Check that each call contains the correct args pattern
      const calls = mockCliExecutor.execute.mock.calls;
      const argStrings = calls.map((c: any) => c[0].args.join(' '));
      expect(argStrings).toContainEqual(expect.stringContaining('set'));
    });

    it('should emit RAILWAY_ENV_VAR_SET audit event with variable NAMES only', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.setServiceVariables(mockToken, mockServiceEntity, {
        DATABASE_URL: 'postgres://secret-host/db',
        API_KEY: 'sk-very-secret-key',
      }, { workspaceId: mockWorkspaceId, userId: mockUserId });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId, mockUserId, AuditAction.RAILWAY_ENV_VAR_SET,
        'railway_service', mockServiceEntity.id,
        expect.objectContaining({
          variableNames: expect.arrayContaining(['DATABASE_URL', 'API_KEY']),
          serviceId: mockServiceEntity.id,
          serviceName: mockServiceEntity.name,
        }),
      );

      const auditPayload = mockAuditService.log.mock.calls[0][5];
      const payloadStr = JSON.stringify(auditPayload);
      expect(payloadStr).not.toContain('postgres://secret-host');
      expect(payloadStr).not.toContain('sk-very-secret-key');
    });

    it('should trigger redeploy when autoRedeploy=true', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      const deployServiceSpy = jest.spyOn(service, 'deployService').mockResolvedValue({ id: 'deploy-uuid', status: 'success' });

      await service.setServiceVariables(mockToken, mockServiceEntity, { NODE_ENV: 'production' }, {
        workspaceId: mockWorkspaceId, userId: mockUserId, autoRedeploy: true,
      });

      expect(deployServiceSpy).toHaveBeenCalledWith(
        mockToken, mockServiceEntity,
        expect.objectContaining({ workspaceId: mockWorkspaceId, userId: mockUserId }),
      );

      deployServiceSpy.mockRestore();
    });

    it('should NOT trigger redeploy when autoRedeploy=false', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      const deployServiceSpy = jest.spyOn(service, 'deployService').mockResolvedValue({ id: 'deploy-uuid', status: 'success' });

      await service.setServiceVariables(mockToken, mockServiceEntity, { NODE_ENV: 'production' }, {
        workspaceId: mockWorkspaceId, userId: mockUserId, autoRedeploy: false,
      });

      expect(deployServiceSpy).not.toHaveBeenCalled();
      deployServiceSpy.mockRestore();
    });

    it('should NOT trigger redeploy when autoRedeploy is not specified', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      const deployServiceSpy = jest.spyOn(service, 'deployService').mockResolvedValue({ id: 'deploy-uuid', status: 'success' });

      await service.setServiceVariables(mockToken, mockServiceEntity, { NODE_ENV: 'production' }, {
        workspaceId: mockWorkspaceId, userId: mockUserId,
      });

      expect(deployServiceSpy).not.toHaveBeenCalled();
      deployServiceSpy.mockRestore();
    });

    it('should throw BadGatewayException when CLI fails for any variable', async () => {
      let callCount = 0;
      mockCliExecutor.execute.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Error', durationMs: 1000, timedOut: false });
        }
        return Promise.resolve({ exitCode: 0, stdout: 'OK', stderr: '', durationMs: 1000, timedOut: false });
      });

      await expect(
        service.setServiceVariables(mockToken, mockServiceEntity, {
          FIRST_VAR: 'value1', SECOND_VAR: 'value2',
        }, { workspaceId: mockWorkspaceId, userId: mockUserId }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should NOT include token in audit log payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.setServiceVariables(mockToken, mockServiceEntity, { NODE_ENV: 'production' }, {
        workspaceId: mockWorkspaceId, userId: mockUserId,
      });

      const auditPayload = mockAuditService.log.mock.calls[0][5];
      expect(JSON.stringify(auditPayload)).not.toContain(mockToken);
    });

    it('should include variable count in audit payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable set', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.setServiceVariables(mockToken, mockServiceEntity, {
        VAR_1: 'val1', VAR_2: 'val2', VAR_3: 'val3',
      }, { workspaceId: mockWorkspaceId, userId: mockUserId });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId, mockUserId, AuditAction.RAILWAY_ENV_VAR_SET,
        'railway_service', mockServiceEntity.id,
        expect.objectContaining({ variableCount: 3 }),
      );
    });
  });

  // ---- deleteServiceVariable tests ----

  describe('deleteServiceVariable', () => {
    it('should call CLI with "variable delete KEY -s <service>"', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable deleted', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.deleteServiceVariable(mockToken, mockServiceEntity, 'DATABASE_URL', {
        workspaceId: mockWorkspaceId, userId: mockUserId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'variable',
          args: expect.arrayContaining(['delete', 'DATABASE_URL']),
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should emit RAILWAY_ENV_VAR_DELETED audit event with variable name', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable deleted', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.deleteServiceVariable(mockToken, mockServiceEntity, 'OLD_SECRET', {
        workspaceId: mockWorkspaceId, userId: mockUserId,
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId, mockUserId, AuditAction.RAILWAY_ENV_VAR_DELETED,
        'railway_service', mockServiceEntity.id,
        expect.objectContaining({
          variableName: 'OLD_SECRET',
          serviceId: mockServiceEntity.id,
          serviceName: mockServiceEntity.name,
        }),
      );
    });

    it('should throw BadGatewayException when CLI fails', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1, stdout: '', stderr: 'Error: Variable not found', durationMs: 1000, timedOut: false,
      });

      await expect(
        service.deleteServiceVariable(mockToken, mockServiceEntity, 'MISSING_VAR', {
          workspaceId: mockWorkspaceId, userId: mockUserId,
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException when CLI times out', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1, stdout: '', stderr: '', durationMs: 120000, timedOut: true,
      });

      await expect(
        service.deleteServiceVariable(mockToken, mockServiceEntity, 'SOME_VAR', {
          workspaceId: mockWorkspaceId, userId: mockUserId,
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should NOT include token in audit payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0, stdout: 'Variable deleted', stderr: '', durationMs: 1000, timedOut: false,
      });

      await service.deleteServiceVariable(mockToken, mockServiceEntity, 'SOME_VAR', {
        workspaceId: mockWorkspaceId, userId: mockUserId,
      });

      const auditPayload = mockAuditService.log.mock.calls[0][5];
      expect(JSON.stringify(auditPayload)).not.toContain(mockToken);
    });
  });
});

// ============================================================
// Story 24-4: Railway Domain Management Tests
// ============================================================

describe('RailwayService - Domain Management Methods (Story 24-4)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockDeploymentRepo: any;
  let mockAuditService: any;

  const mockToken = 'railway_test_token';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  const mockServiceEntity: any = {
    id: 'svc-entity-uuid-1',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'rp-railway-project-uuid',
    railwayServiceId: 'railway-svc-api-001',
    name: 'api',
    serviceType: RailwayServiceType.API,
    status: RailwayServiceStatus.ACTIVE,
    deployOrder: 1,
    deploymentUrl: null as string | null,
    customDomain: null as string | null,
    config: {},
    resourceInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    mockCliExecutor = {
      execute: jest.fn(),
    };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockDeploymentRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();

    // Restore mocks after clear
    mockServiceRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-entity-uuid' }));
    mockServiceRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-entity-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockDeploymentRepo.create.mockImplementation((dto: any) => ({ ...dto, id: dto.id || 'new-deploy-uuid' }));
    mockDeploymentRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deploy-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockAuditService.log.mockResolvedValue(undefined);
  });

  // ---- addDomain tests ----

  describe('addDomain', () => {
    it('should call CLI with "domain example.com -s <service>" for custom domain', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added\nCNAME: example.com -> railway-svc-api-001.up.railway.app',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'domain',
          args: ['example.com'],
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
    });

    it('should call CLI with "domain -s <service>" when no custom domain (generate Railway domain)', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain generated: api-production.up.railway.app',
        stderr: '',
        durationMs: 1500,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'domain',
          service: 'railway-svc-api-001',
          railwayToken: mockToken,
        }),
      );
      // Should NOT have custom domain in args
      const callArgs = mockCliExecutor.execute.mock.calls[0][0];
      expect(callArgs.args || []).not.toContain('example.com');
    });

    it('should update RailwayServiceEntity.customDomain for custom domains', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added\nCNAME: example.com -> target.railway.app',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customDomain: 'example.com',
        }),
      );
    });

    it('should update RailwayServiceEntity.deploymentUrl for Railway-generated domains', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain generated: api-production.up.railway.app',
        stderr: '',
        durationMs: 1500,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentUrl: expect.stringContaining('.up.railway.app'),
        }),
      );
    });

    it('should return DomainResponseDto with correct fields', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added\nCNAME: example.com -> target.railway.app',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      const result = await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('status');
    });

    it('should return DNS instructions for custom domains', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added\nCNAME: example.com -> railway-svc-api-001.up.railway.app',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      const result = await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      expect(result.type).toBe('custom');
      expect(result.dnsInstructions).toBeDefined();
      expect(result.dnsInstructions?.type).toBe('CNAME');
    });

    it('should return railway type for generated domains', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain generated: api-production.up.railway.app',
        stderr: '',
        durationMs: 1500,
        timedOut: false,
      });

      const result = await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
      });

      expect(result.type).toBe('railway');
    });

    it('should emit RAILWAY_DOMAIN_ADDED audit event on success', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_DOMAIN_ADDED,
        'railway_service',
        expect.any(String),
        expect.objectContaining({
          domain: 'example.com',
          serviceName: 'api',
        }),
      );
    });

    it('should throw BadGatewayException when CLI exits with non-zero code', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: Failed to add domain',
        durationMs: 1000,
        timedOut: false,
      });

      await expect(
        service.addDomain(mockToken, mockServiceEntity, {
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          customDomain: 'example.com',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException when CLI times out', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs: 120000,
        timedOut: true,
      });

      await expect(
        service.addDomain(mockToken, mockServiceEntity, {
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          customDomain: 'example.com',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should not include token in audit log payload', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Domain example.com added',
        stderr: '',
        durationMs: 2000,
        timedOut: false,
      });

      await service.addDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        customDomain: 'example.com',
      });

      if (mockAuditService.log.mock.calls.length > 0) {
        const auditPayload = mockAuditService.log.mock.calls[0][5];
        expect(JSON.stringify(auditPayload)).not.toContain(mockToken);
      }
    });
  });

  // ---- removeDomain tests ----

  describe('removeDomain', () => {
    it('should call Railway GraphQL API to remove domain', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: { domainDelete: true },
        })),
      );

      await service.removeDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        domain: 'example.com',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.any(String),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer railway_test_token',
          }),
        }),
      );
    });

    it('should clear customDomain from entity when custom domain removed', async () => {
      const entityWithDomain = {
        ...mockServiceEntity,
        customDomain: 'example.com',
      };

      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: { domainDelete: true },
        })),
      );

      await service.removeDomain(mockToken, entityWithDomain, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        domain: 'example.com',
      });

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customDomain: null,
        }),
      );
    });

    it('should clear deploymentUrl from entity when Railway domain removed', async () => {
      const entityWithRailwayDomain = {
        ...mockServiceEntity,
        deploymentUrl: 'api-production.up.railway.app',
      };

      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: { domainDelete: true },
        })),
      );

      await service.removeDomain(mockToken, entityWithRailwayDomain, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        domain: 'api-production.up.railway.app',
      });

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentUrl: null,
        }),
      );
    });

    it('should emit RAILWAY_DOMAIN_REMOVED audit event', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: { domainDelete: true },
        })),
      );

      await service.removeDomain(mockToken, mockServiceEntity, {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        domain: 'example.com',
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_DOMAIN_REMOVED,
        'railway_service',
        expect.any(String),
        expect.objectContaining({
          domain: 'example.com',
          serviceName: 'api',
        }),
      );
    });

    it('should throw BadGatewayException when GraphQL API fails', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          errors: [{ message: 'Domain removal failed' }],
        })),
      );

      await expect(
        service.removeDomain(mockToken, mockServiceEntity, {
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          domain: 'example.com',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ---- getDomains tests ----

  describe('getDomains', () => {
    it('should call Railway GraphQL API for domain info', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            domains: {
              edges: [
                {
                  node: {
                    domain: 'api-production.up.railway.app',
                    status: { dnsStatus: 'DNS_ACTIVE' },
                  },
                },
                {
                  node: {
                    domain: 'example.com',
                    status: { dnsStatus: 'DNS_PENDING' },
                  },
                },
              ],
            },
          },
        })),
      );

      const result = await service.getDomains(mockToken, mockServiceEntity);

      expect(mockHttpService.post).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should return domains with correct status mapping', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            domains: {
              edges: [
                {
                  node: {
                    domain: 'api-production.up.railway.app',
                    status: { dnsStatus: 'DNS_ACTIVE' },
                  },
                },
              ],
            },
          },
        })),
      );

      const result = await service.getDomains(mockToken, mockServiceEntity);

      expect(result[0].domain).toBe('api-production.up.railway.app');
      expect(result[0].status).toBe('active');
    });

    it('should classify Railway domains vs custom domains by type', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            domains: {
              edges: [
                {
                  node: {
                    domain: 'api-production.up.railway.app',
                    status: { dnsStatus: 'DNS_ACTIVE' },
                  },
                },
                {
                  node: {
                    domain: 'example.com',
                    status: { dnsStatus: 'DNS_PENDING' },
                  },
                },
              ],
            },
          },
        })),
      );

      const result = await service.getDomains(mockToken, mockServiceEntity);

      const railwayDomain = result.find(d => d.domain.includes('.up.railway.app'));
      const customDomain = result.find(d => d.domain === 'example.com');

      expect(railwayDomain?.type).toBe('railway');
      expect(customDomain?.type).toBe('custom');
    });

    it('should return empty array when no domains exist', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            domains: {
              edges: [],
            },
          },
        })),
      );

      const result = await service.getDomains(mockToken, mockServiceEntity);

      expect(result).toEqual([]);
    });

    it('should map pending DNS status correctly', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            domains: {
              edges: [
                {
                  node: {
                    domain: 'example.com',
                    status: { dnsStatus: 'DNS_PENDING' },
                  },
                },
              ],
            },
          },
        })),
      );

      const result = await service.getDomains(mockToken, mockServiceEntity);

      expect(result[0].status).toBe('pending_dns');
    });

    it('should throw BadGatewayException when GraphQL API fails', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          errors: [{ message: 'Failed to fetch domains' }],
        })),
      );

      await expect(
        service.getDomains(mockToken, mockServiceEntity),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});

// ============================================================
// Story 24-5: Railway Service - Log Streaming & Deployment History Tests
// ============================================================

describe('RailwayService - Log Streaming & Deployment History (Story 24-5)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockDeploymentRepo: any;
  let mockAuditService: any;

  const mockToken = 'railway_test_token';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const mockServiceEntity = {
    id: 'svc-entity-uuid',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'rp-railway-project-uuid',
    railwayServiceId: 'railway-svc-id-123',
    name: 'api-service',
    serviceType: RailwayServiceType.API,
    status: RailwayServiceStatus.ACTIVE,
    deploymentUrl: 'https://api-service.up.railway.app',
    customDomain: undefined,
    deployOrder: 1,
    config: {},
    resourceInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    mockCliExecutor = {
      execute: jest.fn(),
    };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: 'new-service-entity-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-service-entity-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockDeploymentRepo = {
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: 'new-deployment-uuid' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deployment-uuid', createdAt: new Date(), updatedAt: new Date() })),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();

    // Restore mocks after clear
    mockDeploymentRepo.create.mockImplementation((dto: any) => ({ ...dto, id: 'new-deployment-uuid' }));
    mockDeploymentRepo.save.mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'new-deployment-uuid', createdAt: new Date(), updatedAt: new Date() }));
    mockAuditService.log.mockResolvedValue(undefined);
  });

  // ---- streamLogs tests ----

  describe('streamLogs', () => {
    it('should call CLI with logs -s <service>', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Log line 1\nLog line 2\n',
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      const logLines: string[] = [];
      await service.streamLogs(mockToken, mockServiceEntity, {
        onLog: (line: string) => logLines.push(line),
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'logs',
          service: 'railway-svc-id-123',
          railwayToken: mockToken,
        }),
      );
    });

    it('should call CLI with --build flag when buildLogs is true', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Build log 1\n',
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      await service.streamLogs(mockToken, mockServiceEntity, {
        buildLogs: true,
        onLog: jest.fn(),
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'logs',
          flags: expect.arrayContaining(['--build']),
        }),
      );
    });

    it('should call CLI with -n <count> flag when lines is provided', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Log line 1\n',
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      await service.streamLogs(mockToken, mockServiceEntity, {
        lines: 100,
        onLog: jest.fn(),
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'logs',
          flags: expect.arrayContaining(['-n', '100']),
        }),
      );
    });

    it('should call onLog callback for each log line from stdout', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Line 1\nLine 2\nLine 3',
        stderr: '',
        durationMs: 500,
        timedOut: false,
      });

      const logLines: string[] = [];
      await service.streamLogs(mockToken, mockServiceEntity, {
        onLog: (line: string) => logLines.push(line),
      });

      expect(logLines.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw BadGatewayException on CLI failure', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Permission denied',
        durationMs: 500,
        timedOut: false,
      });

      await expect(
        service.streamLogs(mockToken, mockServiceEntity, {
          onLog: jest.fn(),
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on CLI timeout', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs: 120000,
        timedOut: true,
      });

      await expect(
        service.streamLogs(mockToken, mockServiceEntity, {
          onLog: jest.fn(),
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ---- getDeploymentHistory tests ----

  describe('getDeploymentHistory', () => {
    const mockDeployments = [
      {
        id: 'deploy-1',
        railwayServiceEntityId: 'svc-entity-uuid',
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        railwayDeploymentId: 'rd-1',
        status: DeploymentStatus.SUCCESS,
        deploymentUrl: 'https://app.railway.app',
        triggeredBy: mockUserId,
        triggerType: 'manual',
        buildDurationSeconds: 30,
        deployDurationSeconds: 15,
        createdAt: new Date('2026-03-01T10:00:00Z'),
        updatedAt: new Date('2026-03-01T10:01:00Z'),
        startedAt: new Date('2026-03-01T10:00:00Z'),
        completedAt: new Date('2026-03-01T10:00:45Z'),
        meta: {},
      },
      {
        id: 'deploy-2',
        railwayServiceEntityId: 'svc-entity-uuid',
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        railwayDeploymentId: 'rd-2',
        status: DeploymentStatus.FAILED,
        triggeredBy: mockUserId,
        triggerType: 'manual',
        errorMessage: 'Build failed',
        createdAt: new Date('2026-03-01T09:00:00Z'),
        updatedAt: new Date('2026-03-01T09:01:00Z'),
        startedAt: new Date('2026-03-01T09:00:00Z'),
        completedAt: new Date('2026-03-01T09:00:30Z'),
        meta: {},
      },
    ];

    it('should return deployments ordered by createdAt DESC', async () => {
      mockDeploymentRepo.findAndCount.mockResolvedValue([mockDeployments, 2]);

      const result = await service.getDeploymentHistory('svc-entity-uuid', {});

      expect(mockDeploymentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            railwayServiceEntityId: 'svc-entity-uuid',
          }),
          order: { createdAt: 'DESC' },
        }),
      );
      expect(result.deployments).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should support pagination with correct skip and take', async () => {
      mockDeploymentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getDeploymentHistory('svc-entity-uuid', {
        page: 2,
        limit: 5,
      });

      expect(mockDeploymentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it('should use default pagination when not specified', async () => {
      mockDeploymentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getDeploymentHistory('svc-entity-uuid', {});

      expect(mockDeploymentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockDeploymentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getDeploymentHistory('svc-entity-uuid', {
        status: DeploymentStatus.SUCCESS,
      });

      expect(mockDeploymentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: DeploymentStatus.SUCCESS,
          }),
        }),
      );
    });

    it('should return empty array when no deployments found', async () => {
      mockDeploymentRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getDeploymentHistory('svc-entity-uuid', {});

      expect(result.deployments).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ---- getDeploymentById tests ----

  describe('getDeploymentById', () => {
    it('should return deployment when found', async () => {
      const mockDeployment = {
        id: 'deploy-1',
        railwayServiceEntityId: 'svc-entity-uuid',
        status: DeploymentStatus.SUCCESS,
        workspaceId: mockWorkspaceId,
      };
      mockDeploymentRepo.findOne.mockResolvedValue(mockDeployment);

      const result = await service.getDeploymentById('deploy-1', mockWorkspaceId);

      expect(result).toEqual(mockDeployment);
      expect(mockDeploymentRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'deploy-1', workspaceId: mockWorkspaceId },
      });
    });

    it('should return null when not found', async () => {
      mockDeploymentRepo.findOne.mockResolvedValue(null);

      const result = await service.getDeploymentById('nonexistent', mockWorkspaceId);

      expect(result).toBeNull();
    });
  });

  // ---- rollbackDeployment tests ----

  describe('rollbackDeployment', () => {
    const targetDeployment = {
      id: 'deploy-old',
      railwayServiceEntityId: 'svc-entity-uuid',
      projectId: mockProjectId,
      workspaceId: mockWorkspaceId,
      railwayDeploymentId: 'railway-deploy-old-id',
      status: DeploymentStatus.SUCCESS,
      deploymentUrl: 'https://app.railway.app',
      meta: {},
    };

    it('should create new deployment with triggerType rollback', async () => {
      mockDeploymentRepo.findOne.mockResolvedValue(targetDeployment);
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            deploymentRedeploy: {
              id: 'railway-new-deploy-id',
              status: 'BUILDING',
              createdAt: '2026-03-01T12:00:00Z',
              updatedAt: '2026-03-01T12:00:00Z',
              projectId: mockProjectId,
              environmentId: 'env-1',
            },
          },
        })),
      );

      const result = await service.rollbackDeployment(
        mockToken,
        mockServiceEntity,
        'deploy-old',
        { workspaceId: mockWorkspaceId, userId: mockUserId },
      );

      expect(mockDeploymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'rollback',
          railwayServiceEntityId: mockServiceEntity.id,
        }),
      );
      expect(mockDeploymentRepo.save).toHaveBeenCalled();
    });

    it('should call redeployDeployment GraphQL with target deployment ID', async () => {
      mockDeploymentRepo.findOne.mockResolvedValue(targetDeployment);
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            deploymentRedeploy: {
              id: 'railway-new-deploy-id',
              status: 'BUILDING',
              createdAt: '2026-03-01T12:00:00Z',
              updatedAt: '2026-03-01T12:00:00Z',
              projectId: mockProjectId,
              environmentId: 'env-1',
            },
          },
        })),
      );

      await service.rollbackDeployment(
        mockToken,
        mockServiceEntity,
        'deploy-old',
        { workspaceId: mockWorkspaceId, userId: mockUserId },
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('deploymentRedeploy'),
          variables: { id: 'railway-deploy-old-id' },
        }),
        expect.any(Object),
      );
    });

    it('should emit RAILWAY_DEPLOYMENT_ROLLED_BACK audit event', async () => {
      mockDeploymentRepo.findOne.mockResolvedValue(targetDeployment);
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({
          data: {
            deploymentRedeploy: {
              id: 'railway-new-deploy-id',
              status: 'BUILDING',
              createdAt: '2026-03-01T12:00:00Z',
              updatedAt: '2026-03-01T12:00:00Z',
              projectId: mockProjectId,
              environmentId: 'env-1',
            },
          },
        })),
      );

      await service.rollbackDeployment(
        mockToken,
        mockServiceEntity,
        'deploy-old',
        { workspaceId: mockWorkspaceId, userId: mockUserId },
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK,
        'railway_deployment',
        expect.any(String),
        expect.objectContaining({
          serviceId: mockServiceEntity.id,
          rollbackFromDeploymentId: 'deploy-old',
        }),
      );
    });

    it('should throw NotFoundException when target deployment not found', async () => {
      mockDeploymentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.rollbackDeployment(
          mockToken,
          mockServiceEntity,
          'nonexistent',
          { workspaceId: mockWorkspaceId, userId: mockUserId },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- checkHealth tests ----

  describe('checkHealth', () => {
    it('should return connected:true with username when token is valid', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Logged in as testuser (test@example.com)',
        stderr: '',
        durationMs: 200,
        timedOut: false,
      });

      const result = await service.checkHealth(mockToken);

      expect(result.connected).toBe(true);
      expect(result.username).toBeDefined();
      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'whoami',
          railwayToken: mockToken,
        }),
      );
    });

    it('should return connected:false with error when token is invalid', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Not logged in',
        durationMs: 200,
        timedOut: false,
      });

      const result = await service.checkHealth(mockToken);

      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return connected:false on CLI timeout', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs: 120000,
        timedOut: true,
      });

      const result = await service.checkHealth(mockToken);

      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
