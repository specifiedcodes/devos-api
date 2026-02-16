import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { RailwayService } from '../railway/railway.service';
import {
  MOCK_RAILWAY_PROJECT_ID,
  createAxiosResponse,
  createMockDeploymentTriggerResponse,
  createMockDeploymentQueryResponse,
  createMockDeploymentListResponse,
  createMockRedeployResponse,
} from './railway-test-helpers';

/**
 * Railway API Deployment Operations E2E Tests
 * Story 15-4: AC6 - Deployment operations via GraphQL API
 */
describe('Railway E2E - API Deployment Operations', () => {
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
      ],
    }).compile();

    railwayService = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC6: Railway Deployment Operations', () => {
    it('should trigger deployment with correct GraphQL mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockDeploymentTriggerResponse())),
      );

      const result = await railwayService.triggerDeployment('test-token', {
        projectId: 'proj-1',
        environmentId: 'env-1',
        branch: 'main',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('deploymentTriggerCreate'),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result.id).toBe('deploy-123');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe('proj-1');
      expect(result.environmentId).toBeDefined();
      expect(result.branch).toBe('main');
      expect(result.createdAt).toBeDefined();
    });

    it('should get deployment with mapped status', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockDeploymentQueryResponse('SUCCESS'))),
      );

      const result = await railwayService.getDeployment('test-token', 'deploy-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('success');
      expect(result!.id).toBe('deploy-123');
      expect(result!.projectId).toBe(MOCK_RAILWAY_PROJECT_ID);
    });

    it('should return null for not-found deployment', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ data: { deployment: null } })),
      );

      const result = await railwayService.getDeployment('test-token', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should map all Railway deployment statuses correctly', async () => {
      const statusMappings: Record<string, string> = {
        BUILDING: 'building',
        DEPLOYING: 'deploying',
        SUCCESS: 'success',
        FAILED: 'failed',
        CRASHED: 'crashed',
        REMOVED: 'removed',
        QUEUED: 'queued',
        WAITING: 'waiting',
      };

      for (const [railwayStatus, expectedStatus] of Object.entries(statusMappings)) {
        mockHttpService.post.mockReturnValueOnce(
          of(createAxiosResponse(createMockDeploymentQueryResponse(railwayStatus))),
        );

        const result = await railwayService.getDeployment('test-token', 'deploy-1');
        expect(result!.status).toBe(expectedStatus);
      }
    });

    it('should map unknown Railway status to "unknown"', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockDeploymentQueryResponse('SOME_NEW_STATUS'))),
      );

      const result = await railwayService.getDeployment('test-token', 'deploy-1');
      expect(result!.status).toBe('unknown');
    });

    it('should list deployments with pagination', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockDeploymentListResponse(3))),
      );

      const result = await railwayService.listDeployments('test-token', 'proj-1', {
        first: 5,
      });

      expect(result.deployments).toHaveLength(3);
      expect(result.total).toBe(3);
      result.deployments.forEach((d) => {
        expect(d.id).toBeDefined();
        expect(d.status).toBe('success');
        expect(d.projectId).toBe(MOCK_RAILWAY_PROJECT_ID);
      });
    });

    it('should pass environmentId filter to list deployments', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockDeploymentListResponse(1))),
      );

      await railwayService.listDeployments('test-token', 'proj-1', {
        environmentId: 'env-1',
      });

      const callArgs = mockHttpService.post.mock.calls[0];
      expect(callArgs[1].variables).toEqual(
        expect.objectContaining({
          environmentId: 'env-1',
        }),
      );
    });

    it('should redeploy deployment for rollback', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockRedeployResponse())),
      );

      const result = await railwayService.redeployDeployment('test-token', 'deploy-1');

      const callArgs = mockHttpService.post.mock.calls[0];
      expect(callArgs[1].query).toContain('deploymentRedeploy');

      expect(result.id).toBe('deploy-new-123');
      expect(result.status).toBe('building');
      expect(result.projectId).toBe(MOCK_RAILWAY_PROJECT_ID);
    });

    it('should throw BadGatewayException for Railway API errors on deployment operations', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server error');
          error.response = { status: 500 };
          return error;
        }),
      );

      await expect(
        railwayService.triggerDeployment('test-token', { projectId: 'proj-1' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for rate limit (429) on triggerDeployment', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate limit exceeded');
          error.response = { status: 429 };
          return error;
        }),
      );

      await expect(
        railwayService.triggerDeployment('test-token', { projectId: 'proj-1' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException with rate limit message on getDeployment 429', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate limit exceeded');
          error.response = { status: 429 };
          return error;
        }),
      );

      await expect(
        railwayService.getDeployment('test-token', 'deploy-1'),
      ).rejects.toThrow(expect.objectContaining({
        message: expect.stringContaining('rate limit'),
      }));
    });
  });
});
