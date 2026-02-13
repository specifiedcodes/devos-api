import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DeploymentApprovalController } from './deployment-approval.controller';
import { DeploymentApprovalService } from './deployment-approval.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

/**
 * DeploymentApprovalController Tests
 * Story 6.9: Manual Deployment Approval
 */
describe('DeploymentApprovalController', () => {
  let controller: DeploymentApprovalController;
  let mockService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockApprovalId = '44444444-4444-4444-4444-444444444444';

  const mockReq = {
    user: { userId: mockUserId },
  };

  const mockApprovalSettings = {
    projectId: mockProjectId,
    approvalMode: 'automatic',
  };

  const mockUpdatedSettings = {
    projectId: mockProjectId,
    approvalMode: 'manual',
    updatedAt: '2026-02-01T10:00:00.000Z',
  };

  const mockApproval = {
    id: mockApprovalId,
    projectId: mockProjectId,
    platform: 'railway',
    branch: 'main',
    commitSha: 'abc123def456',
    environment: 'production',
    status: 'pending',
    storyId: '5-2',
    storyTitle: 'User Profile Management',
    changes: ['src/controllers/profile.ts'],
    testResults: { passed: 45, failed: 0, skipped: 2 },
    requestedAt: '2026-02-01T10:00:00.000Z',
    requestedBy: 'system',
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  };

  const mockApprovedApproval = {
    ...mockApproval,
    status: 'approved',
    reviewedAt: '2026-02-01T10:15:00.000Z',
    reviewedBy: mockUserId,
  };

  const mockRejectedApproval = {
    ...mockApproval,
    status: 'rejected',
    reviewedAt: '2026-02-01T10:20:00.000Z',
    reviewedBy: mockUserId,
    rejectionReason: 'Tests need to cover edge case for null input',
  };

  const mockApprovalList = {
    approvals: [mockApproval],
    total: 1,
    page: 1,
    perPage: 10,
  };

  const mockPendingCount = {
    pendingCount: 3,
  };

  beforeEach(async () => {
    mockService = {
      getApprovalSettings: jest.fn(),
      updateApprovalSettings: jest.fn(),
      createApprovalRequest: jest.fn(),
      listApprovalRequests: jest.fn(),
      getApprovalDetail: jest.fn(),
      approveDeployment: jest.fn(),
      rejectDeployment: jest.fn(),
      getPendingCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeploymentApprovalController],
      providers: [
        {
          provide: DeploymentApprovalService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DeploymentApprovalController>(
      DeploymentApprovalController,
    );
  });

  // ---- Settings Endpoint Tests ----

  describe('GET /settings', () => {
    it('should return 200 with approval settings', async () => {
      mockService.getApprovalSettings.mockResolvedValue(mockApprovalSettings);

      const result = await controller.getSettings(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(mockApprovalSettings);
      expect(mockService.getApprovalSettings).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });
  });

  describe('PATCH /settings', () => {
    it('should return 200 with updated settings', async () => {
      mockService.updateApprovalSettings.mockResolvedValue(
        mockUpdatedSettings,
      );

      const result = await controller.updateSettings(
        mockWorkspaceId,
        mockProjectId,
        { approvalMode: 'manual' },
        mockReq,
      );

      expect(result).toEqual(mockUpdatedSettings);
      expect(mockService.updateApprovalSettings).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        { approvalMode: 'manual' },
      );
    });

    it('should propagate BadRequestException for invalid approval mode', async () => {
      mockService.updateApprovalSettings.mockRejectedValue(
        new BadRequestException('Invalid approval mode'),
      );

      await expect(
        controller.updateSettings(
          mockWorkspaceId,
          mockProjectId,
          { approvalMode: 'invalid' as any },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---- Create Approval Tests ----

  describe('POST /', () => {
    it('should return 201 with created approval', async () => {
      mockService.createApprovalRequest.mockResolvedValue(mockApproval);

      const dto = {
        platform: 'railway',
        branch: 'main',
        environment: 'production',
      };

      const result = await controller.createApprovalRequest(
        mockWorkspaceId,
        mockProjectId,
        dto as any,
        mockReq,
      );

      expect(result).toEqual(mockApproval);
      expect(result.status).toBe('pending');
      expect(mockService.createApprovalRequest).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        dto,
      );
    });

    it('should propagate BadRequestException when automatic mode', async () => {
      mockService.createApprovalRequest.mockRejectedValue(
        new BadRequestException(
          'Project is configured for automatic deployments. No approval needed.',
        ),
      );

      await expect(
        controller.createApprovalRequest(
          mockWorkspaceId,
          mockProjectId,
          { platform: 'railway', branch: 'main', environment: 'production' } as any,
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---- List Approvals Tests ----

  describe('GET /', () => {
    it('should return 200 with paginated approval list', async () => {
      mockService.listApprovalRequests.mockResolvedValue(mockApprovalList);

      const result = await controller.listApprovalRequests(
        mockWorkspaceId,
        mockProjectId,
        {} as any,
      );

      expect(result).toEqual(mockApprovalList);
      expect(result.approvals.length).toBe(1);
      expect(result.total).toBe(1);
      expect(mockService.listApprovalRequests).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        {
          status: undefined,
          page: undefined,
          perPage: undefined,
        },
      );
    });

    it('should return 200 with status filter', async () => {
      const filteredList = { ...mockApprovalList };
      mockService.listApprovalRequests.mockResolvedValue(filteredList);

      const result = await controller.listApprovalRequests(
        mockWorkspaceId,
        mockProjectId,
        { status: 'pending' } as any,
      );

      expect(result).toEqual(filteredList);
      expect(mockService.listApprovalRequests).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.objectContaining({ status: 'pending' }),
      );
    });
  });

  // ---- Pending Count Tests ----

  describe('GET /pending-count', () => {
    it('should return 200 with pending count', async () => {
      mockService.getPendingCount.mockResolvedValue(mockPendingCount);

      const result = await controller.getPendingCount(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(mockPendingCount);
      expect(result.pendingCount).toBe(3);
      expect(mockService.getPendingCount).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });
  });

  // ---- Approval Detail Tests ----

  describe('GET /:approvalId', () => {
    it('should return 200 with approval detail', async () => {
      mockService.getApprovalDetail.mockResolvedValue(mockApproval);

      const result = await controller.getApprovalDetail(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
      );

      expect(result).toEqual(mockApproval);
      expect(mockService.getApprovalDetail).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
      );
    });

    it('should propagate NotFoundException when not found', async () => {
      mockService.getApprovalDetail.mockRejectedValue(
        new NotFoundException('Deployment approval not found'),
      );

      await expect(
        controller.getApprovalDetail(
          mockWorkspaceId,
          mockProjectId,
          mockApprovalId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- Approve/Reject Tests ----

  describe('POST /:approvalId/approve', () => {
    it('should return 200 with approved status', async () => {
      mockService.approveDeployment.mockResolvedValue(mockApprovedApproval);

      const result = await controller.approveDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockReq,
      );

      expect(result).toEqual(mockApprovedApproval);
      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe(mockUserId);
      expect(mockService.approveDeployment).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
      );
    });

    it('should propagate BadRequestException when not pending', async () => {
      mockService.approveDeployment.mockRejectedValue(
        new BadRequestException('Cannot approve deployment.'),
      );

      await expect(
        controller.approveDeployment(
          mockWorkspaceId,
          mockProjectId,
          mockApprovalId,
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /:approvalId/reject', () => {
    it('should return 200 with rejected status', async () => {
      mockService.rejectDeployment.mockResolvedValue(mockRejectedApproval);

      const result = await controller.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        { reason: 'Tests need to cover edge case for null input' },
        mockReq,
      );

      expect(result).toEqual(mockRejectedApproval);
      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe(
        'Tests need to cover edge case for null input',
      );
      expect(mockService.rejectDeployment).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
        'Tests need to cover edge case for null input',
      );
    });

    it('should propagate BadRequestException when not pending', async () => {
      mockService.rejectDeployment.mockRejectedValue(
        new BadRequestException('Cannot reject deployment.'),
      );

      await expect(
        controller.rejectDeployment(
          mockWorkspaceId,
          mockProjectId,
          mockApprovalId,
          { reason: 'Test' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
