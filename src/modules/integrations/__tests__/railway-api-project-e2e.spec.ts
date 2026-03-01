import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { RailwayService } from '../railway/railway.service';
import { RailwayCliExecutor } from '../railway/railway-cli-executor.service';
import { RailwayServiceEntity } from '../../../database/entities/railway-service.entity';
import { RailwayDeployment } from '../../../database/entities/railway-deployment.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { DeploymentEventPublisher } from '../railway/deployment-event-publisher.service';
import {
  MOCK_RAILWAY_PROJECT_ID,
  createAxiosResponse,
  createMockProjectResponse,
} from './railway-test-helpers';

/**
 * Railway API Project Operations E2E Tests
 * Story 15-4: AC5 - Project creation via GraphQL API
 */
describe('Railway E2E - API Project Operations', () => {
  let railwayService: RailwayService;
  let mockHttpService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: { execute: jest.fn() } },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(RailwayDeployment), useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: DeploymentEventPublisher, useValue: { publish: jest.fn().mockResolvedValue(undefined), publishLog: jest.fn().mockResolvedValue(undefined), publishDeploymentStarted: jest.fn().mockResolvedValue(undefined), publishDeploymentStatus: jest.fn().mockResolvedValue(undefined), publishDeploymentCompleted: jest.fn().mockResolvedValue(undefined), publishDeploymentLog: jest.fn().mockResolvedValue(undefined), publishEnvChanged: jest.fn().mockResolvedValue(undefined), publishServiceProvisioned: jest.fn().mockResolvedValue(undefined), publishDomainUpdated: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    railwayService = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC5: Railway Project Creation', () => {
    it('should create project with correct GraphQL mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockProjectResponse())),
      );

      const result = await railwayService.createProject('test-token', {
        name: 'my-app',
        description: 'My App',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('projectCreate'),
          variables: {
            input: { name: 'my-app', description: 'My App' },
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe(MOCK_RAILWAY_PROJECT_ID);
      expect(result.name).toBe('my-app');
      expect(result.projectUrl).toBe(
        `https://railway.app/project/${MOCK_RAILWAY_PROJECT_ID}`,
      );
      expect(result.environments).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should map environments from GraphQL relay edge/node format', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockProjectResponse())),
      );

      const result = await railwayService.createProject('test-token', {
        name: 'my-app',
      });

      expect(result.environments).toEqual([
        { id: 'env-prod-1', name: 'production' },
        { id: 'env-staging-1', name: 'staging' },
      ]);
    });

    it('should throw ConflictException when Railway returns duplicate name error', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: null,
            errors: [{ message: 'Project already exists with this name' }],
          }),
        ),
      );

      await expect(
        railwayService.createProject('test-token', { name: 'existing-app' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for generic Railway API errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Network error');
          error.response = { status: 500 };
          return error;
        }),
      );

      await expect(
        railwayService.createProject('test-token', { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should link GitHub repo to Railway project via serviceCreate mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            data: {
              serviceCreate: { id: 'svc-1', name: 'my-repo' },
            },
          }),
        ),
      );

      await railwayService.linkGitHubRepoToProject(
        'test-token',
        'railway-id',
        'user/repo',
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('serviceCreate'),
          variables: {
            input: {
              projectId: 'railway-id',
              source: { repo: 'user/repo' },
            },
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should not throw when linkGitHubRepoToProject fails (logs warning)', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Link failed')),
      );

      // Should NOT throw
      await expect(
        railwayService.linkGitHubRepoToProject(
          'test-token',
          'railway-id',
          'user/repo',
        ),
      ).resolves.toBeUndefined();
    });
  });
});
