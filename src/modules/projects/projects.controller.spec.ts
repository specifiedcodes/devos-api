import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectPreferencesDto } from './dto/create-project-preferences.dto';
import { UpdateProjectPreferencesDto } from './dto/update-project-preferences.dto';
import {
  Project,
  ProjectStatus,
} from '../../database/entities/project.entity';
import {
  ProjectPreferences,
  RepositoryStructure,
  CodeStyle,
  GitWorkflow,
  TestingStrategy,
} from '../../database/entities/project-preferences.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../common/guards/role.guard';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: ProjectsService;

  const mockProjectsService = {
    create: jest.fn(),
    findAllByWorkspace: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    archive: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const mockProject: Partial<Project> = {
    id: 'project-uuid-123',
    name: 'Test Project',
    description: 'A test project',
    workspaceId: 'workspace-uuid-456',
    createdByUserId: 'user-uuid-789',
    status: ProjectStatus.ACTIVE,
    createdAt: new Date('2026-01-30T12:00:00.000Z'),
    updatedAt: new Date('2026-01-30T12:00:00.000Z'),
    preferences: {
      id: 'prefs-uuid-001',
      projectId: 'project-uuid-123',
      repositoryStructure: RepositoryStructure.MONOREPO,
      codeStyle: CodeStyle.FUNCTIONAL,
      gitWorkflow: GitWorkflow.GITHUB_FLOW,
      testingStrategy: TestingStrategy.BALANCED,
    } as ProjectPreferences,
  };

  const mockRequest = {
    user: {
      id: 'user-uuid-789',
      email: 'user@example.com',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
    projectsService = module.get<ProjectsService>(ProjectsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/v1/workspaces/:workspaceId/projects', () => {
    const createDto: CreateProjectDto = {
      name: 'Test Project',
      description: 'A test project',
    };

    const preferencesDto: CreateProjectPreferencesDto = {
      repositoryStructure: RepositoryStructure.MONOREPO,
      codeStyle: CodeStyle.FUNCTIONAL,
    };

    it('should create a project successfully', async () => {
      // Arrange
      mockProjectsService.create.mockResolvedValue(mockProject);

      // Act
      const result = await controller.create(
        'workspace-uuid-456',
        createDto,
        preferencesDto,
        mockRequest,
      );

      // Assert
      expect(result).toEqual(mockProject);
      expect(projectsService.create).toHaveBeenCalledWith(
        'user-uuid-789',
        'workspace-uuid-456',
        createDto,
        preferencesDto,
      );
      expect(projectsService.create).toHaveBeenCalledTimes(1);
    });

    it('should create project without preferences', async () => {
      // Arrange
      mockProjectsService.create.mockResolvedValue(mockProject);

      // Act
      await controller.create(
        'workspace-uuid-456',
        createDto,
        {} as CreateProjectPreferencesDto,
        mockRequest,
      );

      // Assert
      expect(projectsService.create).toHaveBeenCalledWith(
        'user-uuid-789',
        'workspace-uuid-456',
        createDto,
        {},
      );
    });

    it('should throw ConflictException for duplicate project name', async () => {
      // Arrange
      mockProjectsService.create.mockRejectedValue(
        new ConflictException('Project with this name already exists'),
      );

      // Act & Assert
      await expect(
        controller.create('workspace-uuid-456', createDto, preferencesDto, mockRequest),
      ).rejects.toThrow(ConflictException);
      await expect(
        controller.create('workspace-uuid-456', createDto, preferencesDto, mockRequest),
      ).rejects.toThrow('Project with this name already exists');
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects', () => {
    it('should return all projects in workspace', async () => {
      // Arrange
      const projectList = [mockProject, { ...mockProject, id: 'project-uuid-456' }];
      mockProjectsService.findAllByWorkspace.mockResolvedValue(projectList);

      // Act
      const result = await controller.findAll('workspace-uuid-456');

      // Assert
      expect(result).toEqual(projectList);
      expect(result).toHaveLength(2);
      expect(projectsService.findAllByWorkspace).toHaveBeenCalledWith(
        'workspace-uuid-456',
      );
      expect(projectsService.findAllByWorkspace).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no projects exist', async () => {
      // Arrange
      mockProjectsService.findAllByWorkspace.mockResolvedValue([]);

      // Act
      const result = await controller.findAll('workspace-uuid-456');

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId', () => {
    it('should return a single project by ID', async () => {
      // Arrange
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      // Act
      const result = await controller.findOne(
        'workspace-uuid-456',
        'project-uuid-123',
      );

      // Assert
      expect(result).toEqual(mockProject);
      expect(projectsService.findOne).toHaveBeenCalledWith(
        'project-uuid-123',
        'workspace-uuid-456',
      );
      expect(projectsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if project not found', async () => {
      // Arrange
      mockProjectsService.findOne.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      // Act & Assert
      await expect(
        controller.findOne('workspace-uuid-456', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.findOne('workspace-uuid-456', 'nonexistent-id'),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('PATCH /api/v1/workspaces/:workspaceId/projects/:projectId', () => {
    const updateDto: UpdateProjectDto = {
      name: 'Updated Project',
      description: 'Updated description',
    };

    it('should update a project successfully', async () => {
      // Arrange
      const updatedProject = {
        ...mockProject,
        name: 'Updated Project',
        description: 'Updated description',
      };
      mockProjectsService.update.mockResolvedValue(updatedProject);

      // Act
      const result = await controller.update(
        'workspace-uuid-456',
        'project-uuid-123',
        updateDto,
      );

      // Assert
      expect(result).toEqual(updatedProject);
      expect(result.name).toBe('Updated Project');
      expect(projectsService.update).toHaveBeenCalledWith(
        'project-uuid-123',
        'workspace-uuid-456',
        updateDto,
      );
      expect(projectsService.update).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if project not found', async () => {
      // Arrange
      mockProjectsService.update.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      // Act & Assert
      await expect(
        controller.update('workspace-uuid-456', 'nonexistent-id', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new name already exists', async () => {
      // Arrange
      mockProjectsService.update.mockRejectedValue(
        new ConflictException('Project with this name already exists'),
      );

      // Act & Assert
      await expect(
        controller.update(
          'workspace-uuid-456',
          'project-uuid-123',
          { name: 'Existing Name' },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /api/v1/workspaces/:workspaceId/projects/:projectId', () => {
    it('should soft delete a project successfully', async () => {
      // Arrange
      mockProjectsService.softDelete.mockResolvedValue(undefined);

      // Act
      const result = await controller.remove(
        'workspace-uuid-456',
        'project-uuid-123',
      );

      // Assert
      expect(result).toBeUndefined();
      expect(projectsService.softDelete).toHaveBeenCalledWith(
        'project-uuid-123',
        'workspace-uuid-456',
      );
      expect(projectsService.softDelete).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if project not found', async () => {
      // Arrange
      mockProjectsService.softDelete.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      // Act & Assert
      await expect(
        controller.remove('workspace-uuid-456', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/preferences', () => {
    it('should return project preferences', async () => {
      // Arrange
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      // Act
      const result = await controller.getPreferences(
        'workspace-uuid-456',
        'project-uuid-123',
      );

      // Assert
      expect(result).toEqual(mockProject.preferences);
      expect(result?.repositoryStructure).toBe(RepositoryStructure.MONOREPO);
      expect(result?.codeStyle).toBe(CodeStyle.FUNCTIONAL);
      expect(projectsService.findOne).toHaveBeenCalledWith(
        'project-uuid-123',
        'workspace-uuid-456',
      );
    });

    it('should throw NotFoundException if project not found', async () => {
      // Arrange
      mockProjectsService.findOne.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      // Act & Assert
      await expect(
        controller.getPreferences('workspace-uuid-456', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/preferences', () => {
    const preferencesDto: UpdateProjectPreferencesDto = {
      codeStyle: CodeStyle.OOP,
      testingStrategy: TestingStrategy.E2E_HEAVY,
    };

    it('should update project preferences successfully', async () => {
      // Arrange
      const updatedPreferences = {
        ...mockProject.preferences,
        codeStyle: CodeStyle.OOP,
        testingStrategy: TestingStrategy.E2E_HEAVY,
      } as ProjectPreferences;
      mockProjectsService.updatePreferences.mockResolvedValue(updatedPreferences);

      // Act
      const result = await controller.updatePreferences(
        'workspace-uuid-456',
        'project-uuid-123',
        preferencesDto,
      );

      // Assert
      expect(result).toEqual(updatedPreferences);
      expect(result.codeStyle).toBe(CodeStyle.OOP);
      expect(result.testingStrategy).toBe(TestingStrategy.E2E_HEAVY);
      expect(projectsService.updatePreferences).toHaveBeenCalledWith(
        'project-uuid-123',
        'workspace-uuid-456',
        preferencesDto,
      );
      expect(projectsService.updatePreferences).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if project not found', async () => {
      // Arrange
      mockProjectsService.updatePreferences.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      // Act & Assert
      await expect(
        controller.updatePreferences(
          'workspace-uuid-456',
          'nonexistent-id',
          preferencesDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if preferences not found', async () => {
      // Arrange
      mockProjectsService.updatePreferences.mockRejectedValue(
        new NotFoundException('Project preferences not found'),
      );

      // Act & Assert
      await expect(
        controller.updatePreferences(
          'workspace-uuid-456',
          'project-uuid-123',
          preferencesDto,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.updatePreferences(
          'workspace-uuid-456',
          'project-uuid-123',
          preferencesDto,
        ),
      ).rejects.toThrow('Project preferences not found');
    });
  });
});
