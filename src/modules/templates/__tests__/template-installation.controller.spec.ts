/**
 * TemplateInstallationController Tests
 *
 * Story 19-6: Template Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplateInstallationController } from '../controllers/template-installation.controller';
import { TemplateInstallationService } from '../services/template-installation.service';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { InstallationStatus, InstallationStep } from '../../../database/entities/template-installation.entity';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

// Mock the WorkspaceAccessGuard
jest.mock('../../../shared/guards/workspace-access.guard', () => ({
  WorkspaceAccessGuard: class {
    canActivate() {
      return true;
    }
  },
}));

describe('TemplateInstallationController', () => {
  let controller: TemplateInstallationController;
  let service: jest.Mocked<TemplateInstallationService>;

  const mockUserId = 'user-123';
  const mockWorkspaceId = 'workspace-123';
  const mockTemplateId = 'template-123';
  const mockInstallationId = 'installation-123';

  const mockRequest = {
    user: {
      sub: mockUserId,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateInstallationController],
      providers: [
        {
          provide: TemplateInstallationService,
          useValue: {
            startInstallation: jest.fn(),
            getInstallationStatus: jest.fn(),
            cancelInstallation: jest.fn(),
            listInstallations: jest.fn(),
            deleteInstallation: jest.fn(),
          },
        },
        {
          provide: TemplateAnalyticsService,
          useValue: {
            trackEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<TemplateInstallationController>(TemplateInstallationController);
    service = module.get(TemplateInstallationService);
  });

  describe('installTemplate', () => {
    it('should start installation and return job info', async () => {
      service.startInstallation.mockResolvedValue({
        jobId: mockInstallationId,
        status: InstallationStatus.PENDING,
        message: 'Installation started',
        statusUrl: `/api/v1/installations/${mockInstallationId}`,
      });

      const result = await controller.installTemplate(mockTemplateId, {
        projectName: 'my-project',
        workspaceId: mockWorkspaceId,
        variables: { project_name: 'my-project' },
      }, mockRequest as any);

      expect(result.jobId).toBe(mockInstallationId);
      expect(result.status).toBe(InstallationStatus.PENDING);
      expect(service.startInstallation).toHaveBeenCalledWith(
        mockUserId,
        mockTemplateId,
        expect.objectContaining({
          projectName: 'my-project',
          workspaceId: mockWorkspaceId,
        }),
      );
    });
  });

  describe('getInstallationStatus', () => {
    it('should return installation status', async () => {
      const mockStatus = {
        id: mockInstallationId,
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        projectName: 'my-project',
        status: InstallationStatus.COMPLETE,
        currentStep: InstallationStep.COMPLETED,
        progress: 100,
        error: null,
        githubRepoUrl: 'https://github.com/user/my-project',
        projectId: 'project-123',
        totalFiles: 10,
        processedFiles: 10,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      service.getInstallationStatus.mockResolvedValue(mockStatus);

      const result = await controller.getInstallationStatus(mockInstallationId, mockRequest as any);

      expect(result.id).toBe(mockInstallationId);
      expect(result.status).toBe(InstallationStatus.COMPLETE);
      expect(service.getInstallationStatus).toHaveBeenCalledWith(mockInstallationId, mockUserId);
    });
  });

  describe('cancelInstallation', () => {
    it('should cancel installation and return success', async () => {
      service.cancelInstallation.mockResolvedValue(undefined);

      const result = await controller.cancelInstallation(mockInstallationId, mockRequest as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Installation cancelled');
      expect(service.cancelInstallation).toHaveBeenCalledWith(mockInstallationId, mockUserId);
    });
  });

  describe('listInstallations', () => {
    it('should list installations for workspace', async () => {
      const mockList = {
        items: [
          {
            id: mockInstallationId,
            templateId: mockTemplateId,
            workspaceId: mockWorkspaceId,
            projectName: 'my-project',
            status: InstallationStatus.COMPLETE,
            currentStep: InstallationStep.COMPLETED,
            progress: 100,
            error: null,
            githubRepoUrl: 'https://github.com/user/my-project',
            projectId: 'project-123',
            totalFiles: 10,
            processedFiles: 10,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      service.listInstallations.mockResolvedValue(mockList);

      const result = await controller.listInstallations(mockWorkspaceId, { page: 1, limit: 20 }, mockRequest as any);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(service.listInstallations).toHaveBeenCalledWith(
        mockUserId,
        mockWorkspaceId,
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  describe('deleteInstallation', () => {
    it('should delete installation', async () => {
      service.deleteInstallation.mockResolvedValue(undefined);

      await controller.deleteInstallation(mockInstallationId, mockRequest as any);

      expect(service.deleteInstallation).toHaveBeenCalledWith(mockInstallationId, mockUserId);
    });
  });
});
