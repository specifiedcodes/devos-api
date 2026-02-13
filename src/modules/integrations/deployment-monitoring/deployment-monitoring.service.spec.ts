import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeploymentMonitoringService } from './deployment-monitoring.service';
import { RailwayService } from '../railway/railway.service';
import { VercelService } from '../vercel/vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';

/**
 * DeploymentMonitoringService Tests
 * Story 6.8: Deployment Status Monitoring
 */
describe('DeploymentMonitoringService', () => {
  let service: DeploymentMonitoringService;
  let mockRailwayService: any;
  let mockVercelService: any;
  let mockIntegrationService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';

  const mockProject = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'railway-project-uuid',
    vercelProjectId: 'vercel-project-id',
  };

  const mockRailwayDeployments = [
    {
      id: 'railway-dep-1',
      status: 'success',
      projectId: 'railway-project-uuid',
      branch: 'main',
      commitSha: 'abc123',
      deploymentUrl: 'https://my-app.up.railway.app',
      createdAt: '2026-02-01T10:05:00Z',
      updatedAt: '2026-02-01T10:08:00Z',
      meta: {},
    },
    {
      id: 'railway-dep-2',
      status: 'building',
      projectId: 'railway-project-uuid',
      branch: 'feature-1',
      createdAt: '2026-02-01T11:00:00Z',
      updatedAt: '2026-02-01T11:00:30Z',
      meta: {},
    },
  ];

  const mockVercelDeployments = [
    {
      id: 'vercel-dep-1',
      status: 'success',
      projectId: 'vercel-project-id',
      url: 'my-app.vercel.app',
      target: 'production',
      ref: 'main',
      createdAt: '2026-02-01T10:10:00Z',
      readyAt: '2026-02-01T10:13:00Z',
      meta: {},
    },
    {
      id: 'vercel-dep-2',
      status: 'queued',
      projectId: 'vercel-project-id',
      url: undefined,
      ref: 'develop',
      createdAt: '2026-02-01T11:05:00Z',
      readyAt: undefined,
      meta: {},
    },
  ];

  beforeEach(async () => {
    mockRailwayService = {
      listDeployments: jest.fn(),
      getDeployment: jest.fn(),
    };

    mockVercelService = {
      listDeployments: jest.fn(),
      getDeployment: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest.fn(),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue(mockProject),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentMonitoringService,
        { provide: RailwayService, useValue: mockRailwayService },
        { provide: VercelService, useValue: mockVercelService },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationService,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<DeploymentMonitoringService>(
      DeploymentMonitoringService,
    );
  });

  // ---- Helper method tests ----

  describe('normalizeRailwayDeployment', () => {
    it('should map all Railway statuses correctly', () => {
      const statusTests: Array<{ input: string; expected: string }> = [
        { input: 'building', expected: 'building' },
        { input: 'deploying', expected: 'deploying' },
        { input: 'success', expected: 'success' },
        { input: 'failed', expected: 'failed' },
        { input: 'crashed', expected: 'crashed' },
        { input: 'removed', expected: 'removed' },
        { input: 'queued', expected: 'queued' },
        { input: 'waiting', expected: 'building' },
      ];

      for (const { input, expected } of statusTests) {
        const deployment = {
          id: 'dep-1',
          status: input,
          projectId: 'proj-1',
          createdAt: '2026-02-01T10:00:00Z',
          updatedAt: '2026-02-01T10:05:00Z',
        };

        const result = service.normalizeRailwayDeployment(deployment);
        expect(result.normalizedStatus).toBe(expected);
      }
    });

    it('should set platform to railway', () => {
      const result = service.normalizeRailwayDeployment(
        mockRailwayDeployments[0],
      );
      expect(result.platform).toBe('railway');
    });

    it('should calculate duration from createdAt/updatedAt for terminal states', () => {
      const result = service.normalizeRailwayDeployment(
        mockRailwayDeployments[0],
      );
      expect(result.duration).toBe(180); // 3 minutes = 180 seconds
    });

    it('should return null duration for non-terminal states', () => {
      const result = service.normalizeRailwayDeployment(
        mockRailwayDeployments[1],
      );
      expect(result.duration).toBeNull();
    });

    it('should map unknown statuses to unknown', () => {
      const deployment = {
        id: 'dep-1',
        status: 'some-unknown-status',
        projectId: 'proj-1',
        createdAt: '2026-02-01T10:00:00Z',
      };

      const result = service.normalizeRailwayDeployment(deployment);
      expect(result.normalizedStatus).toBe('unknown');
    });
  });

  describe('normalizeVercelDeployment', () => {
    it('should map all Vercel statuses correctly', () => {
      const statusTests: Array<{ input: string; expected: string }> = [
        { input: 'building', expected: 'building' },
        { input: 'queued', expected: 'queued' },
        { input: 'success', expected: 'success' },
        { input: 'failed', expected: 'failed' },
        { input: 'canceled', expected: 'canceled' },
      ];

      for (const { input, expected } of statusTests) {
        const deployment = {
          id: 'dep-1',
          status: input,
          projectId: 'proj-1',
          createdAt: '2026-02-01T10:00:00Z',
          readyAt: '2026-02-01T10:05:00Z',
        };

        const result = service.normalizeVercelDeployment(deployment);
        expect(result.normalizedStatus).toBe(expected);
      }
    });

    it('should set platform to vercel', () => {
      const result = service.normalizeVercelDeployment(
        mockVercelDeployments[0],
      );
      expect(result.platform).toBe('vercel');
    });

    it('should calculate duration from createdAt/readyAt for terminal states', () => {
      const result = service.normalizeVercelDeployment(
        mockVercelDeployments[0],
      );
      expect(result.duration).toBe(180); // 3 minutes = 180 seconds
    });

    it('should set deploymentUrl with https prefix', () => {
      const result = service.normalizeVercelDeployment(
        mockVercelDeployments[0],
      );
      expect(result.deploymentUrl).toBe('https://my-app.vercel.app');
    });

    it('should map branch from ref field', () => {
      const result = service.normalizeVercelDeployment(
        mockVercelDeployments[0],
      );
      expect(result.branch).toBe('main');
    });
  });

  describe('isTerminalStatus', () => {
    it('should return true for success', () => {
      expect(service.isTerminalStatus('success')).toBe(true);
    });

    it('should return true for failed', () => {
      expect(service.isTerminalStatus('failed')).toBe(true);
    });

    it('should return true for crashed', () => {
      expect(service.isTerminalStatus('crashed')).toBe(true);
    });

    it('should return true for canceled', () => {
      expect(service.isTerminalStatus('canceled')).toBe(true);
    });

    it('should return true for removed', () => {
      expect(service.isTerminalStatus('removed')).toBe(true);
    });

    it('should return false for queued', () => {
      expect(service.isTerminalStatus('queued')).toBe(false);
    });

    it('should return false for building', () => {
      expect(service.isTerminalStatus('building')).toBe(false);
    });

    it('should return false for deploying', () => {
      expect(service.isTerminalStatus('deploying')).toBe(false);
    });

    it('should return false for waiting', () => {
      expect(service.isTerminalStatus('waiting')).toBe(false);
    });

    it('should return false for unknown', () => {
      expect(service.isTerminalStatus('unknown')).toBe(false);
    });
  });

  describe('calculateDuration', () => {
    it('should return correct seconds between timestamps', () => {
      const result = service.calculateDuration(
        '2026-02-01T10:00:00Z',
        '2026-02-01T10:05:00Z',
      );
      expect(result).toBe(300); // 5 minutes
    });

    it('should return null when no completedAt', () => {
      const result = service.calculateDuration('2026-02-01T10:00:00Z');
      expect(result).toBeNull();
    });

    it('should return null when completedAt is undefined', () => {
      const result = service.calculateDuration(
        '2026-02-01T10:00:00Z',
        undefined,
      );
      expect(result).toBeNull();
    });

    it('should return null for invalid date strings', () => {
      const result = service.calculateDuration('invalid', 'also-invalid');
      expect(result).toBeNull();
    });

    it('should handle zero duration', () => {
      const result = service.calculateDuration(
        '2026-02-01T10:00:00Z',
        '2026-02-01T10:00:00Z',
      );
      expect(result).toBe(0);
    });
  });

  // ---- getUnifiedDeployments tests ----

  describe('getUnifiedDeployments', () => {
    beforeEach(() => {
      mockIntegrationService.getDecryptedToken
        .mockResolvedValueOnce('railway_token') // Railway
        .mockResolvedValueOnce('vercel_token'); // Vercel
    });

    it('should return merged deployments from Railway and Vercel sorted by date', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[0]],
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [mockVercelDeployments[0]],
        total: 1,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.deployments.length).toBe(2);
      // Vercel deployment (10:10) is more recent than Railway (10:05)
      expect(result.deployments[0].platform).toBe('vercel');
      expect(result.deployments[1].platform).toBe('railway');
      expect(result.total).toBe(2);
    });

    it('should return only Railway deployments when platform=railway', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        { platform: 'railway' },
      );

      expect(
        result.deployments.every((d) => d.platform === 'railway'),
      ).toBe(true);
      expect(mockVercelService.listDeployments).not.toHaveBeenCalled();
    });

    it('should return only Vercel deployments when platform=vercel', async () => {
      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        { platform: 'vercel' },
      );

      expect(
        result.deployments.every((d) => d.platform === 'vercel'),
      ).toBe(true);
      expect(mockRailwayService.listDeployments).not.toHaveBeenCalled();
    });

    it('should filter by status correctly', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        { status: 'success' },
      );

      expect(
        result.deployments.every((d) => d.normalizedStatus === 'success'),
      ).toBe(true);
      expect(result.deployments.length).toBe(2); // 1 railway success + 1 vercel success
    });

    it('should apply pagination correctly', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        { page: 1, perPage: 2 },
      );

      expect(result.deployments.length).toBe(2);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(2);
      expect(result.total).toBe(4);
    });

    it('should return second page of paginated results', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        { page: 2, perPage: 2 },
      );

      expect(result.deployments.length).toBe(2);
      expect(result.page).toBe(2);
    });

    it('should return empty list when no platforms connected', async () => {
      // Reset mocks - no tokens available
      mockIntegrationService.getDecryptedToken = jest.fn();
      mockIntegrationService.getDecryptedToken
        .mockRejectedValueOnce(new NotFoundException('No Railway'))
        .mockRejectedValueOnce(new NotFoundException('No Vercel'));

      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
        vercelProjectId: null,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.deployments.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.platforms.railway.connected).toBe(false);
      expect(result.platforms.vercel.connected).toBe(false);
    });

    it('should gracefully handle Railway API error and still return Vercel results', async () => {
      mockRailwayService.listDeployments.mockRejectedValue(
        new Error('Railway API error'),
      );

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.deployments.length).toBe(2);
      expect(
        result.deployments.every((d) => d.platform === 'vercel'),
      ).toBe(true);
    });

    it('should gracefully handle Vercel API error and still return Railway results', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      mockVercelService.listDeployments.mockRejectedValue(
        new Error('Vercel API error'),
      );

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.deployments.length).toBe(2);
      expect(
        result.deployments.every((d) => d.platform === 'railway'),
      ).toBe(true);
    });

    it('should include correct platforms status in response', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getUnifiedDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.platforms.railway.connected).toBe(true);
      expect(result.platforms.railway.projectLinked).toBe(true);
      expect(result.platforms.vercel.connected).toBe(true);
      expect(result.platforms.vercel.projectLinked).toBe(true);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getUnifiedDeployments(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- getDeploymentDetail tests ----

  describe('getDeploymentDetail', () => {
    beforeEach(() => {
      mockIntegrationService.getDecryptedToken
        .mockResolvedValueOnce('railway_token')
        .mockResolvedValueOnce('vercel_token');
    });

    it('should return Railway deployment detail', async () => {
      mockRailwayService.getDeployment.mockResolvedValue(
        mockRailwayDeployments[0],
      );

      const result = await service.getDeploymentDetail(
        mockWorkspaceId,
        mockProjectId,
        'railway-dep-1',
        'railway',
      );

      expect(result).not.toBeNull();
      expect(result!.platform).toBe('railway');
      expect(result!.id).toBe('railway-dep-1');
      expect(result!.normalizedStatus).toBe('success');
    });

    it('should return Vercel deployment detail', async () => {
      mockVercelService.getDeployment.mockResolvedValue(
        mockVercelDeployments[0],
      );

      const result = await service.getDeploymentDetail(
        mockWorkspaceId,
        mockProjectId,
        'vercel-dep-1',
        'vercel',
      );

      expect(result).not.toBeNull();
      expect(result!.platform).toBe('vercel');
      expect(result!.id).toBe('vercel-dep-1');
      expect(result!.normalizedStatus).toBe('success');
    });

    it('should return null when deployment not found', async () => {
      mockRailwayService.getDeployment.mockResolvedValue(null);

      const result = await service.getDeploymentDetail(
        mockWorkspaceId,
        mockProjectId,
        'nonexistent-dep',
        'railway',
      );

      expect(result).toBeNull();
    });

    it('should throw BadRequestException for invalid platform', async () => {
      await expect(
        service.getDeploymentDetail(
          mockWorkspaceId,
          mockProjectId,
          'dep-1',
          'invalid-platform',
        ),
      ).rejects.toThrow('Invalid platform');
    });
  });

  // ---- getActiveDeployments tests ----

  describe('getActiveDeployments', () => {
    beforeEach(() => {
      mockIntegrationService.getDecryptedToken
        .mockResolvedValueOnce('railway_token')
        .mockResolvedValueOnce('vercel_token');
    });

    it('should return only non-terminal deployments', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments, // 1 success, 1 building
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments, // 1 success, 1 queued
        total: 2,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.activeDeployments.length).toBe(2);
      expect(result.hasActiveDeployments).toBe(true);
      // Should contain the building and queued deployments only
      const statuses = result.activeDeployments.map(
        (d) => d.normalizedStatus,
      );
      expect(statuses).toContain('building');
      expect(statuses).toContain('queued');
      expect(statuses).not.toContain('success');
    });

    it('should return empty when no active deployments', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[0]], // only success
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [mockVercelDeployments[0]], // only success
        total: 1,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.activeDeployments.length).toBe(0);
      expect(result.hasActiveDeployments).toBe(false);
    });

    it('should calculate elapsedSeconds correctly', async () => {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [
          {
            id: 'active-dep',
            status: 'building',
            projectId: 'railway-project-uuid',
            branch: 'main',
            createdAt: fiveMinutesAgo,
            updatedAt: fiveMinutesAgo,
            meta: {},
          },
        ],
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.activeDeployments.length).toBe(1);
      // Should be approximately 300 seconds (5 minutes)
      expect(result.activeDeployments[0].elapsedSeconds).toBeGreaterThanOrEqual(
        295,
      );
      expect(result.activeDeployments[0].elapsedSeconds).toBeLessThanOrEqual(
        310,
      );
    });

    it('should return hasActiveDeployments=true when active', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[1]], // building
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.hasActiveDeployments).toBe(true);
    });

    it('should return hasActiveDeployments=false when none active', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.hasActiveDeployments).toBe(false);
    });

    it('should always return pollingIntervalMs=10000', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.pollingIntervalMs).toBe(10000);
    });

    it('should sort active deployments by startedAt ascending', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[1]], // building, 11:00
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [mockVercelDeployments[1]], // queued, 11:05
        total: 1,
      });

      const result = await service.getActiveDeployments(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.activeDeployments.length).toBe(2);
      // Railway (11:00) should be first (ascending)
      expect(result.activeDeployments[0].platform).toBe('railway');
      expect(result.activeDeployments[1].platform).toBe('vercel');
    });
  });

  // ---- getDeploymentSummary tests ----

  describe('getDeploymentSummary', () => {
    beforeEach(() => {
      mockIntegrationService.getDecryptedToken
        .mockResolvedValueOnce('railway_token')
        .mockResolvedValueOnce('vercel_token');
    });

    it('should return correct counts and success rate', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments, // 1 success, 1 building
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments, // 1 success, 1 queued
        total: 2,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalDeployments).toBe(4);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.inProgressCount).toBe(2); // 1 building + 1 queued
      expect(result.canceledCount).toBe(0);
      // Success rate = 2 / (4 - 2) * 100 = 100%
      expect(result.successRate).toBe(100);
    });

    it('should return correct average duration', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[0]], // success, 180s
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [mockVercelDeployments[0]], // success, 180s
        total: 1,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      // Both have 180s duration, average = 180
      expect(result.averageDurationSeconds).toBe(180);
    });

    it('should return correct platform breakdown', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments, // 1 success, 1 building
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments, // 1 success, 1 queued
        total: 2,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.platformBreakdown.railway.total).toBe(2);
      expect(result.platformBreakdown.railway.success).toBe(1);
      expect(result.platformBreakdown.railway.failed).toBe(0);
      expect(result.platformBreakdown.railway.inProgress).toBe(1);

      expect(result.platformBreakdown.vercel.total).toBe(2);
      expect(result.platformBreakdown.vercel.success).toBe(1);
      expect(result.platformBreakdown.vercel.failed).toBe(0);
      expect(result.platformBreakdown.vercel.inProgress).toBe(1);
    });

    it('should handle zero deployments gracefully', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalDeployments).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.inProgressCount).toBe(0);
      expect(result.canceledCount).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.averageDurationSeconds).toBeNull();
      expect(result.lastDeployment).toBeNull();
    });

    it('should handle only Railway deployments', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: mockRailwayDeployments,
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalDeployments).toBe(2);
      expect(result.platformBreakdown.railway.total).toBe(2);
      expect(result.platformBreakdown.vercel.total).toBe(0);
    });

    it('should handle only Vercel deployments', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: mockVercelDeployments,
        total: 2,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalDeployments).toBe(2);
      expect(result.platformBreakdown.railway.total).toBe(0);
      expect(result.platformBreakdown.vercel.total).toBe(2);
    });

    it('should return the most recent deployment as lastDeployment', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [mockRailwayDeployments[0]], // 10:05
        total: 1,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [mockVercelDeployments[0]], // 10:10 (more recent)
        total: 1,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.lastDeployment).not.toBeNull();
      expect(result.lastDeployment!.platform).toBe('vercel');
    });

    it('should calculate correct success rate with failed deployments', async () => {
      mockRailwayService.listDeployments.mockResolvedValue({
        deployments: [
          {
            id: 'dep-ok',
            status: 'success',
            projectId: 'railway-project-uuid',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:05:00Z',
          },
          {
            id: 'dep-fail',
            status: 'failed',
            projectId: 'railway-project-uuid',
            createdAt: '2026-02-01T11:00:00Z',
            updatedAt: '2026-02-01T11:05:00Z',
          },
        ],
        total: 2,
      });

      mockVercelService.listDeployments.mockResolvedValue({
        deployments: [],
        total: 0,
      });

      const result = await service.getDeploymentSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      // 1 success, 1 failed, 0 in-progress
      // Success rate = 1 / (2 - 0) * 100 = 50%
      expect(result.successRate).toBe(50);
      expect(result.failedCount).toBe(1);
    });
  });
});
