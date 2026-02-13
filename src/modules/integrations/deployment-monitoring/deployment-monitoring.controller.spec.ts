import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DeploymentMonitoringController } from './deployment-monitoring.controller';
import { DeploymentMonitoringService } from './deployment-monitoring.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

/**
 * DeploymentMonitoringController Tests
 * Story 6.8: Deployment Status Monitoring
 */
describe('DeploymentMonitoringController', () => {
  let controller: DeploymentMonitoringController;
  let mockService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';

  const mockDeployment = {
    id: 'dep-1',
    platform: 'railway',
    status: 'success',
    normalizedStatus: 'success',
    branch: 'main',
    commitSha: 'abc123',
    deploymentUrl: 'https://my-app.up.railway.app',
    startedAt: '2026-02-01T10:05:00Z',
    completedAt: '2026-02-01T10:08:00Z',
    duration: 180,
    logs: null,
    meta: {},
  };

  const mockUnifiedListResponse = {
    deployments: [mockDeployment],
    total: 1,
    page: 1,
    perPage: 10,
    platforms: {
      railway: { connected: true, projectLinked: true },
      vercel: { connected: true, projectLinked: true },
    },
  };

  const mockActiveDeploymentsResponse = {
    activeDeployments: [
      {
        id: 'dep-2',
        platform: 'railway',
        status: 'building',
        normalizedStatus: 'building',
        branch: 'feature-1',
        startedAt: '2026-02-01T11:00:00Z',
        elapsedSeconds: 45,
      },
    ],
    hasActiveDeployments: true,
    pollingIntervalMs: 10000,
  };

  const mockSummaryResponse = {
    totalDeployments: 25,
    successCount: 20,
    failedCount: 3,
    inProgressCount: 1,
    canceledCount: 1,
    successRate: 86.96,
    averageDurationSeconds: 185,
    lastDeployment: mockDeployment,
    platformBreakdown: {
      railway: { total: 15, success: 12, failed: 2, inProgress: 1 },
      vercel: { total: 10, success: 8, failed: 1, inProgress: 0 },
    },
  };

  beforeEach(async () => {
    mockService = {
      getUnifiedDeployments: jest.fn(),
      getDeploymentDetail: jest.fn(),
      getActiveDeployments: jest.fn(),
      getDeploymentSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeploymentMonitoringController],
      providers: [
        {
          provide: DeploymentMonitoringService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DeploymentMonitoringController>(
      DeploymentMonitoringController,
    );
  });

  // ---- List Deployments Tests ----

  describe('GET /deployments', () => {
    it('should return 200 with unified deployment list', async () => {
      mockService.getUnifiedDeployments.mockResolvedValue(
        mockUnifiedListResponse,
      );

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        {} as any,
      );

      expect(result).toEqual(mockUnifiedListResponse);
      expect(mockService.getUnifiedDeployments).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        {
          platform: undefined,
          status: undefined,
          page: undefined,
          perPage: undefined,
        },
      );
    });

    it('should return 200 with platform filter applied', async () => {
      const filteredResponse = {
        ...mockUnifiedListResponse,
        deployments: [mockDeployment],
      };
      mockService.getUnifiedDeployments.mockResolvedValue(filteredResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        { platform: 'railway' } as any,
      );

      expect(result.deployments.length).toBe(1);
      expect(mockService.getUnifiedDeployments).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.objectContaining({ platform: 'railway' }),
      );
    });

    it('should return 200 with status filter applied', async () => {
      const filteredResponse = {
        ...mockUnifiedListResponse,
        deployments: [mockDeployment],
      };
      mockService.getUnifiedDeployments.mockResolvedValue(filteredResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        { status: 'success' } as any,
      );

      expect(result.deployments.length).toBe(1);
      expect(mockService.getUnifiedDeployments).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.objectContaining({ status: 'success' }),
      );
    });

    it('should return 200 with pagination applied', async () => {
      const paginatedResponse = {
        ...mockUnifiedListResponse,
        page: 2,
        perPage: 5,
      };
      mockService.getUnifiedDeployments.mockResolvedValue(paginatedResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        { page: 2, perPage: 5 } as any,
      );

      expect(result.page).toBe(2);
      expect(result.perPage).toBe(5);
    });

    it('should return 200 with empty deployments list', async () => {
      const emptyResponse = {
        deployments: [],
        total: 0,
        page: 1,
        perPage: 10,
        platforms: {
          railway: { connected: false, projectLinked: false },
          vercel: { connected: false, projectLinked: false },
        },
      };
      mockService.getUnifiedDeployments.mockResolvedValue(emptyResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        {} as any,
      );

      expect(result.deployments).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ---- Deployment Detail Tests ----

  describe('GET /deployments/:deploymentId', () => {
    it('should return 200 with deployment detail', async () => {
      mockService.getDeploymentDetail.mockResolvedValue(mockDeployment);

      const result = await controller.getDeploymentDetail(
        mockWorkspaceId,
        mockProjectId,
        'dep-1',
        { platform: 'railway' } as any,
      );

      expect(result).toEqual(mockDeployment);
      expect(mockService.getDeploymentDetail).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        'dep-1',
        'railway',
      );
    });

    it('should throw BadRequestException for missing platform query param', async () => {
      await expect(
        controller.getDeploymentDetail(
          mockWorkspaceId,
          mockProjectId,
          'dep-1',
          { platform: undefined } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when deployment not found', async () => {
      mockService.getDeploymentDetail.mockResolvedValue(null);

      await expect(
        controller.getDeploymentDetail(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-dep',
          { platform: 'railway' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid deployment ID format', async () => {
      await expect(
        controller.getDeploymentDetail(
          mockWorkspaceId,
          mockProjectId,
          'invalid dep id with spaces!',
          { platform: 'railway' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for deployment ID exceeding max length', async () => {
      const longId = 'a'.repeat(101);
      await expect(
        controller.getDeploymentDetail(
          mockWorkspaceId,
          mockProjectId,
          longId,
          { platform: 'railway' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---- Active Deployments Tests ----

  describe('GET /deployments/active', () => {
    it('should return 200 with active deployments', async () => {
      mockService.getActiveDeployments.mockResolvedValue(
        mockActiveDeploymentsResponse,
      );

      const result = await controller.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(mockActiveDeploymentsResponse);
      expect(result.hasActiveDeployments).toBe(true);
      expect(result.pollingIntervalMs).toBe(10000);
      expect(mockService.getActiveDeployments).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });

    it('should return 200 with empty active deployments', async () => {
      const emptyResponse = {
        activeDeployments: [],
        hasActiveDeployments: false,
        pollingIntervalMs: 10000,
      };
      mockService.getActiveDeployments.mockResolvedValue(emptyResponse);

      const result = await controller.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.activeDeployments).toEqual([]);
      expect(result.hasActiveDeployments).toBe(false);
    });
  });

  // ---- Deployment Summary Tests ----

  describe('GET /deployments/summary', () => {
    it('should return 200 with deployment summary', async () => {
      mockService.getDeploymentSummary.mockResolvedValue(
        mockSummaryResponse,
      );

      const result = await controller.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(mockSummaryResponse);
      expect(result.totalDeployments).toBe(25);
      expect(result.successRate).toBe(86.96);
      expect(mockService.getDeploymentSummary).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });

    it('should return 200 with zero counts when no deployments', async () => {
      const emptyResponse = {
        totalDeployments: 0,
        successCount: 0,
        failedCount: 0,
        inProgressCount: 0,
        canceledCount: 0,
        successRate: 0,
        averageDurationSeconds: null,
        lastDeployment: null,
        platformBreakdown: {
          railway: { total: 0, success: 0, failed: 0, inProgress: 0 },
          vercel: { total: 0, success: 0, failed: 0, inProgress: 0 },
        },
      };
      mockService.getDeploymentSummary.mockResolvedValue(emptyResponse);

      const result = await controller.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalDeployments).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.lastDeployment).toBeNull();
    });
  });
});
