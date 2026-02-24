/**
 * Template Update Service Tests
 *
 * Story 19-7: Template Versioning
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { TemplateUpdateService } from '../services/template-update.service';
import {
  ProjectTemplateVersion,
  TemplateUpdateType,
} from '../../../database/entities/project-template-version.entity';
import { TemplateVersion } from '../../../database/entities/template-version.entity';
import { Template } from '../../../database/entities/template.entity';
import { Project } from '../../../database/entities/project.entity';

describe('TemplateUpdateService', () => {
  let service: TemplateUpdateService;
  let projectTemplateVersionRepository: jest.Mocked<Repository<ProjectTemplateVersion>>;
  let templateVersionRepository: jest.Mocked<Repository<TemplateVersion>>;
  let templateRepository: jest.Mocked<Repository<Template>>;
  let projectRepository: jest.Mocked<Repository<Project>>;

  const mockProjectId = '123e4567-e89b-12d3-a456-426614174000';
  const mockTemplateId = '123e4567-e89b-12d3-a456-426614174001';
  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174002';

  const mockTemplate: Partial<Template> = {
    id: mockTemplateId,
    name: 'test-template',
    displayName: 'Test Template',
    version: '1.1.0',
  };

  const mockProjectTemplateVersion: Partial<ProjectTemplateVersion> = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    projectId: mockProjectId,
    templateId: mockTemplateId,
    installedVersion: '1.0.0',
    latestVersion: '1.0.0',
    updateAvailable: false,
    updateType: null,
    lastCheckedAt: new Date(),
    template: mockTemplate as Template,
  };

  const mockLatestVersion: Partial<TemplateVersion> = {
    id: '123e4567-e89b-12d3-a456-426614174004',
    templateId: mockTemplateId,
    version: '1.1.0',
    changelog: 'New features',
    isLatest: true,
  };

  beforeEach(async () => {
    const mockPtVersionRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockProjectTemplateVersion]),
      })),
    };

    const mockVersionRepo = {
      findOne: jest.fn(),
    };

    const mockTemplateRepo = {
      findOne: jest.fn(),
    };

    const mockProjectRepo = {
      findOne: jest.fn(),
    };

    const mockDataSource = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateUpdateService,
        {
          provide: getRepositoryToken(ProjectTemplateVersion),
          useValue: mockPtVersionRepo,
        },
        {
          provide: getRepositoryToken(TemplateVersion),
          useValue: mockVersionRepo,
        },
        {
          provide: getRepositoryToken(Template),
          useValue: mockTemplateRepo,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TemplateUpdateService>(TemplateUpdateService);
    projectTemplateVersionRepository = module.get(getRepositoryToken(ProjectTemplateVersion));
    templateVersionRepository = module.get(getRepositoryToken(TemplateVersion));
    templateRepository = module.get(getRepositoryToken(Template));
    projectRepository = module.get(getRepositoryToken(Project));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordProjectTemplateVersion', () => {
    it('should record a new project template version', async () => {
      templateVersionRepository.findOne.mockResolvedValue(mockLatestVersion as TemplateVersion);
      projectTemplateVersionRepository.create.mockReturnValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.recordProjectTemplateVersion(
        mockProjectId,
        mockTemplateId,
        '1.0.0',
      );

      expect(result).toBeDefined();
      expect(projectTemplateVersionRepository.create).toHaveBeenCalled();
      expect(projectTemplateVersionRepository.save).toHaveBeenCalled();
    });

    it('should create record even without existing template version', async () => {
      templateVersionRepository.findOne.mockResolvedValue(null);
      projectTemplateVersionRepository.create.mockReturnValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.recordProjectTemplateVersion(
        mockProjectId,
        mockTemplateId,
        '1.0.0',
      );

      expect(result).toBeDefined();
    });
  });

  describe('checkForUpdates', () => {
    it('should detect an available update', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue({
        ...mockProjectTemplateVersion,
        installedVersion: '1.0.0',
      } as ProjectTemplateVersion);
      templateVersionRepository.findOne.mockResolvedValue({
        ...mockLatestVersion,
        version: '1.1.0',
      } as TemplateVersion);
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.checkForUpdates(mockProjectId);

      expect(result.updateAvailable).toBe(true);
      expect(result.updateType).toBe('minor');
      expect(result.installedVersion).toBe('1.0.0');
      expect(result.latestVersion).toBe('1.1.0');
    });

    it('should detect a patch update', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue({
        ...mockProjectTemplateVersion,
        installedVersion: '1.0.0',
      } as ProjectTemplateVersion);
      templateVersionRepository.findOne.mockResolvedValue({
        ...mockLatestVersion,
        version: '1.0.1',
      } as TemplateVersion);
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.checkForUpdates(mockProjectId);

      expect(result.updateAvailable).toBe(true);
      expect(result.updateType).toBe('patch');
    });

    it('should detect a major update', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue({
        ...mockProjectTemplateVersion,
        installedVersion: '1.0.0',
      } as ProjectTemplateVersion);
      templateVersionRepository.findOne.mockResolvedValue({
        ...mockLatestVersion,
        version: '2.0.0',
      } as TemplateVersion);
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.checkForUpdates(mockProjectId);

      expect(result.updateAvailable).toBe(true);
      expect(result.updateType).toBe('major');
    });

    it('should not show update if user dismissed that version', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue({
        ...mockProjectTemplateVersion,
        installedVersion: '1.0.0',
        dismissedVersion: '1.1.0',
      } as ProjectTemplateVersion);
      templateVersionRepository.findOne.mockResolvedValue({
        ...mockLatestVersion,
        version: '1.1.0',
      } as TemplateVersion);
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.checkForUpdates(mockProjectId);

      expect(result.updateAvailable).toBe(false);
    });

    it('should throw NotFoundException if record does not exist', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue(null);

      await expect(service.checkForUpdates(mockProjectId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUpdateStatus', () => {
    it('should return update status', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      const result = await service.getUpdateStatus(mockProjectId);

      expect(result.projectId).toBe(mockProjectId);
      expect(result.templateId).toBe(mockTemplateId);
      expect(result.installedVersion).toBe('1.0.0');
    });

    it('should throw NotFoundException if record does not exist', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue(null);

      await expect(service.getUpdateStatus(mockProjectId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('dismissUpdate', () => {
    it('should dismiss an update', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );
      projectTemplateVersionRepository.save.mockResolvedValue(
        mockProjectTemplateVersion as ProjectTemplateVersion,
      );

      await service.dismissUpdate(mockProjectId, '1.1.0');

      expect(projectTemplateVersionRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if record does not exist', async () => {
      projectTemplateVersionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.dismissUpdate(mockProjectId, '1.1.0'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearDismissedUpdate', () => {
    it('should clear dismissed update', async () => {
      await service.clearDismissedUpdate(mockProjectId);

      expect(projectTemplateVersionRepository.update).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        { dismissedVersion: null },
      );
    });
  });

  describe('batchCheckUpdates', () => {
    it('should check updates for all projects', async () => {
      // This tests the batch update checking functionality
      const result = await service.batchCheckUpdates(mockWorkspaceId);

      expect(result.checked).toBeDefined();
      expect(result.updated).toBeDefined();
    });
  });

  describe('getProjectsWithUpdates', () => {
    it('should return projects with available updates', async () => {
      const result = await service.getProjectsWithUpdates(mockWorkspaceId);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('deleteForProject', () => {
    it('should delete the project template version record', async () => {
      await service.deleteForProject(mockProjectId);

      expect(projectTemplateVersionRepository.delete).toHaveBeenCalledWith({
        projectId: mockProjectId,
      });
    });
  });
});
