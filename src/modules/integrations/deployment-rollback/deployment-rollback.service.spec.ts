import { Test, TestingModule } from '@nestjs/testing';
import { DeploymentRollbackService } from './deployment-rollback.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeploymentRollback,
  DeploymentRollbackStatus,
  DeploymentRollbackTriggerType,
} from '../../../database/entities/deployment-rollback.entity';
import { Project } from '../../../database/entities/project.entity';
import { RailwayService } from '../railway/railway.service';
import { VercelService } from '../vercel/vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { DeploymentMonitoringService } from '../deployment-monitoring/deployment-monitoring.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('DeploymentRollbackService', () => {
  let service: DeploymentRollbackService;
  let mockRollbackRepository: any;
  let mockProjectRepository: any;
  let mockRailwayService: any;
  let mockVercelService: any;
  let mockIntegrationConnectionService: any;
  let mockDeploymentMonitoringService: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockRollbackId = '55555555-5555-5555-5555-555555555555';

  const mockProject = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'railway-proj-id',
    vercelProjectId: 'vercel-proj-id',
  };

  beforeEach(async () => {
    mockRollbackRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue(mockProject),
    };

    mockRailwayService = {
      redeployDeployment: jest.fn().mockResolvedValue({
        id: 'new-railway-deploy-id',
        status: 'building',
        projectId: 'railway-proj-id',
      }),
    };

    mockVercelService = {
      redeployDeployment: jest.fn().mockResolvedValue({
        id: 'new-vercel-deploy-id',
        status: 'building',
        projectId: 'vercel-proj-id',
      }),
    };

    mockIntegrationConnectionService = {
      getDecryptedToken: jest.fn().mockResolvedValue('mock-token'),
    };

    mockDeploymentMonitoringService = {
      getUnifiedDeployments: jest.fn().mockResolvedValue({
        deployments: [
          {
            id: 'deploy-prev-1',
            normalizedStatus: 'success',
            platform: 'railway',
            startedAt: '2026-01-31T10:00:00Z',
          },
          {
            id: 'deploy-current',
            normalizedStatus: 'failed',
            platform: 'railway',
            startedAt: '2026-02-01T10:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        perPage: 50,
      }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentRollbackService,
        {
          provide: getRepositoryToken(DeploymentRollback),
          useValue: mockRollbackRepository,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        { provide: RailwayService, useValue: mockRailwayService },
        { provide: VercelService, useValue: mockVercelService },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationConnectionService,
        },
        {
          provide: DeploymentMonitoringService,
          useValue: mockDeploymentMonitoringService,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<DeploymentRollbackService>(
      DeploymentRollbackService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateManualRollback', () => {
    const baseDto = {
      platform: 'railway' as const,
      deploymentId: 'deploy-current',
      targetDeploymentId: 'deploy-prev-1',
      environment: 'production' as const,
      reason: 'Health check failures',
    };

    const createMockRollback = (overrides: any = {}) => {
      const rollback = {
        id: mockRollbackId,
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        platform: baseDto.platform,
        deploymentId: baseDto.deploymentId,
        targetDeploymentId: baseDto.targetDeploymentId,
        environment: baseDto.environment,
        reason: baseDto.reason,
        status: DeploymentRollbackStatus.IN_PROGRESS,
        triggerType: DeploymentRollbackTriggerType.MANUAL,
        initiatedBy: mockUserId,
        initiatedAt: new Date('2026-02-01T10:00:00Z'),
        completedAt: undefined as Date | undefined,
        newDeploymentId: undefined as string | undefined,
        errorMessage: undefined as string | undefined,
        ...overrides,
      };
      return rollback;
    };

    beforeEach(() => {
      const mockRollback = createMockRollback();
      mockRollbackRepository.create.mockReturnValue(mockRollback);
      mockRollbackRepository.save.mockImplementation((entity: any) =>
        Promise.resolve(entity),
      );
    });

    it('should create a rollback record and call Railway redeployment', async () => {
      const result = await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        baseDto as any,
      );

      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockProjectId, workspaceId: mockWorkspaceId },
      });
      expect(mockRailwayService.redeployDeployment).toHaveBeenCalledWith(
        'mock-token',
        'deploy-prev-1',
      );
      expect(mockRollbackRepository.create).toHaveBeenCalled();
      expect(mockRollbackRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(DeploymentRollbackStatus.SUCCESS);
      expect(result.newDeploymentId).toBe('new-railway-deploy-id');
    });

    it('should create a rollback record and call Vercel redeployment', async () => {
      const vercelDto = {
        ...baseDto,
        platform: 'vercel',
      };

      const mockRollback = createMockRollback({ platform: 'vercel' });
      mockRollbackRepository.create.mockReturnValue(mockRollback);

      const result = await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        vercelDto as any,
      );

      expect(mockVercelService.redeployDeployment).toHaveBeenCalledWith(
        'mock-token',
        'deploy-prev-1',
        'My Project',
      );
      expect(result.status).toBe(DeploymentRollbackStatus.SUCCESS);
      expect(result.newDeploymentId).toBe('new-vercel-deploy-id');
    });

    it('should auto-resolve targetDeploymentId when not provided', async () => {
      const dtoWithoutTarget = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
        reason: 'Health check failures',
      };

      const mockRollback = createMockRollback({
        targetDeploymentId: 'deploy-prev-1',
      });
      mockRollbackRepository.create.mockReturnValue(mockRollback);

      await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        dtoWithoutTarget as any,
      );

      expect(
        mockDeploymentMonitoringService.getUnifiedDeployments,
      ).toHaveBeenCalledWith(mockWorkspaceId, mockProjectId, {
        platform: 'railway',
        perPage: 50,
      });
      expect(mockRailwayService.redeployDeployment).toHaveBeenCalledWith(
        'mock-token',
        'deploy-prev-1',
      );
    });

    it('should throw BadRequestException when no previous successful deployment found', async () => {
      mockDeploymentMonitoringService.getUnifiedDeployments.mockResolvedValue({
        deployments: [
          {
            id: 'deploy-current',
            normalizedStatus: 'failed',
            platform: 'railway',
            startedAt: '2026-02-01T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        perPage: 50,
      });

      const dtoWithoutTarget = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
      };

      await expect(
        service.initiateManualRollback(
          mockWorkspaceId,
          mockProjectId,
          mockUserId,
          dtoWithoutTarget as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when platform integration not connected', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('Integration not found'),
      );

      await expect(
        service.initiateManualRollback(
          mockWorkspaceId,
          mockProjectId,
          mockUserId,
          baseDto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set status to "failed" on platform API error', async () => {
      mockRailwayService.redeployDeployment.mockRejectedValue(
        new Error('Railway API error: deployment not found'),
      );

      const result = await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        baseDto as any,
      );

      expect(result.status).toBe(DeploymentRollbackStatus.FAILED);
      expect(result.errorMessage).toContain('Railway API error');
    });

    it('should send notification on successful rollback', async () => {
      await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        baseDto as any,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'deployment_rollback_completed',
          title: 'Deployment Rollback Completed',
        }),
      );
    });

    it('should send notification on failed rollback', async () => {
      mockRailwayService.redeployDeployment.mockRejectedValue(
        new Error('Platform error'),
      );

      await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        baseDto as any,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'deployment_rollback_failed',
          title: 'Deployment Rollback Failed',
        }),
      );
    });

    it('should log audit events for initiation and completion', async () => {
      await service.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        baseDto as any,
      );

      // Should log initiation
      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'deployment.rollback_initiated',
        'deployment_rollback',
        mockRollbackId,
        expect.objectContaining({
          platform: 'railway',
          triggerType: 'manual',
        }),
      );

      // Should log completion
      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'deployment.rollback_completed',
        'deployment_rollback',
        mockRollbackId,
        expect.objectContaining({
          status: 'success',
        }),
      );
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initiateManualRollback(
          mockWorkspaceId,
          mockProjectId,
          mockUserId,
          baseDto as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('initiateAutoRollback', () => {
    const autoDto = {
      platform: 'railway' as const,
      deploymentId: 'deploy-current',
      environment: 'production' as const,
      reason: 'Smoke tests failed: health endpoint returned 503',
    };

    const createMockRollback = (overrides: any = {}) => {
      return {
        id: mockRollbackId,
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        platform: autoDto.platform,
        deploymentId: autoDto.deploymentId,
        targetDeploymentId: 'deploy-prev-1',
        environment: autoDto.environment,
        reason: autoDto.reason,
        status: DeploymentRollbackStatus.IN_PROGRESS,
        triggerType: DeploymentRollbackTriggerType.AUTOMATIC,
        initiatedBy: mockUserId,
        initiatedAt: new Date('2026-02-01T10:00:00Z'),
        completedAt: undefined as Date | undefined,
        newDeploymentId: undefined as string | undefined,
        errorMessage: undefined as string | undefined,
        ...overrides,
      };
    };

    beforeEach(() => {
      const mockRollback = createMockRollback();
      mockRollbackRepository.create.mockReturnValue(mockRollback);
      mockRollbackRepository.save.mockImplementation((entity: any) =>
        Promise.resolve(entity),
      );
    });

    it('should create rollback with triggerType "automatic"', async () => {
      const result = await service.initiateAutoRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        autoDto as any,
      );

      expect(mockRollbackRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: DeploymentRollbackTriggerType.AUTOMATIC,
        }),
      );
      expect(result.triggerType).toBe(
        DeploymentRollbackTriggerType.AUTOMATIC,
      );
    });

    it('should auto-resolve target deployment', async () => {
      await service.initiateAutoRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        autoDto as any,
      );

      expect(
        mockDeploymentMonitoringService.getUnifiedDeployments,
      ).toHaveBeenCalledWith(mockWorkspaceId, mockProjectId, {
        platform: 'railway',
        perPage: 50,
      });
    });

    it('should include reason in notification message', async () => {
      await service.initiateAutoRollback(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        autoDto as any,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'Automatic rollback triggered:',
          ),
        }),
      );
    });
  });

  describe('listRollbacks', () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'rollback-1',
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          platform: 'railway',
          deploymentId: 'deploy-1',
          targetDeploymentId: 'deploy-prev',
          newDeploymentId: 'deploy-new',
          environment: 'production',
          status: DeploymentRollbackStatus.SUCCESS,
          reason: 'Test',
          triggerType: DeploymentRollbackTriggerType.MANUAL,
          initiatedBy: mockUserId,
          initiatedAt: new Date('2026-02-01T10:00:00Z'),
          completedAt: new Date('2026-02-01T10:01:00Z'),
        },
        {
          id: 'rollback-2',
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          platform: 'vercel',
          deploymentId: 'deploy-2',
          targetDeploymentId: 'deploy-prev-2',
          newDeploymentId: null,
          environment: 'staging',
          status: DeploymentRollbackStatus.FAILED,
          reason: null,
          triggerType: DeploymentRollbackTriggerType.AUTOMATIC,
          initiatedBy: mockUserId,
          initiatedAt: new Date('2026-02-01T09:00:00Z'),
          completedAt: new Date('2026-02-01T09:01:00Z'),
          errorMessage: 'API error',
        },
      ]),
    };

    beforeEach(() => {
      mockRollbackRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
    });

    it('should return paginated list sorted by initiatedAt desc', async () => {
      const result = await service.listRollbacks(
        mockWorkspaceId,
        mockProjectId,
        { page: 1, perPage: 10 },
      );

      expect(result.rollbacks).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(10);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'rollback.initiatedAt',
        'DESC',
      );
    });

    it('should filter by platform', async () => {
      await service.listRollbacks(mockWorkspaceId, mockProjectId, {
        platform: 'railway',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rollback.platform = :platform',
        { platform: 'railway' },
      );
    });

    it('should filter by status', async () => {
      await service.listRollbacks(mockWorkspaceId, mockProjectId, {
        status: 'success',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rollback.status = :status',
        { status: 'success' },
      );
    });

    it('should return empty list when no rollbacks', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.listRollbacks(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.rollbacks).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listRollbacks(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRollbackDetail', () => {
    it('should return rollback with full details', async () => {
      const mockRollback = {
        id: mockRollbackId,
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        platform: 'railway',
        deploymentId: 'deploy-current',
        targetDeploymentId: 'deploy-prev',
        newDeploymentId: 'deploy-new',
        environment: 'production',
        status: DeploymentRollbackStatus.SUCCESS,
        reason: 'Health check failures',
        triggerType: DeploymentRollbackTriggerType.MANUAL,
        initiatedBy: mockUserId,
        initiatedAt: new Date('2026-02-01T10:00:00Z'),
        completedAt: new Date('2026-02-01T10:01:30Z'),
        errorMessage: null,
      };

      mockRollbackRepository.findOne.mockResolvedValue(mockRollback);

      const result = await service.getRollbackDetail(
        mockWorkspaceId,
        mockProjectId,
        mockRollbackId,
      );

      expect(result.id).toBe(mockRollbackId);
      expect(result.platform).toBe('railway');
      expect(result.status).toBe('success');
      expect(result.triggerType).toBe('manual');
      expect(result.initiatedAt).toBe('2026-02-01T10:00:00.000Z');
      expect(result.completedAt).toBe('2026-02-01T10:01:30.000Z');
    });

    it('should throw NotFoundException for invalid rollback', async () => {
      mockRollbackRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getRollbackDetail(
          mockWorkspaceId,
          mockProjectId,
          'invalid-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRollbackSummary', () => {
    it('should return correct counts and averages', async () => {
      const mockSummaryQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRollbacks: '5',
          successCount: '4',
          failedCount: '1',
          manualCount: '3',
          automaticCount: '2',
          avgDuration: '45.5',
        }),
      };
      mockRollbackRepository.createQueryBuilder.mockReturnValue(
        mockSummaryQueryBuilder,
      );

      const lastRollback = {
        id: 'last-rollback',
        platform: 'railway',
        status: DeploymentRollbackStatus.SUCCESS,
        triggerType: DeploymentRollbackTriggerType.MANUAL,
        initiatedAt: new Date('2026-02-01T10:00:00Z'),
        completedAt: new Date('2026-02-01T10:01:30Z'),
      };
      mockRollbackRepository.findOne.mockResolvedValue(lastRollback);

      const result = await service.getRollbackSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalRollbacks).toBe(5);
      expect(result.successCount).toBe(4);
      expect(result.failedCount).toBe(1);
      expect(result.manualCount).toBe(3);
      expect(result.automaticCount).toBe(2);
      expect(result.averageDurationSeconds).toBe(46); // rounded from 45.5
      expect(result.lastRollback).toBeDefined();
      expect(result.lastRollback?.id).toBe('last-rollback');
    });

    it('should return zero counts when no rollbacks', async () => {
      const mockSummaryQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRollbacks: '0',
          successCount: '0',
          failedCount: '0',
          manualCount: '0',
          automaticCount: '0',
          avgDuration: null,
        }),
      };
      mockRollbackRepository.createQueryBuilder.mockReturnValue(
        mockSummaryQueryBuilder,
      );
      mockRollbackRepository.findOne.mockResolvedValue(null);

      const result = await service.getRollbackSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.totalRollbacks).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.manualCount).toBe(0);
      expect(result.automaticCount).toBe(0);
      expect(result.averageDurationSeconds).toBeNull();
    });

    it('should return null lastRollback when no rollbacks', async () => {
      const mockSummaryQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRollbacks: '0',
          successCount: '0',
          failedCount: '0',
          manualCount: '0',
          automaticCount: '0',
          avgDuration: null,
        }),
      };
      mockRollbackRepository.createQueryBuilder.mockReturnValue(
        mockSummaryQueryBuilder,
      );
      mockRollbackRepository.findOne.mockResolvedValue(null);

      const result = await service.getRollbackSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.lastRollback).toBeNull();
    });
  });
});
