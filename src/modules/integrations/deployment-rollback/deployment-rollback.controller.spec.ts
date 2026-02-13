import { Test, TestingModule } from '@nestjs/testing';
import { DeploymentRollbackController } from './deployment-rollback.controller';
import { DeploymentRollbackService } from './deployment-rollback.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('DeploymentRollbackController', () => {
  let controller: DeploymentRollbackController;
  let mockService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockRollbackId = '55555555-5555-5555-5555-555555555555';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const mockRollbackResponse = {
    id: mockRollbackId,
    projectId: mockProjectId,
    platform: 'railway',
    deploymentId: 'deploy-current',
    targetDeploymentId: 'deploy-prev',
    newDeploymentId: 'deploy-new',
    environment: 'production',
    status: 'success',
    reason: 'Health check failures',
    triggerType: 'manual',
    initiatedBy: mockUserId,
    initiatedAt: '2026-02-01T10:00:00.000Z',
    completedAt: '2026-02-01T10:01:30.000Z',
    errorMessage: undefined,
  };

  beforeEach(async () => {
    mockService = {
      initiateManualRollback: jest.fn(),
      initiateAutoRollback: jest.fn(),
      listRollbacks: jest.fn(),
      getRollbackDetail: jest.fn(),
      getRollbackSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeploymentRollbackController],
      providers: [
        { provide: DeploymentRollbackService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DeploymentRollbackController>(
      DeploymentRollbackController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST / (manual rollback)', () => {
    it('should return 201 with created rollback', async () => {
      mockService.initiateManualRollback.mockResolvedValue(
        mockRollbackResponse,
      );

      const dto = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        targetDeploymentId: 'deploy-prev',
        environment: 'production',
        reason: 'Health check failures',
      };

      const result = await controller.initiateManualRollback(
        mockWorkspaceId,
        mockProjectId,
        dto as any,
        { user: { userId: mockUserId } },
      );

      expect(result).toEqual(mockRollbackResponse);
      expect(mockService.initiateManualRollback).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        dto,
      );
    });

    it('should return 400 when no previous successful deployment', async () => {
      mockService.initiateManualRollback.mockRejectedValue(
        new BadRequestException(
          'No previous successful deployment found to rollback to',
        ),
      );

      const dto = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
      };

      await expect(
        controller.initiateManualRollback(
          mockWorkspaceId,
          mockProjectId,
          dto as any,
          { user: { userId: mockUserId } },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 when platform not connected', async () => {
      mockService.initiateManualRollback.mockRejectedValue(
        new BadRequestException(
          'railway integration not connected for this workspace',
        ),
      );

      const dto = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
      };

      await expect(
        controller.initiateManualRollback(
          mockWorkspaceId,
          mockProjectId,
          dto as any,
          { user: { userId: mockUserId } },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /auto (automatic rollback)', () => {
    it('should return 201 with created rollback', async () => {
      const autoResponse = {
        ...mockRollbackResponse,
        triggerType: 'automatic',
      };
      mockService.initiateAutoRollback.mockResolvedValue(autoResponse);

      const dto = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
        reason: 'Smoke tests failed: health endpoint returned 503',
      };

      const result = await controller.initiateAutoRollback(
        mockWorkspaceId,
        mockProjectId,
        dto as any,
        { user: { userId: mockUserId } },
      );

      expect(result).toEqual(autoResponse);
      expect(mockService.initiateAutoRollback).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        dto,
      );
    });

    it('should return 400 when no previous successful deployment', async () => {
      mockService.initiateAutoRollback.mockRejectedValue(
        new BadRequestException(
          'No previous successful deployment found to rollback to',
        ),
      );

      const dto = {
        platform: 'railway',
        deploymentId: 'deploy-current',
        environment: 'production',
        reason: 'Smoke test failure',
      };

      await expect(
        controller.initiateAutoRollback(
          mockWorkspaceId,
          mockProjectId,
          dto as any,
          { user: { userId: mockUserId } },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET / (list rollbacks)', () => {
    it('should return 200 with paginated rollback list', async () => {
      const listResponse = {
        rollbacks: [mockRollbackResponse],
        total: 1,
        page: 1,
        perPage: 10,
      };
      mockService.listRollbacks.mockResolvedValue(listResponse);

      const result = await controller.listRollbacks(
        mockWorkspaceId,
        mockProjectId,
        {} as any,
      );

      expect(result).toEqual(listResponse);
      expect(mockService.listRollbacks).toHaveBeenCalledWith(
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

    it('should return 200 with platform filter', async () => {
      const listResponse = {
        rollbacks: [mockRollbackResponse],
        total: 1,
        page: 1,
        perPage: 10,
      };
      mockService.listRollbacks.mockResolvedValue(listResponse);

      const result = await controller.listRollbacks(
        mockWorkspaceId,
        mockProjectId,
        { platform: 'railway' } as any,
      );

      expect(result).toEqual(listResponse);
      expect(mockService.listRollbacks).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.objectContaining({ platform: 'railway' }),
      );
    });

    it('should return 200 with status filter', async () => {
      const listResponse = {
        rollbacks: [mockRollbackResponse],
        total: 1,
        page: 1,
        perPage: 10,
      };
      mockService.listRollbacks.mockResolvedValue(listResponse);

      const result = await controller.listRollbacks(
        mockWorkspaceId,
        mockProjectId,
        { status: 'success' } as any,
      );

      expect(result).toEqual(listResponse);
      expect(mockService.listRollbacks).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.objectContaining({ status: 'success' }),
      );
    });
  });

  describe('GET /summary', () => {
    it('should return 200 with rollback summary', async () => {
      const summaryResponse = {
        totalRollbacks: 5,
        successCount: 4,
        failedCount: 1,
        manualCount: 3,
        automaticCount: 2,
        averageDurationSeconds: 45,
        lastRollback: {
          id: mockRollbackId,
          platform: 'railway',
          status: 'success',
          triggerType: 'manual',
          initiatedAt: '2026-02-01T10:00:00.000Z',
          completedAt: '2026-02-01T10:01:30.000Z',
        },
      };
      mockService.getRollbackSummary.mockResolvedValue(summaryResponse);

      const result = await controller.getRollbackSummary(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(summaryResponse);
      expect(mockService.getRollbackSummary).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });
  });

  describe('GET /:rollbackId', () => {
    it('should return 200 with rollback detail', async () => {
      mockService.getRollbackDetail.mockResolvedValue(mockRollbackResponse);

      const result = await controller.getRollbackDetail(
        mockWorkspaceId,
        mockProjectId,
        mockRollbackId,
      );

      expect(result).toEqual(mockRollbackResponse);
      expect(mockService.getRollbackDetail).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockRollbackId,
      );
    });

    it('should return 404 when not found', async () => {
      mockService.getRollbackDetail.mockRejectedValue(
        new NotFoundException('Rollback not found'),
      );

      await expect(
        controller.getRollbackDetail(
          mockWorkspaceId,
          mockProjectId,
          mockRollbackId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
