import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { RailwayController } from '../railway/railway.controller';
import { RailwayService } from '../railway/railway.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_PROJECT_ID,
  MOCK_RAILWAY_PROJECT_ID,
  MOCK_RAILWAY_TOKEN,
} from './railway-test-helpers';

/**
 * Railway Controller E2E Tests
 * Story 15-4: AC8 - Controller endpoints for project and deployment management
 */
describe('Railway E2E - Controller Operations', () => {
  let controller: RailwayController;
  let mockRailwayService: any;
  let mockIntegrationConnectionService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockProject = {
    id: MOCK_PROJECT_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: 'Test Project',
    railwayProjectId: MOCK_RAILWAY_PROJECT_ID,
    githubRepoUrl: 'https://github.com/testuser/my-repo',
  };

  const mockReq = { user: { userId: MOCK_USER_ID } };

  const mockProjectResponse = {
    id: MOCK_RAILWAY_PROJECT_ID,
    name: 'my-app',
    projectUrl: `https://railway.app/project/${MOCK_RAILWAY_PROJECT_ID}`,
    environments: [{ id: 'env-1', name: 'production' }],
    createdAt: '2026-02-16T00:00:00.000Z',
  };

  const mockDeploymentResponse = {
    id: 'deploy-123',
    status: 'building',
    projectId: MOCK_RAILWAY_PROJECT_ID,
    environmentId: 'env-1',
    branch: 'main',
    createdAt: '2026-02-16T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockRailwayService = {
      createProject: jest.fn().mockResolvedValue(mockProjectResponse),
      linkGitHubRepoToProject: jest.fn().mockResolvedValue(undefined),
      triggerDeployment: jest.fn().mockResolvedValue(mockDeploymentResponse),
      getDeployment: jest.fn().mockResolvedValue(mockDeploymentResponse),
      listDeployments: jest.fn().mockResolvedValue({
        deployments: [mockDeploymentResponse],
        total: 1,
      }),
      upsertEnvironmentVariables: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationConnectionService = {
      getDecryptedToken: jest.fn().mockResolvedValue(MOCK_RAILWAY_TOKEN),
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
      controllers: [RailwayController],
      providers: [
        { provide: RailwayService, useValue: mockRailwayService },
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

    controller = module.get<RailwayController>(RailwayController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC8: Railway Controller - Project Operations', () => {
    it('should create Railway project and return result', async () => {
      const result = await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', description: 'My App' },
        mockReq,
      );

      expect(mockRailwayService.createProject).toHaveBeenCalledWith(
        MOCK_RAILWAY_TOKEN,
        { name: 'my-app', description: 'My App' },
      );
      expect(result).toEqual(mockProjectResponse);
    });

    it('should store railwayProjectId on project entity', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalled();
      const savedProject = mockProjectRepository.save.mock.calls[0][0];
      expect(savedProject.railwayProjectId).toBe(MOCK_RAILWAY_PROJECT_ID);
    });

    it('should log audit event for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_RAILWAY_PROJECT_ID,
        expect.objectContaining({
          action: 'integration.railway.project_created',
          railwayProjectName: 'my-app',
        }),
      );
    });

    it('should create notification for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'railway_project_created',
        }),
      );
    });

    it('should link GitHub repo when linkGitHubRepo is true and githubRepoUrl exists', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', linkGitHubRepo: true },
        mockReq,
      );

      expect(mockRailwayService.linkGitHubRepoToProject).toHaveBeenCalledWith(
        MOCK_RAILWAY_TOKEN,
        MOCK_RAILWAY_PROJECT_ID,
        'testuser/my-repo',
      );
    });

    it('should link GitHub repo by default when linkGitHubRepo is omitted (undefined)', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app' },
        mockReq,
      );

      expect(mockRailwayService.linkGitHubRepoToProject).toHaveBeenCalledWith(
        MOCK_RAILWAY_TOKEN,
        MOCK_RAILWAY_PROJECT_ID,
        'testuser/my-repo',
      );
    });

    it('should skip GitHub linking when linkGitHubRepo=false', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { name: 'my-app', linkGitHubRepo: false },
        mockReq,
      );

      expect(mockRailwayService.linkGitHubRepoToProject).not.toHaveBeenCalled();
    });

    it('should return NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { name: 'my-app' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return ForbiddenException when Railway integration not connected', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { name: 'my-app' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('AC8: Railway Controller - Deployment Operations', () => {
    it('should trigger deployment and return result', async () => {
      const result = await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { branch: 'main' },
        mockReq,
      );

      expect(mockRailwayService.triggerDeployment).toHaveBeenCalledWith(
        MOCK_RAILWAY_TOKEN,
        expect.objectContaining({
          projectId: MOCK_RAILWAY_PROJECT_ID,
          branch: 'main',
        }),
      );
      expect(result).toEqual(mockDeploymentResponse);
    });

    it('should log audit event for deployment trigger', async () => {
      await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { branch: 'main' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.railway.deployment_triggered',
        }),
      );
    });

    it('should create notification for deployment trigger', async () => {
      await controller.triggerDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { branch: 'main' },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'deployment_triggered',
        }),
      );
    });

    it('should return BadRequestException when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.triggerDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { branch: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return ForbiddenException when Railway not connected for deployment', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.triggerDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          { branch: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should get deployment status', async () => {
      const result = await controller.getDeployment(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'deploy-123',
      );

      expect(result).toEqual(mockDeploymentResponse);
    });

    it('should return NotFoundException for missing deployment', async () => {
      mockRailwayService.getDeployment.mockResolvedValue(null);

      await expect(
        controller.getDeployment(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'nonexistent',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should list deployments with pagination', async () => {
      const result = await controller.listDeployments(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        { page: 1, perPage: 10 },
      );

      expect(result.deployments).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('AC8: Railway Controller - Environment Variables', () => {
    it('should set environment variables and return success', async () => {
      const result = await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'env-1',
        { variables: { DATABASE_URL: 'postgres://...', NODE_ENV: 'production' } },
        mockReq,
      );

      expect(mockRailwayService.upsertEnvironmentVariables).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.variableCount).toBe(2);
      expect(result.environmentId).toBe('env-1');
    });

    it('should reject invalid variable names', async () => {
      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'env-1',
          { variables: { 'invalid-name': 'value' } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce max 50 variables per request', async () => {
      const tooManyVars: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        tooManyVars[`VAR_${i}`] = 'value';
      }

      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'env-1',
          { variables: tooManyVars },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce max variable name length (256 chars)', async () => {
      const longName = 'A'.repeat(257);

      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'env-1',
          { variables: { [longName]: 'value' } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce max variable value length (10000 chars)', async () => {
      const longValue = 'a'.repeat(10001);

      await expect(
        controller.setEnvironmentVariables(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'env-1',
          { variables: { VALID_KEY: longValue } },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit event with variable names only (never values)', async () => {
      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'env-1',
        { variables: { DATABASE_URL: 'secret-connection-string' } },
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
