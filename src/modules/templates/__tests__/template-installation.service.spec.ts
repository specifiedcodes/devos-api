/**
 * TemplateInstallationService Tests
 *
 * Story 19-6: Template Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TemplateInstallationService, InstallationJobData } from '../services/template-installation.service';
import { Template } from '../../../database/entities/template.entity';
import { TemplateInstallation, InstallationStatus, InstallationStep } from '../../../database/entities/template-installation.entity';
import { Project } from '../../../database/entities/project.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { TemplateScaffoldingService } from '../services/template-scaffolding.service';
import { TemplateAuditService } from '../services/template-audit.service';
import { TemplatesGateway } from '../gateways/templates.gateway';
import { DataSource } from 'typeorm';

describe('TemplateInstallationService', () => {
  let service: TemplateInstallationService;
  let templateRepository: jest.Mocked<any>;
  let installationRepository: jest.Mocked<any>;
  let workspaceMemberRepository: jest.Mocked<any>;
  let projectRepository: jest.Mocked<any>;
  let scaffoldingService: jest.Mocked<TemplateScaffoldingService>;
  let installationQueue: jest.Mocked<Queue>;
  let webSocketGateway: jest.Mocked<TemplatesGateway>;

  const mockUserId = 'user-123';
  const mockWorkspaceId = 'workspace-123';
  const mockTemplateId = 'template-123';

  const mockTemplate: Partial<Template> = {
    id: mockTemplateId,
    name: 'test-template',
    displayName: 'Test Template',
    variables: [
      { name: 'project_name', type: 'string', required: true },
      { name: 'database', type: 'select', options: ['postgres', 'mysql'], default: 'postgres' },
    ],
    definition: {
      post_install: ['npm install'],
    },
  };

  const mockWorkspaceMember: Partial<WorkspaceMember> = {
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    role: 'member',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateInstallationService,
        {
          provide: getRepositoryToken(Template),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TemplateInstallation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Project),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: TemplateScaffoldingService,
          useValue: {
            getTemplate: jest.fn(),
            validateVariables: jest.fn(),
            fetchSourceFiles: jest.fn(),
            processFiles: jest.fn(),
          },
        },
        {
          provide: TemplateAuditService,
          useValue: {
            logTemplateUsed: jest.fn(),
          },
        },
        {
          provide: TemplatesGateway,
          useValue: {
            emitInstallationStarted: jest.fn(),
            emitInstallationProgress: jest.fn(),
            emitInstallationComplete: jest.fn(),
            emitInstallationFailed: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb) => cb({})),
          },
        },
        {
          provide: 'BullQueue_installation',
          useValue: {
            add: jest.fn(),
            getJob: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TemplateInstallationService>(TemplateInstallationService);
    templateRepository = module.get(getRepositoryToken(Template));
    installationRepository = module.get(getRepositoryToken(TemplateInstallation));
    workspaceMemberRepository = module.get(getRepositoryToken(WorkspaceMember));
    projectRepository = module.get(getRepositoryToken(Project));
    scaffoldingService = module.get(TemplateScaffoldingService);
    installationQueue = module.get('BullQueue_installation');
    webSocketGateway = module.get(TemplatesGateway);
  });

  describe('startInstallation', () => {
    it('should start an installation successfully', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate);
      workspaceMemberRepository.findOne.mockResolvedValue(mockWorkspaceMember);
      projectRepository.findOne.mockResolvedValue(null);
      scaffoldingService.validateVariables.mockReturnValue({
        valid: true,
        errors: [],
        resolved: { project_name: 'my-project', database: 'postgres' },
      });
      installationRepository.create.mockReturnValue({
        id: 'installation-123',
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        projectName: 'my-project',
        variables: {},
        status: InstallationStatus.PENDING,
      });
      installationRepository.save.mockResolvedValue({
        id: 'installation-123',
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        projectName: 'my-project',
        variables: {},
        status: InstallationStatus.PENDING,
      });
      installationQueue.add.mockResolvedValue({} as any);

      const result = await service.startInstallation(mockUserId, mockTemplateId, {
        projectName: 'my-project',
        workspaceId: mockWorkspaceId,
        variables: { project_name: 'my-project' },
      });

      expect(result.jobId).toBe('installation-123');
      expect(result.status).toBe(InstallationStatus.PENDING);
      expect(installationQueue.add).toHaveBeenCalled();
      expect(webSocketGateway.emitInstallationStarted).toHaveBeenCalled();
    });

    it('should throw NotFoundException if template not found', async () => {
      templateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.startInstallation(mockUserId, mockTemplateId, {
          projectName: 'my-project',
          workspaceId: mockWorkspaceId,
          variables: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no workspace access', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate);
      workspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.startInstallation(mockUserId, mockTemplateId, {
          projectName: 'my-project',
          workspaceId: mockWorkspaceId,
          variables: {},
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if project name already exists', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate);
      workspaceMemberRepository.findOne.mockResolvedValue(mockWorkspaceMember);
      projectRepository.findOne.mockResolvedValue({ id: 'existing-project' });

      await expect(
        service.startInstallation(mockUserId, mockTemplateId, {
          projectName: 'my-project',
          workspaceId: mockWorkspaceId,
          variables: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if variable validation fails', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate);
      workspaceMemberRepository.findOne.mockResolvedValue(mockWorkspaceMember);
      projectRepository.findOne.mockResolvedValue(null);
      scaffoldingService.validateVariables.mockReturnValue({
        valid: false,
        errors: [{ field: 'project_name', message: 'Required' }],
        resolved: {},
      });

      await expect(
        service.startInstallation(mockUserId, mockTemplateId, {
          projectName: 'my-project',
          workspaceId: mockWorkspaceId,
          variables: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getInstallationStatus', () => {
    it('should return installation status', async () => {
      const mockInstallation = {
        id: 'installation-123',
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        projectName: 'my-project',
        variables: {},
        status: InstallationStatus.COMPLETE,
        currentStep: InstallationStep.COMPLETED,
        progress: 100,
        error: null,
        githubRepoUrl: 'https://github.com/user/my-project',
        projectId: 'project-123',
        totalFiles: 10,
        processedFiles: 10,
        createdAt: new Date(),
        completedAt: new Date(),
        template: mockTemplate,
        project: { id: 'project-123' },
      };

      installationRepository.findOne.mockResolvedValue(mockInstallation);

      const result = await service.getInstallationStatus('installation-123', mockUserId);

      expect(result.id).toBe('installation-123');
      expect(result.status).toBe(InstallationStatus.COMPLETE);
      expect(result.progress).toBe(100);
    });

    it('should throw NotFoundException if installation not found', async () => {
      installationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getInstallationStatus('nonexistent', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own installation', async () => {
      installationRepository.findOne.mockResolvedValue({
        id: 'installation-123',
        userId: 'other-user',
      });

      await expect(
        service.getInstallationStatus('installation-123', mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelInstallation', () => {
    it('should cancel a pending installation', async () => {
      installationRepository.findOne.mockResolvedValue({
        id: 'installation-123',
        userId: mockUserId,
        status: InstallationStatus.PENDING,
      });
      installationQueue.getJob.mockResolvedValue({
        remove: jest.fn(),
      });
      // Mock the atomic update with affected count
      installationRepository.update.mockResolvedValue({ affected: 1 });

      await service.cancelInstallation('installation-123', mockUserId);

      expect(installationRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'installation-123',
          status: expect.anything(), // In() operator
        }),
        expect.objectContaining({
          status: InstallationStatus.CANCELLED,
        }),
      );
    });

    it('should throw BadRequestException if installation cannot be cancelled', async () => {
      installationRepository.findOne.mockResolvedValue({
        id: 'installation-123',
        userId: mockUserId,
        status: InstallationStatus.COMPLETE,
      });

      await expect(
        service.cancelInstallation('installation-123', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listInstallations', () => {
    it('should list installations with pagination', async () => {
      const mockInstallations = [
        {
          id: 'installation-1',
          templateId: mockTemplateId,
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          projectName: 'project-1',
          variables: {},
          status: InstallationStatus.COMPLETE,
          currentStep: InstallationStep.COMPLETED,
          progress: 100,
          createdAt: new Date(),
        },
        {
          id: 'installation-2',
          templateId: mockTemplateId,
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          projectName: 'project-2',
          variables: {},
          status: InstallationStatus.PENDING,
          currentStep: InstallationStep.INITIALIZED,
          progress: 0,
          createdAt: new Date(),
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getMany: jest.fn().mockResolvedValue(mockInstallations),
      };

      installationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.listInstallations(mockUserId, mockWorkspaceId, {
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('deleteInstallation', () => {
    it('should delete a completed installation', async () => {
      installationRepository.findOne.mockResolvedValue({
        id: 'installation-123',
        userId: mockUserId,
        status: InstallationStatus.COMPLETE,
      });
      installationRepository.remove.mockResolvedValue({});

      await service.deleteInstallation('installation-123', mockUserId);

      expect(installationRepository.remove).toHaveBeenCalled();
    });

    it('should throw BadRequestException when deleting in-progress installation', async () => {
      installationRepository.findOne.mockResolvedValue({
        id: 'installation-123',
        userId: mockUserId,
        status: InstallationStatus.PROCESSING,
      });

      await expect(
        service.deleteInstallation('installation-123', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
