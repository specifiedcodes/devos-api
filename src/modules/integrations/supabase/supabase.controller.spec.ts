import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SupabaseController } from './supabase.controller';
import { SupabaseService } from './supabase.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

describe('SupabaseController', () => {
  let controller: SupabaseController;
  let mockSupabaseService: any;
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
    supabaseProjectRef: null as string | null,
    vercelProjectId: null as string | null,
    railwayProjectId: null as string | null,
  };

  const mockProjectWithSupabase = {
    ...mockProject,
    supabaseProjectRef: 'supabase-project-ref',
  };

  beforeEach(async () => {
    mockSupabaseService = {
      createProject: jest.fn(),
      getProject: jest.fn(),
      getProjectApiKeys: jest.fn(),
      listOrganizations: jest.fn(),
      pauseProject: jest.fn(),
      resumeProject: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest
        .fn()
        .mockResolvedValue('supabase_test_token'),
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
      controllers: [SupabaseController],
      providers: [
        { provide: SupabaseService, useValue: mockSupabaseService },
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

    controller = module.get<SupabaseController>(SupabaseController);
    jest.clearAllMocks();
    // Restore default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue(
      'supabase_test_token',
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
      id: 'supabase-project-ref',
      name: 'my-app-db',
      organizationId: 'org-uuid',
      region: 'us-east-1',
      status: 'provisioning',
      projectUrl:
        'https://supabase.com/dashboard/project/supabase-project-ref',
      createdAt: '2026-02-01T10:00:00Z',
    };

    it('should return 201 with project details', async () => {
      mockSupabaseService.createProject.mockResolvedValue(projectResponse);

      const result = await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass-123',
        },
        mockReq,
      );

      expect(result).toEqual(projectResponse);
      expect(mockSupabaseService.createProject).toHaveBeenCalledWith(
        'supabase_test_token',
        expect.objectContaining({
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass-123',
        }),
      );
    });

    it('should return 400 when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createProject(
          mockWorkspaceId,
          mockProjectId,
          {
            name: 'my-app-db',
            organizationId: 'org-uuid',
            dbPassword: 'secure-pass-123',
          },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 403 when Supabase not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active supabase integration found'),
      );

      await expect(
        controller.createProject(
          mockWorkspaceId,
          mockProjectId,
          {
            name: 'my-app-db',
            organizationId: 'org-uuid',
            dbPassword: 'secure-pass-123',
          },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should store supabaseProjectRef in project', async () => {
      mockSupabaseService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass-123',
        },
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseProjectRef: 'supabase-project-ref',
        }),
      );
    });

    it('should log audit event after creation (never logs dbPassword)', async () => {
      mockSupabaseService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass-123',
        },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'supabase-project-ref',
        expect.objectContaining({
          action: 'integration.supabase.project_created',
          supabaseProjectName: 'my-app-db',
        }),
      );

      // Verify dbPassword is NOT in the audit log call
      const auditCall = mockAuditService.log.mock.calls[0];
      const metadata = auditCall[5];
      expect(JSON.stringify(metadata)).not.toContain('secure-pass-123');
    });

    it('should create notification after creation', async () => {
      mockSupabaseService.createProject.mockResolvedValue(projectResponse);

      await controller.createProject(
        mockWorkspaceId,
        mockProjectId,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass-123',
        },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'supabase_project_created',
          title: expect.stringContaining('my-app-db'),
        }),
      );
    });
  });

  describe('GET /projects/:ref (getProject)', () => {
    const projectResponse = {
      id: 'supabase-project-ref',
      name: 'my-app-db',
      organizationId: 'org-uuid',
      region: 'us-east-1',
      status: 'active',
      projectUrl:
        'https://supabase.com/dashboard/project/supabase-project-ref',
      database: {
        host: 'db.supabase-project-ref.supabase.co',
        version: '15.1.0.117',
      },
      createdAt: '2026-02-01T10:00:00Z',
    };

    it('should return 200 with project status', async () => {
      mockSupabaseService.getProject.mockResolvedValue(projectResponse);

      const result = await controller.getProject(
        mockWorkspaceId,
        mockProjectId,
        'supabase-project-ref',
      );

      expect(result).toEqual(projectResponse);
    });

    it('should return 404 when project not found', async () => {
      mockSupabaseService.getProject.mockResolvedValue(null);

      await expect(
        controller.getProject(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-ref',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /connection-string (getConnectionString)', () => {
    beforeEach(() => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProjectWithSupabase,
      });
      mockSupabaseService.getProject.mockResolvedValue({
        id: 'supabase-project-ref',
        name: 'my-app-db',
        organizationId: 'org-uuid',
        region: 'us-east-1',
        status: 'active',
        projectUrl: 'https://supabase.com/dashboard/project/supabase-project-ref',
        createdAt: '2026-02-01T10:00:00Z',
      });
    });

    it('should return 200 with connection details', async () => {
      mockSupabaseService.getProjectApiKeys.mockResolvedValue([
        { name: 'anon', apiKey: 'eyJ-anon-key' },
        { name: 'service_role', apiKey: 'eyJ-service-role-key' },
      ]);

      const result = await controller.getConnectionString(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.host).toBe(
        'db.supabase-project-ref.supabase.co',
      );
      expect(result.port).toBe(5432);
      expect(result.poolerHost).toBe(
        'aws-0-us-east-1.pooler.supabase.com',
      );
      expect(result.poolerPort).toBe(6543);
      expect(result.database).toBe('postgres');
      expect(result.user).toBe('postgres');
      expect(result.supabaseProjectRef).toBe('supabase-project-ref');
      expect(result.supabaseUrl).toBe(
        'https://supabase-project-ref.supabase.co',
      );
      expect(result.anonKey).toBe('eyJ-anon-key');
    });

    it('should use actual project region for pooler host', async () => {
      mockSupabaseService.getProject.mockResolvedValue({
        id: 'supabase-project-ref',
        name: 'my-app-db',
        organizationId: 'org-uuid',
        region: 'eu-west-1',
        status: 'active',
        projectUrl: 'https://supabase.com/dashboard/project/supabase-project-ref',
        createdAt: '2026-02-01T10:00:00Z',
      });
      mockSupabaseService.getProjectApiKeys.mockResolvedValue([
        { name: 'anon', apiKey: 'eyJ-anon-key' },
      ]);

      const result = await controller.getConnectionString(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result.poolerHost).toBe(
        'aws-0-eu-west-1.pooler.supabase.com',
      );
    });

    it('should return 400 when no Supabase project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        supabaseProjectRef: null,
      });

      await expect(
        controller.getConnectionString(mockWorkspaceId, mockProjectId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should never return database password', async () => {
      mockSupabaseService.getProjectApiKeys.mockResolvedValue([
        { name: 'anon', apiKey: 'eyJ-anon-key' },
      ]);

      const result = await controller.getConnectionString(
        mockWorkspaceId,
        mockProjectId,
      );

      // Verify no password field exists in response
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('password');
      expect(resultStr).not.toContain('db_pass');
      expect(resultStr).not.toContain('dbPassword');
    });
  });

  describe('GET /organizations (listOrganizations)', () => {
    it('should return 200 with org list', async () => {
      const orgResponse = {
        organizations: [
          { id: 'org-1', name: 'My Organization' },
          { id: 'org-2', name: 'Another Org' },
        ],
      };
      mockSupabaseService.listOrganizations.mockResolvedValue(orgResponse);

      const result = await controller.listOrganizations(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toEqual(orgResponse);
      expect(result.organizations).toHaveLength(2);
    });

    it('should return 403 when Supabase not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active supabase integration found'),
      );

      await expect(
        controller.listOrganizations(mockWorkspaceId, mockProjectId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /projects/:ref/pause (pauseProject)', () => {
    it('should return 200 with success', async () => {
      mockSupabaseService.pauseProject.mockResolvedValue(undefined);

      const result = await controller.pauseProject(
        mockWorkspaceId,
        mockProjectId,
        'supabase-project-ref',
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Supabase project paused');
      expect(mockSupabaseService.pauseProject).toHaveBeenCalledWith(
        'supabase_test_token',
        'supabase-project-ref',
      );
    });

    it('should log audit event', async () => {
      mockSupabaseService.pauseProject.mockResolvedValue(undefined);

      await controller.pauseProject(
        mockWorkspaceId,
        mockProjectId,
        'supabase-project-ref',
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'supabase-project-ref',
        expect.objectContaining({
          action: 'integration.supabase.project_paused',
        }),
      );
    });
  });

  describe('POST /projects/:ref/resume (resumeProject)', () => {
    it('should return 200 with success', async () => {
      mockSupabaseService.resumeProject.mockResolvedValue(undefined);

      const result = await controller.resumeProject(
        mockWorkspaceId,
        mockProjectId,
        'supabase-project-ref',
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Supabase project resumed');
      expect(mockSupabaseService.resumeProject).toHaveBeenCalledWith(
        'supabase_test_token',
        'supabase-project-ref',
      );
    });

    it('should log audit event', async () => {
      mockSupabaseService.resumeProject.mockResolvedValue(undefined);

      await controller.resumeProject(
        mockWorkspaceId,
        mockProjectId,
        'supabase-project-ref',
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'supabase-project-ref',
        expect.objectContaining({
          action: 'integration.supabase.project_resumed',
        }),
      );
    });
  });
});
