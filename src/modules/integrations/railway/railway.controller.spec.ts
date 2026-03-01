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
import { RailwayServiceEntity, RailwayServiceType, RailwayServiceStatus } from '../../../database/entities/railway-service.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
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
      // Story 24-1: Provisioning methods
      provisionDatabase: jest.fn(),
      findServiceEntity: jest.fn(),
      getServiceConnectionInfo: jest.fn(),
      listServices: jest.fn(),
      // Story 24-2: Deployment methods
      deployService: jest.fn(),
      deployAllServices: jest.fn(),
      redeployService: jest.fn(),
      restartService: jest.fn(),
      // Story 24-3: Environment variable management methods
      listServiceVariables: jest.fn(),
      setServiceVariables: jest.fn(),
      deleteServiceVariable: jest.fn(),
      // Story 24-4: Domain management methods
      addDomain: jest.fn(),
      removeDomain: jest.fn(),
      getDomains: jest.fn(),
      // Story 24-5: Log streaming & deployment history methods
      streamLogs: jest.fn(),
      getDeploymentHistory: jest.fn(),
      getDeploymentById: jest.fn(),
      rollbackDeployment: jest.fn(),
      checkHealth: jest.fn(),
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

  // ============================================================
  // Story 24-1: Railway Database & Resource Provisioning Endpoints
  // ============================================================

  describe('POST /services/provision (provisionService)', () => {
    const provisionedService = {
      id: 'service-entity-uuid',
      projectId: mockProjectId,
      workspaceId: mockWorkspaceId,
      railwayProjectId: 'railway-project-uuid',
      railwayServiceId: 'railway-svc-id-123',
      name: 'main-db',
      serviceType: RailwayServiceType.DATABASE,
      status: RailwayServiceStatus.ACTIVE,
      deployOrder: 0,
      config: {},
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.provisionDatabase = jest.fn().mockResolvedValue(provisionedService);
    });

    it('should return 201 with provisioned service entity', async () => {
      const result = await controller.provisionService(
        mockWorkspaceId,
        mockProjectId,
        {
          name: 'main-db',
          serviceType: RailwayServiceType.DATABASE,
          databaseType: 'postgres',
        },
        mockReq,
      );

      expect(result).toEqual(provisionedService);
      expect(mockRailwayService.provisionDatabase).toHaveBeenCalledWith(
        'railway_test_token',
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          projectId: mockProjectId,
          railwayProjectId: 'railway-project-uuid',
          name: 'main-db',
          serviceType: RailwayServiceType.DATABASE,
          databaseType: 'postgres',
        }),
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.provisionService(
          mockWorkspaceId,
          mockProjectId,
          {
            name: 'main-db',
            serviceType: RailwayServiceType.DATABASE,
            databaseType: 'postgres',
          },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.provisionService(
          mockWorkspaceId,
          mockProjectId,
          {
            name: 'main-db',
            serviceType: RailwayServiceType.DATABASE,
            databaseType: 'postgres',
          },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.provisionService(
          mockWorkspaceId,
          mockProjectId,
          {
            name: 'main-db',
            serviceType: RailwayServiceType.DATABASE,
            databaseType: 'postgres',
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /services/:serviceId/connection (getServiceConnection)', () => {
    const connectionInfo = {
      serviceId: 'service-entity-uuid',
      serviceName: 'main-db',
      serviceType: RailwayServiceType.DATABASE,
      connectionVariables: [
        { name: 'DATABASE_URL', masked: true, present: true },
        { name: 'PGHOST', masked: true, present: true },
      ],
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.getServiceConnectionInfo = jest.fn().mockResolvedValue(connectionInfo);
    });

    it('should return connection info with masked variables', async () => {
      const mockServiceEntity = {
        id: 'service-entity-uuid',
        name: 'main-db',
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        serviceType: RailwayServiceType.DATABASE,
        railwayServiceId: 'railway-svc-id-123',
      };

      // Need to set up the findOne for the service entity too
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);

      const result = await controller.getServiceConnection(
        mockWorkspaceId,
        mockProjectId,
        'service-entity-uuid',
        mockReq,
      );

      expect(result.connectionVariables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ masked: true }),
        ]),
      );
    });

    it('should NEVER return actual variable values in response', async () => {
      const mockServiceEntity = {
        id: 'service-entity-uuid',
        name: 'main-db',
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        serviceType: RailwayServiceType.DATABASE,
        railwayServiceId: 'railway-svc-id-123',
      };

      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);

      const result = await controller.getServiceConnection(
        mockWorkspaceId,
        mockProjectId,
        'service-entity-uuid',
        mockReq,
      );

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('postgresql://');
      expect(resultStr).not.toContain('redis://');
    });

    it('should throw NotFoundException for nonexistent service', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);
      mockRailwayService.getServiceConnectionInfo = jest.fn().mockRejectedValue(
        new NotFoundException('Service not found'),
      );

      await expect(
        controller.getServiceConnection(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /services (listServices)', () => {
    const serviceList = [
      {
        id: 'svc-1',
        name: 'postgres',
        serviceType: RailwayServiceType.DATABASE,
        status: RailwayServiceStatus.ACTIVE,
        deployOrder: 0,
      },
      {
        id: 'svc-2',
        name: 'api',
        serviceType: RailwayServiceType.API,
        status: RailwayServiceStatus.ACTIVE,
        deployOrder: 1,
      },
    ];

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.listServices = jest.fn().mockResolvedValue(serviceList);
    });

    it('should return array of services ordered by deployOrder', async () => {
      const result = await controller.listServices(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('postgres');
      expect(result[1].name).toBe('api');
    });

    it('should return empty array when no services exist', async () => {
      mockRailwayService.listServices.mockResolvedValue([]);

      const result = await controller.listServices(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.listServices(mockWorkspaceId, mockProjectId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // Story 24-2: Railway Service Deployment via CLI Endpoints
  // ============================================================

  describe('POST /deploy (bulkDeploy)', () => {
    const bulkDeployResponse = {
      deploymentId: 'bulk-deploy-uuid',
      services: [
        { serviceId: 'svc-1', serviceName: 'postgres', status: 'success' },
        { serviceId: 'svc-2', serviceName: 'api', status: 'success' },
      ],
      startedAt: '2026-03-01T10:00:00Z',
      status: 'success' as const,
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.deployAllServices = jest.fn().mockResolvedValue(bulkDeployResponse);
    });

    it('should return 202 with BulkDeploymentResponseDto', async () => {
      const result = await controller.bulkDeploy(
        mockWorkspaceId,
        mockProjectId,
        {},
        mockReq,
      );

      expect(result).toEqual(bulkDeployResponse);
      expect(mockRailwayService.deployAllServices).toHaveBeenCalledWith(
        'railway_test_token',
        expect.objectContaining({
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.bulkDeploy(mockWorkspaceId, mockProjectId, {}, mockReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.bulkDeploy(mockWorkspaceId, mockProjectId, {}, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when no Railway project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        railwayProjectId: null,
      });

      await expect(
        controller.bulkDeploy(mockWorkspaceId, mockProjectId, {}, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass environment option to deployAllServices', async () => {
      await controller.bulkDeploy(
        mockWorkspaceId,
        mockProjectId,
        { environment: 'staging' },
        mockReq,
      );

      expect(mockRailwayService.deployAllServices).toHaveBeenCalledWith(
        'railway_test_token',
        expect.objectContaining({
          environment: 'staging',
        }),
      );
    });
  });

  describe('POST /services/:serviceId/deploy (deploySingleService)', () => {
    const deployResponse = {
      id: 'deploy-uuid',
      status: 'success',
      railwayServiceEntityId: 'svc-entity-uuid',
    };

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.deployService = jest.fn().mockResolvedValue(deployResponse);
    });

    it('should return 201 with deployment details', async () => {
      const result = await controller.deploySingleService(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        {},
        mockReq,
      );

      expect(result).toEqual(deployResponse);
      expect(mockRailwayService.deployService).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.deploySingleService(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          {},
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.deploySingleService(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          {},
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /services/:serviceId/redeploy (redeployService)', () => {
    const redeployResponse = {
      id: 'redeploy-uuid',
      status: 'building',
    };

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.redeployService = jest.fn().mockResolvedValue(redeployResponse);
    });

    it('should return 200 with redeploy response', async () => {
      const result = await controller.redeployServiceEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        mockReq,
      );

      expect(result).toEqual(redeployResponse);
      expect(mockRailwayService.redeployService).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.redeployServiceEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /services/:serviceId/restart (restartService)', () => {
    const restartResponse = { success: true };

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.restartService = jest.fn().mockResolvedValue(restartResponse);
    });

    it('should return 200 with restart response', async () => {
      const result = await controller.restartServiceEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        mockReq,
      );

      expect(result).toEqual(restartResponse);
      expect(mockRailwayService.restartService).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.restartServiceEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // Story 24-3: Railway Environment Variable Management Endpoints
  // ============================================================

  describe('GET /services/:serviceId/variables (listServiceVariables)', () => {
    const variablesResponse = [
      { name: 'DATABASE_URL', masked: true, present: true },
      { name: 'NODE_ENV', masked: true, present: true },
      { name: 'API_KEY', masked: true, present: true },
    ];

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.listServiceVariables = jest.fn().mockResolvedValue(variablesResponse);
    });

    it('should return 200 with masked variable list', async () => {
      const result = await controller.listServiceVariables(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        mockReq,
      );

      expect(result).toEqual(variablesResponse);
      expect(result).toHaveLength(3);
      result.forEach((v: any) => {
        expect(v.masked).toBe(true);
        expect(v.present).toBe(true);
      });
    });

    it('should call service with correct parameters', async () => {
      await controller.listServiceVariables(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        mockReq,
      );

      expect(mockRailwayService.listServiceVariables).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.listServiceVariables(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.listServiceVariables(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should NEVER return actual variable values in response', async () => {
      const result = await controller.listServiceVariables(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        mockReq,
      );

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('postgresql://');
      expect(resultStr).not.toContain('redis://');
      expect(resultStr).not.toContain('sk-');
    });
  });

  describe('PUT /services/:serviceId/variables (setServiceVariables)', () => {
    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.setServiceVariables = jest.fn().mockResolvedValue(undefined);
    });

    it('should return 200 with success response', async () => {
      const result = await controller.setServiceVariablesEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { variables: { DATABASE_URL: 'postgres://host/db', NODE_ENV: 'production' } },
        mockReq,
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          variableCount: 2,
        }),
      );
    });

    it('should call service with correct parameters', async () => {
      await controller.setServiceVariablesEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { variables: { NODE_ENV: 'production' } },
        mockReq,
      );

      expect(mockRailwayService.setServiceVariables).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        { NODE_ENV: 'production' },
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.setServiceVariablesEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          { variables: { NODE_ENV: 'production' } },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.setServiceVariablesEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          { variables: { NODE_ENV: 'production' } },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('DELETE /services/:serviceId/variables/:variableName (deleteServiceVariable)', () => {
    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.deleteServiceVariable = jest.fn().mockResolvedValue(undefined);
    });

    it('should return 200 with success response', async () => {
      const result = await controller.deleteServiceVariableEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'DATABASE_URL',
        mockReq,
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          variableName: 'DATABASE_URL',
        }),
      );
    });

    it('should call service with correct parameters', async () => {
      await controller.deleteServiceVariableEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'OLD_SECRET',
        mockReq,
      );

      expect(mockRailwayService.deleteServiceVariable).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        'OLD_SECRET',
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.deleteServiceVariableEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          'SOME_VAR',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.deleteServiceVariableEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          'SOME_VAR',
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // Story 24-4: Railway Domain Management Endpoints
  // ============================================================

  describe('POST /services/:serviceId/domains (addDomain)', () => {
    const domainResponse = {
      domain: 'example.com',
      type: 'custom' as const,
      status: 'pending_dns' as const,
      dnsInstructions: {
        type: 'CNAME' as const,
        name: 'example.com',
        value: 'railway-svc-api-001.up.railway.app',
      },
    };

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.addDomain = jest.fn().mockResolvedValue(domainResponse);
    });

    it('should return 201 with DomainResponseDto', async () => {
      const result = await controller.addDomain(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { customDomain: 'example.com' },
        mockReq,
      );

      expect(result).toEqual(domainResponse);
      expect(mockRailwayService.addDomain).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          customDomain: 'example.com',
        }),
      );
    });

    it('should call addDomain without customDomain to generate Railway domain', async () => {
      const railwayDomainResponse = {
        domain: 'api-production.up.railway.app',
        type: 'railway' as const,
        status: 'active' as const,
      };
      mockRailwayService.addDomain = jest.fn().mockResolvedValue(railwayDomainResponse);

      const result = await controller.addDomain(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        {},
        mockReq,
      );

      expect(result.type).toBe('railway');
      expect(mockRailwayService.addDomain).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.addDomain(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          { customDomain: 'example.com' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.addDomain(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          { customDomain: 'example.com' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /services/:serviceId/domains (getDomains)', () => {
    const domainsResponse = [
      {
        domain: 'api-production.up.railway.app',
        type: 'railway' as const,
        status: 'active' as const,
      },
      {
        domain: 'example.com',
        type: 'custom' as const,
        status: 'pending_dns' as const,
        dnsInstructions: {
          type: 'CNAME' as const,
          name: 'example.com',
          value: 'target.railway.app',
        },
      },
    ];

    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.getDomains = jest.fn().mockResolvedValue(domainsResponse);
    });

    it('should return array of DomainResponseDto', async () => {
      const result = await controller.getDomains(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
      );

      expect(result).toHaveLength(2);
      expect(result[0].domain).toBe('api-production.up.railway.app');
      expect(result[1].domain).toBe('example.com');
    });

    it('should return empty array when no domains exist', async () => {
      mockRailwayService.getDomains = jest.fn().mockResolvedValue([]);

      const result = await controller.getDomains(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
      );

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.getDomains(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /services/:serviceId/domains/:domain (removeDomain)', () => {
    const mockServiceEntity = {
      id: 'svc-entity-uuid',
      name: 'api',
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      serviceType: 'api',
      railwayServiceId: 'railway-svc-api-001',
      status: 'active',
      customDomain: 'example.com',
    };

    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithRailway,
      });
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(mockServiceEntity);
      mockRailwayService.removeDomain = jest.fn().mockResolvedValue(undefined);
    });

    it('should return 200 on successful domain removal', async () => {
      const result = await controller.removeDomain(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'example.com',
        mockReq,
      );

      expect(result).toEqual({ success: true });
      expect(mockRailwayService.removeDomain).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          domain: 'example.com',
        }),
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      mockRailwayService.findServiceEntity = jest.fn().mockResolvedValue(null);

      await expect(
        controller.removeDomain(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          'example.com',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.removeDomain(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          'example.com',
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // Story 24-5: Log Streaming & Deployment History Endpoints
  // ============================================================

  const mockServiceEntity = {
    id: 'svc-entity-uuid',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    railwayProjectId: 'railway-project-uuid',
    railwayServiceId: 'railway-svc-id-123',
    name: 'api-service',
    serviceType: 'api',
    status: 'active',
    deploymentUrl: 'https://api-service.up.railway.app',
    deployOrder: 1,
    config: {},
    resourceInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /services/:serviceId/logs (getServiceLogs)', () => {
    it('should return logs array for a service', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      mockRailwayService.streamLogs.mockResolvedValue([
        'Log line 1',
        'Log line 2',
        'Log line 3',
      ]);

      const result = await controller.getServiceLogs(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { lines: 50, buildLogs: false },
      );

      expect(result.logs).toHaveLength(3);
      expect(result.serviceId).toBe('svc-entity-uuid');
      expect(result.serviceName).toBe('api-service');
    });

    it('should throw NotFoundException for unknown service', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(null);

      await expect(
        controller.getServiceLogs(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          { lines: 50, buildLogs: false },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should pass buildLogs and lines options to streamLogs', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      mockRailwayService.streamLogs.mockResolvedValue(['Build log 1']);

      await controller.getServiceLogs(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { lines: 100, buildLogs: true },
      );

      expect(mockRailwayService.streamLogs).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        expect.objectContaining({
          buildLogs: true,
          lines: 100,
        }),
      );
    });
  });

  describe('GET /services/:serviceId/deployments (getServiceDeployments)', () => {
    it('should return paginated deployment history', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      mockRailwayService.getDeploymentHistory.mockResolvedValue({
        deployments: [
          { id: 'deploy-1', status: 'success', createdAt: new Date() },
          { id: 'deploy-2', status: 'failed', createdAt: new Date() },
        ],
        total: 2,
        page: 1,
        limit: 10,
      });

      const result = await controller.getServiceDeployments(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        { page: 1, limit: 10 },
      );

      expect(result.deployments).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should throw NotFoundException for unknown service', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(null);

      await expect(
        controller.getServiceDeployments(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          { page: 1, limit: 10 },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /services/:serviceId/deployments/:deploymentId (getDeploymentDetails)', () => {
    it('should return deployment details', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      const mockDeployment = {
        id: 'deploy-1',
        railwayServiceEntityId: 'svc-entity-uuid',
        status: 'success',
        deploymentUrl: 'https://app.railway.app',
      };
      mockRailwayService.getDeploymentById.mockResolvedValue(mockDeployment);

      const result = await controller.getDeploymentDetails(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'deploy-1',
      );

      expect(result.id).toBe('deploy-1');
    });

    it('should throw NotFoundException for unknown deployment', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      mockRailwayService.getDeploymentById.mockResolvedValue(null);

      await expect(
        controller.getDeploymentDetails(
          mockWorkspaceId,
          mockProjectId,
          'svc-entity-uuid',
          'nonexistent-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for unknown service', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(null);

      await expect(
        controller.getDeploymentDetails(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          'deploy-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /services/:serviceId/deployments/:deploymentId/rollback (rollbackDeployment)', () => {
    it('should return 201 with new deployment record', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      const newDeployment = {
        id: 'new-deploy-uuid',
        triggerType: 'rollback',
        status: 'building',
      };
      mockRailwayService.rollbackDeployment.mockResolvedValue(newDeployment);

      const result = await controller.rollbackDeploymentEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'deploy-old-uuid',
        mockReq,
      );

      expect(result.id).toBe('new-deploy-uuid');
      expect(result.triggerType).toBe('rollback');
    });

    it('should throw NotFoundException for unknown service', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(null);

      await expect(
        controller.rollbackDeploymentEndpoint(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-uuid',
          'deploy-old-uuid',
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should call rollbackDeployment with correct parameters', async () => {
      mockRailwayService.findServiceEntity.mockResolvedValue(mockServiceEntity);
      mockRailwayService.rollbackDeployment.mockResolvedValue({
        id: 'new-deploy-uuid',
        triggerType: 'rollback',
      });

      await controller.rollbackDeploymentEndpoint(
        mockWorkspaceId,
        mockProjectId,
        'svc-entity-uuid',
        'deploy-old-uuid',
        mockReq,
      );

      expect(mockRailwayService.rollbackDeployment).toHaveBeenCalledWith(
        'railway_test_token',
        mockServiceEntity,
        'deploy-old-uuid',
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
        }),
      );
    });
  });

  describe('GET /health (checkHealth)', () => {
    it('should return connected status when token is valid', async () => {
      mockRailwayService.checkHealth.mockResolvedValue({
        connected: true,
        username: 'testuser',
      });

      const result = await controller.checkHealthEndpoint(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.connected).toBe(true);
      expect(result.username).toBe('testuser');
    });

    it('should return disconnected status when token is invalid', async () => {
      mockRailwayService.checkHealth.mockResolvedValue({
        connected: false,
        error: 'Not logged in',
      });

      const result = await controller.checkHealthEndpoint(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Not logged in');
    });

    it('should throw ForbiddenException when Railway not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active railway integration found'),
      );

      await expect(
        controller.checkHealthEndpoint(
          mockWorkspaceId,
          mockProjectId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
