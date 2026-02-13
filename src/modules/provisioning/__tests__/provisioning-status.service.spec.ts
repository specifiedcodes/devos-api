import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProvisioningStatusService } from '../services/provisioning-status.service';
import { ProvisioningStatus, ProvisioningStatusEnum } from '../../../database/entities/provisioning-status.entity';
import { NotFoundException } from '@nestjs/common';

describe('ProvisioningStatusService', () => {
  let service: ProvisioningStatusService;
  let repository: Repository<ProvisioningStatus>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningStatusService,
        {
          provide: getRepositoryToken(ProvisioningStatus),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProvisioningStatusService>(ProvisioningStatusService);
    repository = module.get<Repository<ProvisioningStatus>>(
      getRepositoryToken(ProvisioningStatus),
    );

    // Clear mocks before each test
    jest.clearAllMocks();
  });

  describe('createProvisioningStatus', () => {
    it('should create a new provisioning status with default steps', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const workspaceId = '550e8400-e29b-41d4-a716-446655440002';

      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId,
        status: ProvisioningStatusEnum.PENDING,
        steps: {
          github_repo_created: { status: 'pending' },
          database_provisioned: { status: 'pending' },
          deployment_configured: { status: 'pending' },
          project_initialized: { status: 'pending' },
        },
        currentStep: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockStatus);
      mockRepository.save.mockResolvedValue(mockStatus);

      const result = await service.createProvisioningStatus(projectId, workspaceId);

      expect(result).toEqual(mockStatus);
      expect(mockRepository.create).toHaveBeenCalledWith({
        projectId,
        workspaceId,
        status: ProvisioningStatusEnum.PENDING,
        steps: {
          github_repo_created: { status: 'pending' },
          database_provisioned: { status: 'pending' },
          deployment_configured: { status: 'pending' },
          project_initialized: { status: 'pending' },
        },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('findByProjectId', () => {
    it('should find provisioning status by project ID', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440002',
        status: ProvisioningStatusEnum.IN_PROGRESS,
      };

      mockRepository.findOne.mockResolvedValue(mockStatus);

      const result = await service.findByProjectId(projectId);

      expect(result).toEqual(mockStatus);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { projectId },
      });
    });

    it('should return null if provisioning status not found', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByProjectId(projectId);

      expect(result).toBeNull();
    });
  });

  describe('findByWorkspaceId', () => {
    it('should find all provisioning statuses in a workspace', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      const mockStatuses: Partial<ProvisioningStatus>[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          projectId: '550e8400-e29b-41d4-a716-446655440001',
          workspaceId,
          status: ProvisioningStatusEnum.IN_PROGRESS,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          projectId: '550e8400-e29b-41d4-a716-446655440004',
          workspaceId,
          status: ProvisioningStatusEnum.COMPLETED,
        },
      ];

      mockRepository.find.mockResolvedValue(mockStatuses);

      const result = await service.findByWorkspaceId(workspaceId);

      expect(result).toEqual(mockStatuses);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { workspaceId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('updateStepStatus', () => {
    it('should update a specific step status', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const stepName = 'github_repo_created';
      const status = 'completed';
      const timestamp = new Date().toISOString();

      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440002',
        status: ProvisioningStatusEnum.IN_PROGRESS,
        steps: {
          github_repo_created: { status: 'in_progress', startedAt: timestamp },
          database_provisioned: { status: 'pending' },
          deployment_configured: { status: 'pending' },
          project_initialized: { status: 'pending' },
        },
      };

      mockRepository.findOne.mockResolvedValue(mockStatus);
      mockRepository.save.mockResolvedValue({
        ...mockStatus,
        steps: {
          ...mockStatus.steps,
          github_repo_created: { status: 'completed', startedAt: timestamp, completedAt: timestamp },
        },
      });

      const result = await service.updateStepStatus(projectId, stepName, status as any);

      expect(result.steps.github_repo_created.status).toBe('completed');
      expect(result.steps.github_repo_created.completedAt).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if provisioning status not found', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';

      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStepStatus(projectId, 'github_repo_created', 'completed' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should add error message when step fails', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const stepName = 'github_repo_created';
      const status = 'failed';
      const error = 'GitHub API rate limit exceeded';

      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440002',
        status: ProvisioningStatusEnum.IN_PROGRESS,
        steps: {
          github_repo_created: { status: 'in_progress' },
          database_provisioned: { status: 'pending' },
          deployment_configured: { status: 'pending' },
          project_initialized: { status: 'pending' },
        },
      };

      mockRepository.findOne.mockResolvedValue(mockStatus);
      mockRepository.save.mockResolvedValue({
        ...mockStatus,
        steps: {
          ...mockStatus.steps,
          github_repo_created: { status: 'failed', error },
        },
      });

      const result = await service.updateStepStatus(projectId, stepName, status as any, error);

      expect(result.steps.github_repo_created.status).toBe('failed');
      expect(result.steps.github_repo_created.error).toBe(error);
    });
  });

  describe('updateOverallStatus', () => {
    it('should update overall provisioning status', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const status = ProvisioningStatusEnum.COMPLETED;

      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440002',
        status: ProvisioningStatusEnum.IN_PROGRESS,
      };

      mockRepository.findOne.mockResolvedValue(mockStatus);
      mockRepository.save.mockResolvedValue({
        ...mockStatus,
        status,
        completedAt: new Date(),
      });

      const result = await service.updateOverallStatus(projectId, status);

      expect(result.status).toBe(status);
      expect(result.completedAt).toBeDefined();
    });

    it('should set error message when status is failed', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const status = ProvisioningStatusEnum.FAILED;
      const errorMessage = 'Critical provisioning failure';

      const mockStatus: Partial<ProvisioningStatus> = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440002',
        status: ProvisioningStatusEnum.IN_PROGRESS,
      };

      mockRepository.findOne.mockResolvedValue(mockStatus);
      mockRepository.save.mockResolvedValue({
        ...mockStatus,
        status,
        errorMessage,
      });

      const result = await service.updateOverallStatus(projectId, status, errorMessage);

      expect(result.status).toBe(status);
      expect(result.errorMessage).toBe(errorMessage);
    });
  });

  describe('deleteByProjectId', () => {
    it('should delete provisioning status by project ID', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';

      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteByProjectId(projectId);

      expect(mockRepository.delete).toHaveBeenCalledWith({ projectId });
    });
  });

  describe('Workspace Isolation', () => {
    it('should filter by workspace ID in findByWorkspaceId', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440002';

      mockRepository.find.mockResolvedValue([]);

      await service.findByWorkspaceId(workspaceId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { workspaceId },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
