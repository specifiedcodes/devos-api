import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { VercelService } from '../vercel/vercel.service';
import {
  MOCK_VERCEL_PROJECT_ID,
  createAxiosResponse,
  createMockVercelDeploymentResponse,
  createMockVercelDeploymentListResponse,
  createMockVercelRedeployResponse,
} from './vercel-test-helpers';

/**
 * Vercel API Deployment Operations E2E Tests
 * Story 15-5: AC6 - Deployment triggering, status, listing, and redeploy
 */
describe('Vercel E2E - API Deployment Operations', () => {
  let vercelService: VercelService;
  let mockHttpService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VercelService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    vercelService = module.get<VercelService>(VercelService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC6: Vercel Deployment - Trigger', () => {
    it('should trigger deployment with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentResponse('BUILDING'))),
      );

      const result = await vercelService.triggerDeployment('test-token', {
        projectId: MOCK_VERCEL_PROJECT_ID,
        name: 'my-app',
        target: 'production',
        ref: 'main',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v13/deployments',
        expect.objectContaining({
          name: 'my-app',
          project: MOCK_VERCEL_PROJECT_ID,
          target: 'production',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result.id).toBeDefined();
      expect(result.status).toBe('building');
      expect(result.projectId).toBe(MOCK_VERCEL_PROJECT_ID);
      expect(result.url).toBeDefined();
      expect(result.target).toBe('production');
      expect(result.ref).toBe('main');
      expect(result.readyState).toBe('BUILDING');
      expect(result.createdAt).toBeDefined();
    });

    it('should return status building for new deployments (readyState BUILDING)', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentResponse('BUILDING'))),
      );

      const result = await vercelService.triggerDeployment('test-token', {
        projectId: MOCK_VERCEL_PROJECT_ID,
        name: 'my-app',
      });

      expect(result.status).toBe('building');
    });
  });

  describe('AC6: Vercel Deployment - Get Status', () => {
    it('should get deployment with mapped status', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentResponse('READY'))),
      );

      const result = await vercelService.getDeployment(
        'test-token',
        'dpl_deploy_1',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('success');
    });

    it('should return null for not-found deployment (404)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Not Found');
          error.response = {
            status: 404,
            data: { error: { message: 'Deployment not found' } },
          };
          return error;
        }),
      );

      const result = await vercelService.getDeployment(
        'test-token',
        'nonexistent',
      );

      expect(result).toBeNull();
    });

    it.each([
      ['BUILDING', 'building'],
      ['INITIALIZING', 'building'],
      ['QUEUED', 'queued'],
      ['READY', 'success'],
      ['ERROR', 'failed'],
      ['CANCELED', 'canceled'],
    ])(
      'should map Vercel readyState %s to DevOS status %s',
      async (vercelState, expectedStatus) => {
        mockHttpService.get.mockReturnValueOnce(
          of(createAxiosResponse(createMockVercelDeploymentResponse(vercelState))),
        );

        const result = await vercelService.getDeployment(
          'test-token',
          `dpl_${vercelState.toLowerCase()}`,
        );

        expect(result).not.toBeNull();
        expect(result!.status).toBe(expectedStatus);
      },
    );

    it('should map unknown status to unknown', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentResponse('UNKNOWN_STATE'))),
      );

      const result = await vercelService.getDeployment(
        'test-token',
        'dpl_unknown',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('unknown');
    });
  });

  describe('AC6: Vercel Deployment - List', () => {
    it('should list deployments with pagination', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentListResponse(3))),
      );

      const result = await vercelService.listDeployments(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        { limit: 5 },
      );

      expect(result.deployments).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should pass target filter to list deployments', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentListResponse(1))),
      );

      await vercelService.listDeployments(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        { target: 'production' },
      );

      const calledUrl = mockHttpService.get.mock.calls[0][0];
      expect(calledUrl).toContain('target=production');
    });

    it('should pass state filter to list deployments', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentListResponse(1))),
      );

      await vercelService.listDeployments(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        { state: 'READY' },
      );

      const calledUrl = mockHttpService.get.mock.calls[0][0];
      expect(calledUrl).toContain('state=READY');
    });

    it('should include projectId in query params', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockVercelDeploymentListResponse(1))),
      );

      await vercelService.listDeployments(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
      );

      const calledUrl = mockHttpService.get.mock.calls[0][0];
      expect(calledUrl).toContain(`projectId=${MOCK_VERCEL_PROJECT_ID}`);
    });
  });

  describe('AC6: Vercel Deployment - Redeploy (Rollback)', () => {
    it('should redeploy deployment for rollback', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelRedeployResponse())),
      );

      const result = await vercelService.redeployDeployment(
        'test-token',
        'dpl_original_123',
        'my-app',
        'production',
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v13/deployments',
        expect.objectContaining({
          deploymentId: 'dpl_original_123',
          name: 'my-app',
          target: 'production',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result.id).toBeDefined();
      expect(result.status).toBe('building');
    });

    it('should throw BadGatewayException when redeploy returns null (404)', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Not Found');
          error.response = {
            status: 404,
            data: { error: { message: 'Deployment not found' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.redeployDeployment(
          'test-token',
          'nonexistent',
          'my-app',
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('AC6: Vercel Deployment - Error Handling', () => {
    it('should throw BadGatewayException for Vercel API errors on deployment operations', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server Error');
          error.response = {
            status: 500,
            data: { error: { message: 'Internal error' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.triggerDeployment('test-token', {
          projectId: MOCK_VERCEL_PROJECT_ID,
          name: 'my-app',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for rate limit (429)', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = {
            status: 429,
            data: { error: { message: 'Rate limit exceeded' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.triggerDeployment('test-token', {
          projectId: MOCK_VERCEL_PROJECT_ID,
          name: 'my-app',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should include rate limit message in BadGatewayException for 429', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = {
            status: 429,
            data: { error: { message: 'Rate limit exceeded' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.getDeployment('test-token', 'dpl_1'),
      ).rejects.toThrow('Vercel API rate limit exceeded');
    });
  });
});
