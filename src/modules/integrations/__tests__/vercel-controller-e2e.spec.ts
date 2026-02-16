import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { VercelController } from '../vercel/vercel.controller';
import { VercelService } from '../vercel/vercel.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_PROJECT_ID,
  MOCK_VERCEL_PROJECT_ID,
  MOCK_VERCEL_TOKEN,
} from './vercel-test-helpers';

/**
 * Vercel Controller E2E Tests
 * Story 15-5: AC8 - Controller endpoints for project and deployment management
 */
describe('Vercel E2E - Controller Operations', () => {
  let controller: VercelController;
  let mockVercelService: any;
  let mockIntegrationConnectionService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockProject = {
    id: MOCK_PROJECT_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: 'Test Project',
    vercelProjectId: MOCK_VERCEL_PROJECT_ID,
    githubRepoUrl: 'https://github.com/testuser/my-repo',
  };

  const mockReq = { user: { userId: MOCK_USER_ID } };

  const mockProjectResponse = {
    id: MOCK_VERCEL_PROJECT_ID,
    name: 'my-app',
    framework: 'nextjs',
    projectUrl: `https://vercel.com/~/projects/my-app`,
    createdAt: '2026-02-16T00:00:00.000Z',
  };

  const mockDeploymentResponse = {
    id: 'dpl_vercel_deploy_123',
    status: 'building',
    projectId: MOCK_VERCEL_PROJECT_ID,
    url: 'my-app-abc.vercel.app',
    target: 'production',
    ref: 'main',
    readyState: 'BUILDING',
    createdAt: '2026-02-16T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockVercelService = {
      createProject: jest.fn().mockResolvedValue(mockProjectResponse),
      triggerDeployment: jest.fn().mockResolvedValue(mockDeploymentResponse),
      getDeployment: jest.fn().mockResolvedValue(mockDeploymentResponse),
      listDeployments: jest.fn().mockResolvedValue({
        deployments: [mockDeploymentResponse],
        total: 1,
      }),
      upsertEnvironmentVariables: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationConnectionService = {
      getDecryptedToken: jest.fn().mockResolvedValue(MOCK_VERCEL_TOKEN),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue({ ...mockProject }),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VercelController],
      providers: [
        { provide: VercelService, useValue: mockVercelService },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationConnectionService,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    controller = module.get<VercelController>(VercelController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ======================== AC8: Project Operations ========================

  describe('AC8: Vercel Controller - Create Project', () => {
    it('should create Vercel project and return 201', async () => {
      const result = await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', framework: 'nextjs' } as any,
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        MOCK_VERCEL_TOKEN,
        expect.objectContaining({ name: 'my-app', framework: 'nextjs' }),
      );
      expect(result).toEqual(mockProjectResponse);
    });

    it('should store vercelProjectId on project entity', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' } as any,
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalled();
      const savedProject = mockProjectRepository.save.mock.calls[0][0];
      expect(savedProject.vercelProjectId).toBe(MOCK_VERCEL_PROJECT_ID);
    });

    it('should log audit event for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_VERCEL_PROJECT_ID,
        expect.objectContaining({
          action: 'integration.vercel.project_created',
          vercelProjectName: 'my-app',
        }),
      );
    });

    it('should create notification for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' } as any,
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'vercel_project_created',
        }),
      );
    });

    it('should include gitRepository when linkGitHubRepo=true and githubRepoUrl exists', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', linkGitHubRepo: true } as any,
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        MOCK_VERCEL_TOKEN,
        expect.objectContaining({
          gitRepository: { type: 'github', repo: 'testuser/my-repo' },
        }),
      );
    });

    it('should include gitRepository by default when linkGitHubRepo is undefined', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' } as any,
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        MOCK_VERCEL_TOKEN,
        expect.objectContaining({
          gitRepository: { type: 'github', repo: 'testuser/my-repo' },
        }),
      );
    });

    it('should skip GitHub linking when linkGitHubRepo=false', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', linkGitHubRepo: false } as any,
        mockReq,
      );

      expect(mockVercelService.createProject).toHaveBeenCalledWith(
        MOCK_VERCEL_TOKEN,
        expect.objectContaining({
          gitRepository: undefined,
        }),
      );
    });

    it('should return NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { name: 'my-app' } as any,
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return ForbiddenException when Vercel integration not connected', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active vercel integration found'),
      );

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { name: 'my-app' } as any,
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ======================== AC8: Deployment Operations ========================

  describe('AC8: Vercel Controller - Deployment Operations', () => {
    it('should trigger deployment and return 201', async () => {
      const result = await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { target: 'production', ref: 'main' } as any,
        mockReq,
      );

      expect(mockVercelService.triggerDeployment).toHaveBeenCalledWith(
        MOCK_VERCEL_TOKEN,
        expect.objectContaining({
          projectId: MOCK_VERCEL_PROJECT_ID,
          name: 'Test Project',
        }),
      );
      expect(result).toEqual(mockDeploymentResponse);
    });

    it('should log audit event for deployment trigger', async () => {
      await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { target: 'production', ref: 'main' } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.vercel.deployment_triggered',
        }),
      );
    });

    it('should create notification for deployment trigger', async () => {
      await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { target: 'production', ref: 'main' } as any,
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'deployment_triggered',
        }),
      );
    });

    it('should return BadRequestException when no Vercel project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.triggerDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { target: 'production' } as any,
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return ForbiddenException when Vercel not connected for deployment', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active vercel integration found'),
      );

      await expect(
        controller.triggerDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { target: 'production' } as any,
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should get deployment status', async () => {
      const result = await controller.getDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'dpl_valid_deploy_123',
      );

      expect(result).toEqual(mockDeploymentResponse);
    });

    it('should return NotFoundException for missing deployment', async () => {
      mockVercelService.getDeployment.mockResolvedValue(null);

      await expect(
        controller.getDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'nonexistent-deploy',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid deploymentId format', async () => {
      await expect(
        controller.getDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'invalid@id!',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid deploymentId with correct message', async () => {
      await expect(
        controller.getDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'invalid@id!',
        ),
      ).rejects.toThrow('Invalid deployment ID format');
    });

    it('should list deployments with pagination', async () => {
      const result = await controller.listDeployments(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { perPage: 10 } as any,
      );

      expect(result.deployments).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return BadRequestException when listing deployments with no Vercel project', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.listDeployments(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { perPage: 10 } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ======================== AC8: Environment Variables ========================

  describe('AC8: Vercel Controller - Environment Variables', () => {
    it('should set environment variables and return success', async () => {
      const result = await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          variables: [
            { key: 'DATABASE_URL', value: 'postgres://...' },
            { key: 'NODE_ENV', value: 'production' },
          ],
        } as any,
        mockReq,
      );

      expect(mockVercelService.upsertEnvironmentVariables).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.variableCount).toBe(2);
      expect(result.projectId).toBe(MOCK_VERCEL_PROJECT_ID);
    });

    it('should reject invalid variable key names', async () => {
      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          {
            variables: [{ key: 'invalid-name', value: 'value' }],
          } as any,
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return BadRequestException when setting env vars with no Vercel project', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        vercelProjectId: null,
      });

      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          {
            variables: [{ key: 'VALID_KEY', value: 'value' }],
          } as any,
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event with variable names only (never values)', async () => {
      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          variables: [{ key: 'DATABASE_URL', value: 'secret-connection-string' }],
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mockAuditService.log.mock.calls[0];
      const auditDetails = auditCallArgs[5];
      expect(auditDetails.variableNames).toEqual(['DATABASE_URL']);
      expect(auditDetails.variableCount).toBe(1);

      // Ensure the secret value is NOT in any of the audit log args
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain('secret-connection-string');
    });
  });
});
