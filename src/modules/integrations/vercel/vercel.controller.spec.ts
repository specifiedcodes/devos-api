import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VercelController } from './vercel.controller';
import { VercelService } from './vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

describe('VercelController', () => {
  let controller: VercelController;
  let mockVercelService: any;
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
    vercelProjectId: null as string | null,
    railwayProjectId: null as string | null,
  };

  const mockProjectWithVercel = {
    ...mockProject,
    vercelProjectId: 'vercel-project-id',
  };

  beforeEach(async () => {
    mockVercelService = {
      createProject: jest.fn(),
      triggerDeployment: jest.fn(),
      getDeployment: jest.fn(),
      listDeployments: jest.fn(),
      upsertEnvironmentVariables: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest
        .fn()
        .mockResolvedValue('vercel_test_token'),
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
      controllers: [VercelController],
      providers: [
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

    controller = module.get<VercelController>(VercelController);
    jest.clearAllMocks();
    // Restore default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue(
      'vercel_test_token',
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
      id: 'vercel-project-id',
      name: 'my-app',
      framework: 'nextjs',
      projectUrl: 'https://vercel.com/~/projects/my-app',
      latestDeploymentUrl: null,
      createdAt: '2026-02-01T10:00:00Z',
    };

    it('should return 201 with project details', async () => {
      mockVercelService.createProject.mockResolvedValue(projectResponse);

      const result = await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', framework: 'nextjs', linkGitHubRepo: true },
        mockReq,
      );

      expect(result).toEqual(projectResponse);
      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        'vercel_test_token',
        expect.objectContaining({
          name: 'my-app',
          framework: 'nextjs',
        }),
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

    it('should return 403 when Vercel not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active vercel integration found'),
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
      mockVercelService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', linkGitHubRepo: true },
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        'vercel_test_token',
        expect.objectContaining({
          gitRepository: { type: 'github', repo: 'testuser/my-repo' },
        }),
      );
    });

    it('should skip GitHub linking when linkGitHubRepo=false', async () => {
      mockVercelService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app', linkGitHubRepo: false },
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        'vercel_test_token',
        expect.objectContaining({
          gitRepository: undefined,
        }),
      );
    });

    it('should store vercelProjectId in project', async () => {
      mockVercelService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          vercelProjectId: 'vercel-project-id',
        }),
      );
    });

    it('should log audit event after creation', async () => {
      mockVercelService.createProject.mockResolvedValue(projectResponse);

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
        'vercel-project-id',
        expect.objectContaining({
          action: 'integration.vercel.project_created',
          vercelProjectName: 'my-app',
        }),
      );
    });

    it('should create notification after creation', async () => {
      mockVercelService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'vercel_project_created',
          title: expect.stringContaining('my-app'),
        }),
      );
    });
  });

  describe('POST /deployments (triggerDeployment)', () => {
    const deploymentResponse = {
      id: 'deployment-id',
      status: 'building',
      projectId: 'vercel-project-id',
      url: 'my-app-abc123.vercel.app',
      target: 'production',
      ref: 'main',
      readyState: 'BUILDING',
      createdAt: '2026-02-01T10:05:00Z',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithVercel,
      });
    });

    it('should return 201 with deployment details', async () => {
      mockVercelService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      const result = await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { target: 'production', ref: 'main' },
        mockReq,
      );

      expect(result).toEqual(deploymentResponse);
      expect(mockVercelService.triggerDeployment).toHaveBeenCalledWith(
        'vercel_test_token',
        expect.objectContaining({
          projectId: 'vercel-project-id',
          name: 'My Project',
          target: 'production',
          ref: 'main',
        }),
      );
    });

    it('should return 400 when no Vercel project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.triggerDeployment(
          mockWorkspaceId,
          mockProjectId,
          { target: 'production', ref: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when Vercel not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active vercel integration found'),
      );

      await expect(
        controller.triggerDeployment(
          mockWorkspaceId,
          mockProjectId,
          { target: 'production', ref: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event after deployment trigger', async () => {
      mockVercelService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { target: 'production', ref: 'main' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'deployment-id',
        expect.objectContaining({
          action: 'integration.vercel.deployment_triggered',
          target: 'production',
          ref: 'main',
        }),
      );
    });

    it('should create notification after deployment trigger', async () => {
      mockVercelService.triggerDeployment.mockResolvedValue(
        deploymentResponse,
      );

      await controller.triggerDeployment(
        mockWorkspaceId,
        mockProjectId,
        { target: 'production', ref: 'main' },
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
      id: 'deployment-id',
      status: 'success',
      projectId: 'vercel-project-id',
      url: 'my-app-abc123.vercel.app',
      target: 'production',
      createdAt: '2026-02-01T10:05:00Z',
      readyAt: '2026-02-01T10:08:00Z',
    };

    it('should return 200 with deployment status', async () => {
      mockVercelService.getDeployment.mockResolvedValue(
        deploymentResponse,
      );

      const result = await controller.getDeployment(
        mockWorkspaceId,
        mockProjectId,
        'deployment-id',
      );

      expect(result).toEqual(deploymentResponse);
    });

    it('should return 404 when deployment not found', async () => {
      mockVercelService.getDeployment.mockResolvedValue(null);

      await expect(
        controller.getDeployment(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-id',
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
          url: 'my-app-abc123.vercel.app',
          target: 'production',
          createdAt: '2026-02-01T10:05:00Z',
        },
      ],
      total: 5,
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithVercel,
      });
    });

    it('should return 200 with deployment list', async () => {
      mockVercelService.listDeployments.mockResolvedValue(listResponse);

      const result = await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result).toEqual(listResponse);
      expect(mockVercelService.listDeployments).toHaveBeenCalledWith(
        'vercel_test_token',
        'vercel-project-id',
        expect.objectContaining({
          limit: 10,
        }),
      );
    });

    it('should pass query parameters', async () => {
      mockVercelService.listDeployments.mockResolvedValue(listResponse);

      await controller.listDeployments(
        mockWorkspaceId,
        mockProjectId,
        { target: 'production', perPage: 20 },
      );

      expect(mockVercelService.listDeployments).toHaveBeenCalledWith(
        'vercel_test_token',
        'vercel-project-id',
        expect.objectContaining({
          target: 'production',
          limit: 20,
        }),
      );
    });

    it('should throw BadRequestException when no Vercel project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.listDeployments(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PUT /environments/variables (setEnvironmentVariables)', () => {
    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithVercel,
      });
    });

    it('should return 200 with success', async () => {
      mockVercelService.upsertEnvironmentVariables.mockResolvedValue(
        undefined,
      );

      const result = await controller.setEnvironmentVariables(
        mockWorkspaceId,
        mockProjectId,
        {
          variables: [
            { key: 'DATABASE_URL', value: 'postgresql://...' },
            { key: 'NODE_ENV', value: 'production' },
          ],
        },
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.variableCount).toBe(2);
      expect(result.projectId).toBe('vercel-project-id');
    });

    it('should return 400 for invalid variable names', async () => {
      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          {
            variables: [
              { key: 'invalid-name', value: 'value' },
            ],
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event with variable names only (not values)', async () => {
      mockVercelService.upsertEnvironmentVariables.mockResolvedValue(
        undefined,
      );

      await controller.setEnvironmentVariables(
        mockWorkspaceId,
        mockProjectId,
        {
          variables: [
            { key: 'DATABASE_URL', value: 'postgresql://secret' },
            { key: 'API_KEY', value: 'sk-secret' },
          ],
        },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'vercel-project-id',
        expect.objectContaining({
          action: 'integration.vercel.env_vars_updated',
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

    it('should throw BadRequestException when no Vercel project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.setEnvironmentVariables(
          mockWorkspaceId,
          mockProjectId,
          {
            variables: [
              { key: 'NODE_ENV', value: 'production' },
            ],
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
