import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { RailwayService } from './railway.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
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
