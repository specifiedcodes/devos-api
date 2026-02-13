import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RailwayController } from './railway.controller';
import { RailwayService } from './railway.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

describe('RailwayController', () => {
  let controller: RailwayController;
  let mockRailwayService: any;
  let mockIntegrationService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockReq = { user: { userId: mockUserId } };

  const mockProject = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    githubRepoUrl: 'https://github.com/testuser/my-repo',
    railwayProjectId: null as string | null,
  };

  const mockProjectWithRailway = {
    ...mockProject,
    railwayProjectId: 'railway-project-uuid',
  };

  beforeEach(async () => {
    mockRailwayService = {
      createProject: jest.fn(),
      linkGitHubRepoToProject: jest.fn(),
      triggerDeployment: jest.fn(),
      getDeployment: jest.fn(),
      listDeployments: jest.fn(),
      upsertEnvironmentVariables: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest
        .fn()
        .mockResolvedValue('railway_test_token'),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue({ ...mockProject }),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve(entity),
      ),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RailwayController],
      providers: [
        { provide: RailwayService, useValue: mockRailwayService },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationService,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<RailwayController>(RailwayController);
    jest.clearAllMocks();
    // Restore default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue(
      'railway_test_token',
    );
    mockProjectRepository.findOne.mockResolvedValue({ ...mockProject });
    mockProjectRepository.save.mockImplementation((entity: any) =>
      Promise.resolve(entity),
    );
    mockAuditService.log.mockResolvedValue(undefined);
    mockNotificationService.create.mockResolvedValue({ id: 'notif-1' });
  });

  describe('POST /projects (createProject)', () => {
    const projectResponse = {
      id: 'railway-project-uuid',
      name: 'my-app',
      description: 'My App',
      projectUrl: 'https://railway.app/project/railway-project-uuid',
      environments: [{ id: 'env-uuid', name: 'production' }],
      createdAt: '2026-02-01T10:00:00Z',
    };

    it('should return 201 with project details', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      const result = await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', linkGitHubRepo: true },
        mockReq,
      );

      expect(result).toEqual(projectResponse);
      expect(mockRailwayService.createProject).toHaveBeenCalledWith(
        'railway_test_token',
        { name: 'my-app', description: undefined },
      );
    });

    it('should return 400 when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createProject(
          mockWorkspaceId,
          mockProjectId,
          { name: 'my-app' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 403 when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.createProject(
          mockWorkspaceId,
          mockProjectId,
          { name: 'my-app' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should link GitHub repo when linkGitHubRepo=true and githubRepoUrl exists', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', linkGitHubRepo: true },
        mockReq,
      );

      expect(
        mockRailwayService.linkGitHubRepoToProject,
      ).toHaveBeenCalledWith(
        'railway_test_token',
        'railway-project-uuid',
        'testuser/my-repo',
      );
    });

    it('should skip GitHub linking when linkGitHubRepo=false', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', linkGitHubRepo: false },
        mockReq,
      );

      expect(
        mockRailwayService.linkGitHubRepoToProject,
      ).not.toHaveBeenCalled();
    });

    it('should store railwayProjectId in project', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          railwayProjectId: 'railway-project-uuid',
        }),
      );
    });

    it('should log audit event after creation', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'railway-project-uuid',
        expect.objectContaining({
          action: 'integration.railway.project_created',
          railwayProjectName: 'my-app',
        }),
      );
    });

    it('should create notification after creation', async () => {
      mockRailwayService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'railway_project_created',
          title: expect.stringContaining('my-app'),
        }),
      );
    });
  });

  describe('POST /deployments (triggerDeployment)', () => {
    const deploymentResponse = {
      id: 'deployment-uuid',
      status: 'building',
      projectId: 'railway-project-uuid',
      environmentId: 'env-uuid',
      branch: 'main',
      createdAt: '2026-02-01T10:05:00Z',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
    });

    it('should return 201 with deployment details', async () => {
      mockRailwayService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      const result = await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { branch: 'main' },
        mockReq,
      );

      expect(result).toEqual(deploymentResponse);
      expect(mockRailwayService.triggerDeployment).toHaveBeenCalledWith(
        'railway_test_token',
        expect.objectContaining({
          projectId: 'railway-project-uuid',
          branch: 'main',
        }),
      );
    });

    it('should return 400 when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.triggerDeployment(
          mockWorkspaceId,
          mockProjectId,
          { branch: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.triggerDeployment(
          mockWorkspaceId,
          mockProjectId,
          { branch: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event after deployment trigger', async () => {
      mockRailwayService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { branch: 'main' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'deployment-uuid',
        expect.objectContaining({
          action: 'integration.railway.deployment_triggered',
          branch: 'main',
        }),
      );
    });

    it('should create notification after deployment trigger', async () => {
      mockRailwayService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { branch: 'main' },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'deployment_triggered',
          title: expect.stringContaining('My Project'),
        }),
      );
    });
  });

  describe('GET /deployments/:id (getDeployment)', () => {
    const deploymentResponse = {
      id: 'deployment-uuid',
      status: 'success',
      projectId: 'railway-project-uuid',
      environmentId: 'env-uuid',
      deploymentUrl: 'https://my-app.up.railway.app',
      createdAt: '2026-02-01T10:05:00Z',
      updatedAt: '2026-02-01T10:08:00Z',
    };

    it('should return 200 with deployment status', async () => {
      mockRailwayService.getDeployment.mockResolvedValue(
        deploymentResponse,
      );

      const result = await controller.getDeployment(
        mockWorkspaceId,
        mockProjectId,
        'deployment-uuid',
      );

      expect(result).toEqual(deploymentResponse);
    });

    it('should return 404 when deployment not found', async () => {
      mockRailwayService.getDeployment.mockResolvedValue(null);

      await expect(
        controller.getDeployment(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /deployments (listDeployments)', () => {
    const listResponse = {
      deployments: [
        {
          id: 'dep-1',
          status: 'success',
          branch: 'main',
          createdAt: '2026-02-01T10:05:00Z',
        },
      ],
      total: 5,
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
    });

    it('should return 200 with deployment list', async () => {
      mockRailwayService.listDeployments.mockResolvedValue(listResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result).toEqual(listResponse);
      expect(mockRailwayService.listDeployments).toHaveBeenCalledWith(
        'railway_test_token',
        'railway-project-uuid',
        expect.objectContaining({
          first: 10,
        }),
      );
    });

    it('should pass query parameters', async () => {
      mockRailwayService.listDeployments.mockResolvedValue(listResponse);

      await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        { environmentId: 'env-uuid', perPage: 20 },
      );

      expect(mockRailwayService.listDeployments).toHaveBeenCalledWith(
        'railway_test_token',
        'railway-project-uuid',
        expect.objectContaining({
          environmentId: 'env-uuid',
          first: 20,
        }),
      );
    });

    it('should throw BadRequestException when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.listDeployments(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PUT /environments/:id/variables (setEnvironmentVariables)', () => {
    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
    });

    it('should return 200 with success', async () => {
      mockRailwayService.upsertEnvironmentVariables.mockResolvedValue(
        undefined,
      );

      const result = await controller.setEnvironmentVariables(
        mockWorkspaceId,
        mockProjectId,
        'env-uuid',
        { variables: { DATABASE_URL: 'postgresql://...', NODE_ENV: 'production' } },
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.variableCount).toBe(2);
      expect(result.environmentId).toBe('env-uuid');
    });

    it('should return 400 for invalid variable names', async () => {
      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          'env-uuid',
          { variables: { 'invalid-name': 'value' } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for variable names starting with number', async () => {
      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          'env-uuid',
          { variables: { '1INVALID': 'value' } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event with variable names only (not values)', async () => {
      mockRailwayService.upsertEnvironmentVariables.mockResolvedValue(
        undefined,
      );

      await controller.setEnvironmentVariables(
        mockWorkspaceId,
        mockProjectId,
        'env-uuid',
        { variables: { DATABASE_URL: 'postgresql://secret', API_KEY: 'sk-secret' } },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'railway-project-uuid',
        expect.objectContaining({
          action: 'integration.railway.env_vars_updated',
          variableNames: ['DATABASE_URL', 'API_KEY'],
          variableCount: 2,
        }),
      );

      // Verify values are NOT in the audit log call
      const auditCall = mockAuditService.log.mock.calls[0];
      const metadata = auditCall[5];
      expect(JSON.stringify(metadata)).not.toContain('postgresql://secret');
      expect(JSON.stringify(metadata)).not.toContain('sk-secret');
    });

    it('should return 400 when more than 50 variables provided', async () => {
      const tooManyVars: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        tooManyVars[`VAR_${i}`] = `value_${i}`;
      }

      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          'env-uuid',
          { variables: tooManyVars },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          'env-uuid',
          { variables: { NODE_ENV: 'production' } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
