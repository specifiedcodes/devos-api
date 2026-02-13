import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeploymentApprovalService } from './deployment-approval.service';
import {
  DeploymentApproval,
  DeploymentApprovalStatus,
} from '../../../database/entities/deployment-approval.entity';
import { Project } from '../../../database/entities/project.entity';
import {
  ProjectPreferences,
  DeploymentApprovalMode,
} from '../../../database/entities/project-preferences.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';

/**
 * DeploymentApprovalService Tests
 * Story 6.9: Manual Deployment Approval
 */
describe('DeploymentApprovalService', () => {
  let service: DeploymentApprovalService;
  let mockApprovalRepository: any;
  let mockProjectRepository: any;
  let mockPreferencesRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockApprovalId = '44444444-4444-4444-4444-444444444444';

  const mockProjectManual = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    preferences: {
      deploymentApprovalMode: DeploymentApprovalMode.MANUAL,
    },
  };

  const mockProjectAutomatic = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    preferences: {
      deploymentApprovalMode: DeploymentApprovalMode.AUTOMATIC,
    },
  };

  const mockProjectHybrid = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    preferences: {
      deploymentApprovalMode: DeploymentApprovalMode.STAGING_AUTO_PRODUCTION_MANUAL,
    },
  };

  const mockProjectNoPreferences = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    preferences: null,
  };

  const mockPendingApproval = {
    id: mockApprovalId,
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    platform: 'railway',
    branch: 'main',
    commitSha: 'abc123def456',
    environment: 'production',
    status: DeploymentApprovalStatus.PENDING,
    storyId: '5-2',
    storyTitle: 'User Profile Management',
    changes: ['src/controllers/profile.ts', 'src/services/profile.ts'],
    testResults: { passed: 45, failed: 0, skipped: 2 },
    requestedBy: 'system',
    reviewedBy: null,
    rejectionReason: null,
    requestedAt: new Date('2026-02-01T10:00:00Z'),
    reviewedAt: null,
  };

  const mockApprovedApproval = {
    ...mockPendingApproval,
    status: DeploymentApprovalStatus.APPROVED,
    reviewedBy: mockUserId,
    reviewedAt: new Date('2026-02-01T10:15:00Z'),
  };

  beforeEach(async () => {
    mockApprovalRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockImplementation(() =>
        Promise.resolve(JSON.parse(JSON.stringify(mockProjectManual))),
      ),
    };

    mockPreferencesRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentApprovalService,
        {
          provide: getRepositoryToken(DeploymentApproval),
          useValue: mockApprovalRepository,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        {
          provide: getRepositoryToken(ProjectPreferences),
          useValue: mockPreferencesRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<DeploymentApprovalService>(DeploymentApprovalService);
  });

  // ---- getApprovalSettings ----

  describe('getApprovalSettings', () => {
    it('should return current approval mode for project', async () => {
      const result = await service.getApprovalSettings(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.projectId).toBe(mockProjectId);
      expect(result.approvalMode).toBe(DeploymentApprovalMode.MANUAL);
      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockProjectId, workspaceId: mockWorkspaceId },
        relations: ['preferences'],
      });
    });

    it('should return "automatic" default when no preference set', async () => {
      mockProjectRepository.findOne.mockResolvedValue(mockProjectNoPreferences);

      const result = await service.getApprovalSettings(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.approvalMode).toBe(DeploymentApprovalMode.AUTOMATIC);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getApprovalSettings(mockWorkspaceId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- updateApprovalSettings ----

  describe('updateApprovalSettings', () => {
    it('should update approval mode successfully', async () => {
      const preferences = {
        id: 'pref-1',
        projectId: mockProjectId,
        deploymentApprovalMode: DeploymentApprovalMode.MANUAL,
      };
      mockPreferencesRepository.save.mockResolvedValue({
        ...preferences,
        deploymentApprovalMode: DeploymentApprovalMode.STAGING_AUTO_PRODUCTION_MANUAL,
      });

      const result = await service.updateApprovalSettings(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        { approvalMode: 'staging_auto_production_manual' },
      );

      expect(result.projectId).toBe(mockProjectId);
      expect(result.approvalMode).toBe(DeploymentApprovalMode.STAGING_AUTO_PRODUCTION_MANUAL);
      expect(result.updatedAt).toBeDefined();
    });

    it('should log audit event on update', async () => {
      mockPreferencesRepository.save.mockResolvedValue({
        deploymentApprovalMode: DeploymentApprovalMode.MANUAL,
      });

      await service.updateApprovalSettings(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        { approvalMode: 'manual' },
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'deployment.approval_settings_updated',
        'project',
        mockProjectId,
        expect.objectContaining({ oldMode: DeploymentApprovalMode.MANUAL, newMode: 'manual' }),
      );
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateApprovalSettings(
          mockWorkspaceId,
          'invalid-id',
          mockUserId,
          { approvalMode: 'manual' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create preferences when none exist', async () => {
      mockProjectRepository.findOne.mockResolvedValue(mockProjectNoPreferences);
      const newPrefs = {
        projectId: mockProjectId,
        deploymentApprovalMode: DeploymentApprovalMode.MANUAL,
      };
      mockPreferencesRepository.create.mockReturnValue(newPrefs);
      mockPreferencesRepository.save.mockResolvedValue(newPrefs);

      const result = await service.updateApprovalSettings(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        { approvalMode: 'manual' },
      );

      expect(mockPreferencesRepository.create).toHaveBeenCalled();
      expect(result.approvalMode).toBe(DeploymentApprovalMode.MANUAL);
    });
  });

  // ---- createApprovalRequest ----

  describe('createApprovalRequest', () => {
    const createDto = {
      platform: 'railway' as const,
      branch: 'main',
      commitSha: 'abc123def456',
      environment: 'production' as const,
      storyId: '5-2',
      storyTitle: 'User Profile Management',
      changes: ['src/controllers/profile.ts', 'src/services/profile.ts'],
      testResults: { passed: 45, failed: 0, skipped: 2 },
    };

    it('should create a pending approval request', async () => {
      mockApprovalRepository.create.mockReturnValue(mockPendingApproval);
      mockApprovalRepository.save.mockResolvedValue(mockPendingApproval);

      const result = await service.createApprovalRequest(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        createDto as any,
      );

      expect(result.status).toBe('pending');
      expect(result.platform).toBe('railway');
      expect(result.environment).toBe('production');
      expect(mockApprovalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          status: DeploymentApprovalStatus.PENDING,
          requestedBy: mockUserId,
        }),
      );
    });

    it('should send notification on creation', async () => {
      mockApprovalRepository.create.mockReturnValue(mockPendingApproval);
      mockApprovalRepository.save.mockResolvedValue(mockPendingApproval);

      await service.createApprovalRequest(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        createDto as any,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'deployment_approval_requested',
          title: 'Deployment Approval Required',
        }),
      );
    });

    it('should return 400 when project uses automatic mode', async () => {
      mockProjectRepository.findOne.mockResolvedValue(mockProjectAutomatic);

      await expect(
        service.createApprovalRequest(
          mockWorkspaceId,
          mockProjectId,
          mockUserId,
          createDto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for staging when mode is staging_auto_production_manual', async () => {
      mockProjectRepository.findOne.mockResolvedValue(mockProjectHybrid);

      const stagingDto = { ...createDto, environment: 'staging' };

      await expect(
        service.createApprovalRequest(
          mockWorkspaceId,
          mockProjectId,
          mockUserId,
          stagingDto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create approval for production when mode is staging_auto_production_manual', async () => {
      mockProjectRepository.findOne.mockResolvedValue(mockProjectHybrid);
      mockApprovalRepository.create.mockReturnValue(mockPendingApproval);
      mockApprovalRepository.save.mockResolvedValue(mockPendingApproval);

      const result = await service.createApprovalRequest(
        mockWorkspaceId,
        mockProjectId,
        mockUserId,
        createDto as any,
      );

      expect(result.status).toBe('pending');
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createApprovalRequest(
          mockWorkspaceId,
          'invalid-id',
          mockUserId,
          createDto as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- listApprovalRequests ----

  describe('listApprovalRequests', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockPendingApproval]),
      };
      mockApprovalRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
    });

    it('should return paginated list sorted by requestedAt desc', async () => {
      const result = await service.listApprovalRequests(
        mockWorkspaceId,
        mockProjectId,
        { page: 1, perPage: 10 },
      );

      expect(result.approvals.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(10);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'approval.requestedAt',
        'DESC',
      );
    });

    it('should validate project exists before listing', async () => {
      expect(mockProjectRepository.findOne).toBeDefined();
      await service.listApprovalRequests(mockWorkspaceId, mockProjectId, {});
      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockProjectId, workspaceId: mockWorkspaceId },
      });
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listApprovalRequests(mockWorkspaceId, 'invalid-id', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter by status', async () => {
      await service.listApprovalRequests(mockWorkspaceId, mockProjectId, {
        status: 'pending',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'approval.status = :status',
        { status: 'pending' },
      );
    });

    it('should return empty list when no approvals exist', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.listApprovalRequests(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result.approvals).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ---- getApprovalDetail ----

  describe('getApprovalDetail', () => {
    it('should return approval with full details', async () => {
      mockApprovalRepository.findOne.mockResolvedValue(mockPendingApproval);

      const result = await service.getApprovalDetail(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
      );

      expect(result.id).toBe(mockApprovalId);
      expect(result.platform).toBe('railway');
      expect(result.status).toBe('pending');
      expect(result.storyId).toBe('5-2');
      expect(result.changes).toEqual([
        'src/controllers/profile.ts',
        'src/services/profile.ts',
      ]);
      expect(result.testResults).toEqual({
        passed: 45,
        failed: 0,
        skipped: 2,
      });
    });

    it('should throw NotFoundException for invalid approval id', async () => {
      mockApprovalRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getApprovalDetail(
          mockWorkspaceId,
          mockProjectId,
          'invalid-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- approveDeployment ----

  describe('approveDeployment', () => {
    it('should update status to approved with reviewedAt and reviewedBy', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date('2026-02-01T10:15:00Z'),
        }),
      );

      const result = await service.approveDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
      );

      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe(mockUserId);
      expect(result.reviewedAt).toBeDefined();
    });

    it('should send notification on approval', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      await service.approveDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_approved',
          title: 'Deployment Approved',
        }),
      );
    });

    it('should log audit event', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      await service.approveDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'deployment.approved',
        'deployment_approval',
        mockApprovalId,
        expect.objectContaining({
          projectId: mockProjectId,
          platform: 'railway',
          environment: 'production',
        }),
      );
    });

    it('should throw BadRequestException when not pending', async () => {
      mockApprovalRepository.findOne.mockResolvedValue(mockApprovedApproval);

      await expect(
        service.approveDeployment(
          mockWorkspaceId,
          mockProjectId,
          mockApprovalId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid approval', async () => {
      mockApprovalRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approveDeployment(
          mockWorkspaceId,
          mockProjectId,
          'invalid-id',
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- rejectDeployment ----

  describe('rejectDeployment', () => {
    it('should update status to rejected with reason', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date('2026-02-01T10:20:00Z'),
        }),
      );

      const result = await service.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
        'Tests need to cover edge case for null input',
      );

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe(
        'Tests need to cover edge case for null input',
      );
    });

    it('should set reviewedAt, reviewedBy, and rejectionReason', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      const result = await service.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
        'Reason text',
      );

      expect(result.reviewedBy).toBe(mockUserId);
      expect(result.reviewedAt).toBeDefined();
      expect(result.rejectionReason).toBe('Reason text');
    });

    it('should send notification on rejection', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      await service.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
        'Some reason',
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_rejected',
          title: 'Deployment Rejected',
        }),
      );
    });

    it('should log audit event', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      await service.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
        'Reason text',
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'deployment.rejected',
        'deployment_approval',
        mockApprovalId,
        expect.objectContaining({
          projectId: mockProjectId,
          reason: 'Reason text',
        }),
      );
    });

    it('should throw BadRequestException when not pending', async () => {
      mockApprovalRepository.findOne.mockResolvedValue(mockApprovedApproval);

      await expect(
        service.rejectDeployment(
          mockWorkspaceId,
          mockProjectId,
          mockApprovalId,
          mockUserId,
          'Reason',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should work without rejection reason', async () => {
      mockApprovalRepository.findOne.mockResolvedValue({
        ...mockPendingApproval,
      });
      mockApprovalRepository.save.mockImplementation((approval: any) =>
        Promise.resolve({
          ...approval,
          reviewedAt: new Date(),
        }),
      );

      const result = await service.rejectDeployment(
        mockWorkspaceId,
        mockProjectId,
        mockApprovalId,
        mockUserId,
      );

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBeUndefined();
    });
  });

  // ---- getPendingCount ----

  describe('getPendingCount', () => {
    it('should return correct count of pending approvals', async () => {
      mockApprovalRepository.count.mockResolvedValue(3);

      const result = await service.getPendingCount(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.pendingCount).toBe(3);
      expect(mockApprovalRepository.count).toHaveBeenCalledWith({
        where: {
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          status: DeploymentApprovalStatus.PENDING,
        },
      });
    });

    it('should return 0 when no pending approvals', async () => {
      mockApprovalRepository.count.mockResolvedValue(0);

      const result = await service.getPendingCount(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.pendingCount).toBe(0);
    });
  });
});
