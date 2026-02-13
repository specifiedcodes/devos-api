import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { VercelService } from './vercel.service';

describe('VercelService', () => {
  let service: VercelService;
  let mockHttpService: any;

  const mockToken = 'vercel_test_token';

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
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VercelService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<VercelService>(VercelService);
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    const mockProjectResponse = {
      id: 'vercel-project-id',
      name: 'my-app',
      framework: 'nextjs',
      createdAt: 1706788800000,
      latestDeployments: [],
    };

    it('should call Vercel REST API with correct payload and return project details', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      const result = await service.createProject(mockToken, {
        name: 'my-app',
        framework: 'nextjs',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v9/projects',
        expect.objectContaining({
          name: 'my-app',
          framework: 'nextjs',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer vercel_test_token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe('vercel-project-id');
      expect(result.name).toBe('my-app');
      expect(result.framework).toBe('nextjs');
      expect(result.projectUrl).toContain('my-app');
    });

    it('should throw ConflictException when project name exists (Vercel 409)', async () => {
      const error = {
        response: {
          status: 409,
          data: { error: { message: 'Project already exists' } },
        },
        message: 'Request failed with status code 409',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createProject(mockToken, { name: 'existing-app' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for Vercel API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Internal server error' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createProject(mockToken, { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should include gitRepository when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      await service.createProject(mockToken, {
        name: 'my-app',
        gitRepository: { type: 'github', repo: 'owner/repo' },
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v9/projects',
        expect.objectContaining({
          name: 'my-app',
          gitRepository: { type: 'github', repo: 'owner/repo' },
        }),
        expect.any(Object),
      );
    });

    it('should omit gitRepository when not provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      await service.createProject(mockToken, {
        name: 'my-app',
      });

      const callArgs = mockHttpService.post.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('gitRepository');
    });

    it('should set framework when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      await service.createProject(mockToken, {
        name: 'my-app',
        framework: 'react',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v9/projects',
        expect.objectContaining({
          framework: 'react',
        }),
        expect.any(Object),
      );
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

  describe('triggerDeployment', () => {
    const mockDeploymentResponse = {
      id: 'deployment-id',
      readyState: 'BUILDING',
      url: 'my-app-abc123.vercel.app',
      createdAt: 1706789100000,
      meta: {},
    };

    it('should call Vercel REST API with correct payload', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockDeploymentResponse)),
      );

      const result = await service.triggerDeployment(mockToken, {
        projectId: 'vercel-project-id',
        name: 'my-app',
        target: 'production',
        ref: 'main',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v13/deployments',
        expect.objectContaining({
          name: 'my-app',
          project: 'vercel-project-id',
          target: 'production',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer vercel_test_token',
          }),
        }),
      );

      expect(result.id).toBe('deployment-id');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe('vercel-project-id');
    });

    it('should return deployment details with BUILDING status', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockDeploymentResponse)),
      );

      const result = await service.triggerDeployment(mockToken, {
        projectId: 'vercel-project-id',
        name: 'my-app',
      });

      expect(result.status).toBe('building');
      expect(result.url).toBe('my-app-abc123.vercel.app');
      expect(result.readyState).toBe('BUILDING');
    });

    it('should throw BadGatewayException for Vercel API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Deployment failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.triggerDeployment(mockToken, {
          projectId: 'vercel-project-id',
          name: 'my-app',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getDeployment', () => {
    const createDeploymentResponse = (readyState: string) => ({
      id: 'deployment-id',
      readyState,
      projectId: 'vercel-project-id',
      url: 'my-app-abc123.vercel.app',
      target: 'production',
      createdAt: 1706789100000,
      ready: readyState === 'READY' ? 1706789280000 : undefined,
      meta: { githubCommitSha: 'abc123', githubCommitMessage: 'feat: add login' },
    });

    it('should return deployment with mapped status', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentResponse('READY'))),
      );

      const result = await service.getDeployment(
        mockToken,
        'deployment-id',
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('deployment-id');
      expect(result!.status).toBe('success');
      expect(result!.url).toBe('my-app-abc123.vercel.app');
    });

    it('should return null for 404', async () => {
      const error = {
        response: {
          status: 404,
          data: { error: { message: 'Deployment not found' } },
        },
        message: 'Request failed with status code 404',
      };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.getDeployment(
        mockToken,
        'nonexistent-id',
      );

      expect(result).toBeNull();
    });

    it('should map all Vercel states correctly', async () => {
      const statusMap: Record<string, string> = {
        BUILDING: 'building',
        INITIALIZING: 'building',
        QUEUED: 'queued',
        READY: 'success',
        ERROR: 'failed',
        CANCELED: 'canceled',
      };

      for (const [vercelState, expectedStatus] of Object.entries(statusMap)) {
        mockHttpService.get.mockReturnValue(
          of(createAxiosResponse(createDeploymentResponse(vercelState))),
        );

        const result = await service.getDeployment(
          mockToken,
          'deployment-id',
        );

        expect(result!.status).toBe(expectedStatus);
      }
    });

    it('should map unknown status to "unknown"', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentResponse('UNKNOWN_STATE'))),
      );

      const result = await service.getDeployment(
        mockToken,
        'deployment-id',
      );

      expect(result!.status).toBe('unknown');
    });
  });

  describe('listDeployments', () => {
    const mockListResponse = {
      deployments: [
        {
          uid: 'dep-1',
          readyState: 'READY',
          url: 'my-app-abc123.vercel.app',
          target: 'production',
          createdAt: 1706789100000,
          meta: { githubCommitRef: 'main' },
        },
        {
          uid: 'dep-2',
          readyState: 'BUILDING',
          url: null,
          target: 'preview',
          createdAt: 1706789400000,
          meta: { githubCommitRef: 'feature' },
        },
      ],
      pagination: { count: 5 },
    };

    it('should return paginated deployment list', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockListResponse)),
      );

      const result = await service.listDeployments(
        mockToken,
        'vercel-project-id',
      );

      expect(result.deployments).toHaveLength(2);
      expect(result.deployments[0].id).toBe('dep-1');
      expect(result.deployments[0].status).toBe('success');
      expect(result.deployments[1].status).toBe('building');
      expect(result.total).toBe(5);
    });

    it('should filter by target when provided', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockListResponse)),
      );

      await service.listDeployments(mockToken, 'vercel-project-id', {
        target: 'production',
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('target=production'),
        expect.any(Object),
      );
    });

    it('should filter by state when provided', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockListResponse)),
      );

      await service.listDeployments(mockToken, 'vercel-project-id', {
        state: 'READY',
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('state=READY'),
        expect.any(Object),
      );
    });
  });

  describe('upsertEnvironmentVariables', () => {
    it('should call Vercel REST API for variables', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ created: [{ key: 'DATABASE_URL' }] })),
      );

      await service.upsertEnvironmentVariables(
        mockToken,
        'vercel-project-id',
        [
          {
            key: 'DATABASE_URL',
            value: 'postgresql://...',
            target: ['production', 'preview'],
            type: 'encrypted',
          },
          {
            key: 'NODE_ENV',
            value: 'production',
            target: ['production'],
            type: 'plain',
          },
        ],
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v10/projects/vercel-project-id/env',
        expect.arrayContaining([
          expect.objectContaining({
            key: 'DATABASE_URL',
            value: 'postgresql://...',
            target: ['production', 'preview'],
            type: 'encrypted',
          }),
          expect.objectContaining({
            key: 'NODE_ENV',
            value: 'production',
            target: ['production'],
            type: 'plain',
          }),
        ]),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer vercel_test_token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Variable update failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.upsertEnvironmentVariables(
          mockToken,
          'vercel-project-id',
          [{ key: 'NODE_ENV', value: 'production' }],
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('redeployDeployment', () => {
    const mockRedeployResponse = {
      id: 'new-deployment-id',
      readyState: 'BUILDING',
      projectId: 'vercel-project-id',
      url: 'my-app-new123.vercel.app',
      createdAt: 1706789100000,
      meta: {},
    };

    it('should successfully redeploy a deployment', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockRedeployResponse)),
      );

      const result = await service.redeployDeployment(
        mockToken,
        'target-deployment-id',
        'my-app',
        'production',
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v13/deployments',
        expect.objectContaining({
          name: 'my-app',
          target: 'production',
          deploymentId: 'target-deployment-id',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer vercel_test_token',
          }),
        }),
      );

      expect(result.id).toBe('new-deployment-id');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe('vercel-project-id');
      expect(result.url).toBe('my-app-new123.vercel.app');
      expect(result.target).toBe('production');
    });

    it('should throw BadGatewayException on API error', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Deployment failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.redeployDeployment(
          mockToken,
          'target-deployment-id',
          'my-app',
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on not-found deployment (404 returns null from executeRequest)', async () => {
      const error = {
        response: {
          status: 404,
          data: { error: { message: 'Deployment not found' } },
        },
        message: 'Request failed with status code 404',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      // executeRequest returns null for 404, redeployDeployment throws BadGatewayException
      await expect(
        service.redeployDeployment(
          mockToken,
          'nonexistent-deployment-id',
          'my-app',
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('mapDeploymentStatus (via getDeployment)', () => {
    const createDeploymentData = (readyState: string) => ({
      id: 'dep-1',
      readyState,
      projectId: 'proj-1',
      createdAt: 1706789100000,
    });

    it('should map BUILDING to building', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('BUILDING'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('building');
    });

    it('should map INITIALIZING to building', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('INITIALIZING'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('building');
    });

    it('should map QUEUED to queued', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('QUEUED'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('queued');
    });

    it('should map READY to success', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('READY'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('success');
    });

    it('should map ERROR to failed', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('ERROR'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('failed');
    });

    it('should map CANCELED to canceled', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('CANCELED'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('canceled');
    });

    it('should map unknown status to unknown', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createDeploymentData('SOME_NEW_STATUS'))),
      );
      const result = await service.getDeployment(mockToken, 'dep-1');
      expect(result!.status).toBe('unknown');
    });
  });
});
