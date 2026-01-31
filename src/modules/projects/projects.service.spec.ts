import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project, ProjectStatus } from '../../database/entities/project.entity';
import {
  ProjectPreferences,
  AiProvider,
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_MODEL,
} from '../../database/entities/project-preferences.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { AuditService } from '../../shared/audit/audit.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: Repository<Project>;
  let preferencesRepository: Repository<ProjectPreferences>;
  let dataSource: DataSource;

  const mockProjectRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
  };

  const mockPreferencesRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        {
          provide: getRepositoryToken(ProjectPreferences),
          useValue: mockPreferencesRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    projectRepository = module.get<Repository<Project>>(
      getRepositoryToken(Project),
    );
    preferencesRepository = module.get<Repository<ProjectPreferences>>(
      getRepositoryToken(ProjectPreferences),
    );
    dataSource = module.get<DataSource>(DataSource);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a project successfully', async () => {
      const userId = 'user-123';
      const workspaceId = 'workspace-123';
      const createDto: CreateProjectDto = {
        name: 'Test Project',
        description: 'Test Description',
      };

      const mockProject = {
        id: 'project-123',
        ...createDto,
        workspaceId,
        createdByUserId: userId,
        status: ProjectStatus.ACTIVE,
        preferences: {},
      };

      mockProjectRepository.findOne.mockResolvedValue(null);
      mockDataSource.transaction.mockImplementation(async (callback) => {
        const mockManager = {
          create: jest.fn().mockImplementation((entity, data) => data),
          save: jest.fn().mockResolvedValue(mockProject),
          findOne: jest.fn().mockResolvedValue(mockProject),
        };
        return callback(mockManager);
      });

      const result = await service.create(userId, workspaceId, createDto);

      expect(result).toEqual(mockProject);
      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { workspaceId, name: createDto.name },
      });
    });

    it('should throw ConflictException if project name already exists', async () => {
      const userId = 'user-123';
      const workspaceId = 'workspace-123';
      const createDto: CreateProjectDto = {
        name: 'Existing Project',
      };

      mockProjectRepository.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(userId, workspaceId, createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllByWorkspace', () => {
    it('should return all projects in a workspace', async () => {
      const workspaceId = 'workspace-123';
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', workspaceId },
        { id: 'project-2', name: 'Project 2', workspaceId },
      ];

      mockProjectRepository.find.mockResolvedValue(mockProjects);

      const result = await service.findAllByWorkspace(workspaceId);

      expect(result).toEqual(mockProjects);
      expect(mockProjectRepository.find).toHaveBeenCalledWith({
        where: { workspaceId, status: ProjectStatus.ACTIVE },
        relations: ['createdBy', 'preferences'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a project by ID', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = { id: projectId, workspaceId };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.findOne(projectId, workspaceId);

      expect(result).toEqual(mockProject);
      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { id: projectId, workspaceId },
        relations: ['createdBy', 'preferences'],
      });
    });

    it('should throw NotFoundException if project not found', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';

      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(projectId, workspaceId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a project successfully', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const updateDto = { name: 'Updated Project' };
      const mockProject = {
        id: projectId,
        workspaceId,
        name: 'Old Name',
      };

      mockProjectRepository.findOne
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockProject, ...updateDto });
      mockProjectRepository.save.mockResolvedValue({
        ...mockProject,
        ...updateDto,
      });

      const result = await service.update(projectId, workspaceId, updateDto);

      expect(result.name).toBe('Updated Project');
      expect(mockProjectRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if new name already exists', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const updateDto = { name: 'Existing Name' };
      const mockProject = {
        id: projectId,
        workspaceId,
        name: 'Old Name',
      };

      mockProjectRepository.findOne
        .mockResolvedValueOnce(mockProject)
        .mockResolvedValueOnce({ id: 'other-project' });

      await expect(
        service.update(projectId, workspaceId, updateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a project', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = { id: projectId, workspaceId };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockProjectRepository.softRemove.mockResolvedValue(mockProject);

      await service.softDelete(projectId, workspaceId);

      expect(mockProjectRepository.softRemove).toHaveBeenCalledWith(
        mockProject,
      );
    });
  });

  describe('archive', () => {
    it('should archive a project', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = {
        id: projectId,
        workspaceId,
        status: ProjectStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockProjectRepository.save.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
      });

      const result = await service.archive(projectId, workspaceId);

      expect(result.status).toBe(ProjectStatus.ARCHIVED);
      expect(mockProjectRepository.save).toHaveBeenCalled();
    });
  });

  describe('updatePreferences', () => {
    it('should update project preferences', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const preferencesDto = { codeStyle: 'oop' as any };
      const mockPreferences = { id: 'pref-123', projectId };
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: mockPreferences,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockPreferencesRepository.save.mockResolvedValue({
        ...mockPreferences,
        ...preferencesDto,
      });

      const result = await service.updatePreferences(
        projectId,
        workspaceId,
        preferencesDto,
      );

      expect(mockPreferencesRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if preferences not found', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const preferencesDto = { codeStyle: 'oop' as any };
      const mockProject = { id: projectId, workspaceId, preferences: null };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      await expect(
        service.updatePreferences(projectId, workspaceId, preferencesDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAiConfig', () => {
    it('should return default AI config when no preferences set', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: null,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.getAiConfig(projectId, workspaceId);

      expect(result.aiProvider).toBe(DEFAULT_AI_PROVIDER);
      expect(result.aiModel).toBe(DEFAULT_AI_MODEL);
    });

    it('should return current AI config from preferences', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: {
          id: 'pref-123',
          projectId,
          aiProvider: AiProvider.OPENAI,
          aiModel: 'gpt-4-turbo',
        },
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.getAiConfig(projectId, workspaceId);

      expect(result.aiProvider).toBe('openai');
      expect(result.aiModel).toBe('gpt-4-turbo');
    });

    it('should return default values when preferences have empty ai fields', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: {
          id: 'pref-123',
          projectId,
          aiProvider: '',
          aiModel: '',
        },
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.getAiConfig(projectId, workspaceId);

      expect(result.aiProvider).toBe(DEFAULT_AI_PROVIDER);
      expect(result.aiModel).toBe(DEFAULT_AI_MODEL);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAiConfig('nonexistent', 'workspace-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAiConfig', () => {
    it('should update AI config to anthropic provider', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const dto: UpdateAiConfigDto = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-5-20250929',
      };
      const mockPreferences = {
        id: 'pref-123',
        projectId,
        aiProvider: 'openai',
        aiModel: 'gpt-4-turbo',
      };
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: mockPreferences,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockPreferencesRepository.save.mockResolvedValue({
        ...mockPreferences,
        aiProvider: dto.aiProvider,
        aiModel: dto.aiModel,
      });

      const result = await service.updateAiConfig(
        projectId,
        workspaceId,
        dto,
      );

      expect(result.aiProvider).toBe('anthropic');
      expect(result.aiModel).toBe('claude-sonnet-4-5-20250929');
      expect(mockPreferencesRepository.save).toHaveBeenCalled();
    });

    it('should update AI config from anthropic to openai', async () => {
      const projectId = 'project-123';
      const workspaceId = 'workspace-123';
      const dto: UpdateAiConfigDto = {
        aiProvider: 'openai',
        aiModel: 'gpt-4-turbo',
      };
      const mockPreferences = {
        id: 'pref-123',
        projectId,
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-5-20250929',
      };
      const mockProject = {
        id: projectId,
        workspaceId,
        preferences: mockPreferences,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockPreferencesRepository.save.mockResolvedValue({
        ...mockPreferences,
        aiProvider: dto.aiProvider,
        aiModel: dto.aiModel,
      });

      const result = await service.updateAiConfig(
        projectId,
        workspaceId,
        dto,
      );

      expect(result.aiProvider).toBe('openai');
      expect(result.aiModel).toBe('gpt-4-turbo');
    });

    it('should reject invalid model for provider (openai model with anthropic provider)', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'anthropic',
        aiModel: 'gpt-4-turbo',
      };

      await expect(
        service.updateAiConfig('project-123', 'workspace-123', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid model for provider (anthropic model with openai provider)', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'openai',
        aiModel: 'claude-sonnet-4-5-20250929',
      };

      await expect(
        service.updateAiConfig('project-123', 'workspace-123', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid provider', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'invalid-provider',
        aiModel: 'some-model',
      };

      await expect(
        service.updateAiConfig('project-123', 'workspace-123', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid model that does not exist for any provider', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'openai',
        aiModel: 'nonexistent-model',
      };

      await expect(
        service.updateAiConfig('project-123', 'workspace-123', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if project not found', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-5-20250929',
      };

      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateAiConfig('nonexistent', 'workspace-123', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if preferences not found', async () => {
      const dto: UpdateAiConfigDto = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-5-20250929',
      };
      const mockProject = {
        id: 'project-123',
        workspaceId: 'workspace-123',
        preferences: null,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      await expect(
        service.updateAiConfig('project-123', 'workspace-123', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accept all valid anthropic models', async () => {
      const validAnthropicModels = [
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-5-20251101',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
      ];

      for (const model of validAnthropicModels) {
        const dto: UpdateAiConfigDto = {
          aiProvider: 'anthropic',
          aiModel: model,
        };
        const mockPreferences = {
          id: 'pref-123',
          projectId: 'project-123',
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-5-20250929',
        };
        const mockProject = {
          id: 'project-123',
          workspaceId: 'workspace-123',
          preferences: mockPreferences,
        };

        mockProjectRepository.findOne.mockResolvedValue(mockProject);
        mockPreferencesRepository.save.mockResolvedValue({
          ...mockPreferences,
          aiModel: model,
        });

        const result = await service.updateAiConfig(
          'project-123',
          'workspace-123',
          dto,
        );

        expect(result.aiModel).toBe(model);
        expect(result.aiProvider).toBe('anthropic');
      }
    });

    it('should accept all valid openai models', async () => {
      const validOpenAIModels = ['gpt-4-turbo', 'gpt-3.5-turbo'];

      for (const model of validOpenAIModels) {
        const dto: UpdateAiConfigDto = {
          aiProvider: 'openai',
          aiModel: model,
        };
        const mockPreferences = {
          id: 'pref-123',
          projectId: 'project-123',
          aiProvider: 'openai',
          aiModel: 'gpt-4-turbo',
        };
        const mockProject = {
          id: 'project-123',
          workspaceId: 'workspace-123',
          preferences: mockPreferences,
        };

        mockProjectRepository.findOne.mockResolvedValue(mockProject);
        mockPreferencesRepository.save.mockResolvedValue({
          ...mockPreferences,
          aiModel: model,
        });

        const result = await service.updateAiConfig(
          'project-123',
          'workspace-123',
          dto,
        );

        expect(result.aiModel).toBe(model);
        expect(result.aiProvider).toBe('openai');
      }
    });
  });
});
