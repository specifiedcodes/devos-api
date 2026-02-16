import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseController } from '../supabase/supabase.controller';
import { SupabaseService } from '../supabase/supabase.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_PROJECT_ID,
  MOCK_SUPABASE_PROJECT_REF,
  MOCK_SUPABASE_TOKEN,
} from './supabase-test-helpers';

/**
 * Supabase Controller E2E Tests
 * Story 15-6: AC8 - Controller endpoints for Supabase project management
 */
describe('Supabase E2E - Controller Operations', () => {
  let controller: SupabaseController;
  let mockSupabaseService: any;
  let mockIntegrationConnectionService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockProject = {
    id: MOCK_PROJECT_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: 'Test Project',
    supabaseProjectRef: MOCK_SUPABASE_PROJECT_REF,
  };

  const mockReq = { user: { userId: MOCK_USER_ID } };

  const mockProjectResponse = {
    id: MOCK_SUPABASE_PROJECT_REF,
    name: 'my-app-db',
    organizationId: 'org-uuid-1',
    region: 'us-east-1',
    status: 'provisioning',
    projectUrl: `https://supabase.com/dashboard/project/${MOCK_SUPABASE_PROJECT_REF}`,
    createdAt: '2026-02-16T00:00:00.000Z',
  };

  const mockApiKeys = [
    { name: 'anon', apiKey: 'eyJ...anon' },
    { name: 'service_role', apiKey: 'eyJ...service' },
  ];

  const mockOrgList = {
    organizations: [
      { id: 'org-1', name: 'My Organization' },
    ],
  };

  beforeEach(async () => {
    mockSupabaseService = {
      createProject: jest.fn().mockResolvedValue(mockProjectResponse),
      getProject: jest.fn().mockResolvedValue(mockProjectResponse),
      getProjectApiKeys: jest.fn().mockResolvedValue(mockApiKeys),
      listOrganizations: jest.fn().mockResolvedValue(mockOrgList),
      pauseProject: jest.fn().mockResolvedValue(undefined),
      resumeProject: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationConnectionService = {
      getDecryptedToken: jest.fn().mockResolvedValue(MOCK_SUPABASE_TOKEN),
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
      controllers: [SupabaseController],
      providers: [
        { provide: SupabaseService, useValue: mockSupabaseService },
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

    controller = module.get<SupabaseController>(SupabaseController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ======================== AC8: Create Project ========================

  describe('AC8: Supabase Controller - Create Project', () => {
    it('should create Supabase project and return result', async () => {
      const result = await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass',
        } as any,
        mockReq,
      );

      expect(mockSupabaseService.createProject).toHaveBeenCalledWith(
        MOCK_SUPABASE_TOKEN,
        expect.objectContaining({
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-pass',
        }),
      );
      expect(result).toEqual(mockProjectResponse);
    });

    it('should store supabaseProjectRef on project entity', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        } as any,
        mockReq,
      );

      expect(mockProjectRepository.save).toHaveBeenCalled();
      const savedProject = mockProjectRepository.save.mock.calls[0][0];
      expect(savedProject.supabaseProjectRef).toBe(MOCK_SUPABASE_PROJECT_REF);
    });

    it('should log audit event for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_SUPABASE_PROJECT_REF,
        expect.objectContaining({
          action: 'integration.supabase.project_created',
          supabaseProjectName: 'my-app-db',
          supabaseProjectRef: MOCK_SUPABASE_PROJECT_REF,
        }),
      );
    });

    it('should never log dbPassword in audit event', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'super-secret-password',
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mockAuditService.log.mock.calls[0];
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain('super-secret-password');

      const auditDetails = auditCallArgs[5];
      expect(auditDetails).not.toHaveProperty('dbPassword');
    });

    it('should create notification for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        } as any,
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'supabase_project_created',
        }),
      );
    });

    it('should return NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          {
            name: 'my-app-db',
            organizationId: 'org-uuid',
            dbPassword: 'pass',
          } as any,
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return ForbiddenException when Supabase integration not connected', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active supabase integration found'),
      );

      await expect(
        controller.createProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          {
            name: 'my-app-db',
            organizationId: 'org-uuid',
            dbPassword: 'pass',
          } as any,
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ======================== AC8: Get Project ========================

  describe('AC8: Supabase Controller - Get Project', () => {
    it('should get project status', async () => {
      const result = await controller.getProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
      );

      expect(result).toEqual(mockProjectResponse);
    });

    it('should return NotFoundException for missing Supabase project', async () => {
      mockSupabaseService.getProject.mockResolvedValue(null);

      await expect(
        controller.getProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          MOCK_SUPABASE_PROJECT_REF,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid supabaseProjectRef format', async () => {
      await expect(
        controller.getProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          '../etc/passwd',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid supabaseProjectRef with correct message', async () => {
      await expect(
        controller.getProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'invalid@ref!',
        ),
      ).rejects.toThrow('Invalid Supabase project ref format');
    });
  });

  // ======================== AC8: Get Connection String ========================

  describe('AC8: Supabase Controller - Get Connection String', () => {
    it('should get connection string with correct fields', async () => {
      const result = await controller.getConnectionString(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
      );

      expect(result.host).toBe(`db.${MOCK_SUPABASE_PROJECT_REF}.supabase.co`);
      expect(result.port).toBe(5432);
      expect(result.poolerHost).toBeDefined();
      expect(result.poolerPort).toBe(6543);
      expect(result.database).toBe('postgres');
      expect(result.user).toBe('postgres');
      expect(result.supabaseProjectRef).toBe(MOCK_SUPABASE_PROJECT_REF);
      expect(result.supabaseUrl).toBe(
        `https://${MOCK_SUPABASE_PROJECT_REF}.supabase.co`,
      );
      expect(result.anonKey).toBe('eyJ...anon');
    });

    it('should never return database password in connection string', async () => {
      const result = await controller.getConnectionString(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
      );

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('dbPassword');
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('password');
    });

    it('should return BadRequestException when no Supabase project linked', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        supabaseProjectRef: null,
      });

      await expect(
        controller.getConnectionString(MOCK_WORKSPACE_ID, MOCK_PROJECT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return BadRequestException with correct message for no project', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        supabaseProjectRef: null,
      });

      await expect(
        controller.getConnectionString(MOCK_WORKSPACE_ID, MOCK_PROJECT_ID),
      ).rejects.toThrow('No Supabase project linked');
    });
  });

  // ======================== AC8: List Organizations ========================

  describe('AC8: Supabase Controller - List Organizations', () => {
    it('should list organizations', async () => {
      const result = await controller.listOrganizations(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
      );

      expect(result).toEqual(mockOrgList);
    });

    it('should return ForbiddenException when Supabase not connected', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active supabase integration found'),
      );

      await expect(
        controller.listOrganizations(MOCK_WORKSPACE_ID, MOCK_PROJECT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ======================== AC8: Pause Project ========================

  describe('AC8: Supabase Controller - Pause Project', () => {
    it('should pause project and return success', async () => {
      const result = await controller.pauseProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockSupabaseService.pauseProject).toHaveBeenCalledWith(
        MOCK_SUPABASE_TOKEN,
        MOCK_SUPABASE_PROJECT_REF,
      );
      expect(result).toEqual({
        success: true,
        message: 'Supabase project paused',
      });
    });

    it('should log audit event for project pause', async () => {
      await controller.pauseProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_SUPABASE_PROJECT_REF,
        expect.objectContaining({
          action: 'integration.supabase.project_paused',
        }),
      );
    });

    it('should create notification for project pause', async () => {
      await controller.pauseProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'supabase_project_paused',
        }),
      );
    });

    it('should reject invalid project ref on pause', async () => {
      await expect(
        controller.pauseProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'invalid@ref!',
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ======================== AC8: Resume Project ========================

  describe('AC8: Supabase Controller - Resume Project', () => {
    it('should resume project and return success', async () => {
      const result = await controller.resumeProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockSupabaseService.resumeProject).toHaveBeenCalledWith(
        MOCK_SUPABASE_TOKEN,
        MOCK_SUPABASE_PROJECT_REF,
      );
      expect(result).toEqual({
        success: true,
        message: 'Supabase project resumed',
      });
    });

    it('should log audit event for project resume', async () => {
      await controller.resumeProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_SUPABASE_PROJECT_REF,
        expect.objectContaining({
          action: 'integration.supabase.project_resumed',
        }),
      );
    });

    it('should create notification for project resume', async () => {
      await controller.resumeProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        MOCK_SUPABASE_PROJECT_REF,
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: MOCK_WORKSPACE_ID,
          type: 'supabase_project_resumed',
        }),
      );
    });

    it('should reject invalid project ref on resume', async () => {
      await expect(
        controller.resumeProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          'invalid@ref!',
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return ForbiddenException when Supabase not connected for resume', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active supabase integration found'),
      );

      await expect(
        controller.resumeProject(
          MOCK_WORKSPACE_ID,
          MOCK_PROJECT_ID,
          MOCK_SUPABASE_PROJECT_REF,
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
