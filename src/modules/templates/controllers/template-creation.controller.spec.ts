/**
 * TemplateCreationController Tests
 * Story 19-2: Template Creation Wizard (AC1)
 *
 * Tests for template creation API endpoints.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CreateTemplateFromProjectDto } from '../dto/create-template-from-project.dto';
import { TemplateCategory } from '../../../database/entities/template.entity';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

// Mock the service to avoid ESM issues with Octokit
const mockTemplateCreationService = {
  createFromProject: jest.fn(),
  createFromGitHub: jest.fn(),
  detectPatterns: jest.fn(),
  applyTemplatization: jest.fn(),
  getFileTreePreview: jest.fn(),
  getFileContents: jest.fn(),
};

// Mock the service module
jest.mock('../services/template-creation.service', () => ({
  TemplateCreationService: jest.fn().mockImplementation(() => mockTemplateCreationService),
}));

// Import after mocks
import { TemplateCreationController } from './template-creation.controller';
import { TemplateCreationService } from '../services/template-creation.service';

describe('TemplateCreationController', () => {
  let controller: TemplateCreationController;
  let service: typeof mockTemplateCreationService;

  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174001';
  const mockProjectId = '123e4567-e89b-12d3-a456-426614174002';

  const mockRequest = {
    user: { sub: mockUserId },
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateCreationController],
      providers: [
        {
          provide: TemplateCreationService,
          useValue: mockTemplateCreationService,
        },
      ],
    }).compile();

    controller = module.get<TemplateCreationController>(TemplateCreationController);
    service = mockTemplateCreationService;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createFromProject', () => {
    const createValidDto = (): CreateTemplateFromProjectDto => ({
      source: {
        type: 'project',
        projectId: mockProjectId,
      },
      name: 'my-template',
      displayName: 'My Template',
      description: 'Test template',
      category: TemplateCategory.WEB_APP,
      variables: [],
      workspaceId: mockWorkspaceId,
    });

    it('should create template from project', async () => {
      const dto = createValidDto();
      const mockTemplate = {
        id: 'new-template-id',
        name: dto.name,
        displayName: dto.displayName,
      };

      service.createFromProject.mockResolvedValue(mockTemplate as any);

      const result = await controller.createFromProject(
        mockWorkspaceId,
        mockRequest,
        dto,
      );

      expect(service.createFromProject).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        dto,
      );
      expect(result).toEqual(mockTemplate);
    });

    it('should throw ForbiddenException when user lacks access', async () => {
      const dto = createValidDto();

      service.createFromProject.mockRejectedValue(
        new ForbiddenException('User is not a member of this workspace'),
      );

      await expect(
        controller.createFromProject(mockWorkspaceId, mockRequest, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when project not found', async () => {
      const dto = createValidDto();

      service.createFromProject.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      await expect(
        controller.createFromProject(mockWorkspaceId, mockRequest, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for duplicate name', async () => {
      const dto = createValidDto();

      service.createFromProject.mockRejectedValue(
        new BadRequestException('Template name already exists'),
      );

      await expect(
        controller.createFromProject(mockWorkspaceId, mockRequest, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createFromGitHub', () => {
    const createGitHubDto = (): CreateTemplateFromProjectDto => ({
      source: {
        type: 'github_url',
        githubUrl: 'https://github.com/owner/repo',
        branch: 'main',
      },
      name: 'my-template',
      displayName: 'My Template',
      description: 'Test template',
      category: TemplateCategory.WEB_APP,
      variables: [],
    });

    it('should create template from GitHub URL', async () => {
      const dto = createGitHubDto();
      const mockTemplate = {
        id: 'new-template-id',
        name: dto.name,
        displayName: dto.displayName,
      };

      service.createFromGitHub.mockResolvedValue(mockTemplate as any);

      const result = await controller.createFromGitHub(
        mockWorkspaceId,
        mockRequest,
        dto,
      );

      expect(service.createFromGitHub).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        dto,
      );
      expect(result).toEqual(mockTemplate);
    });

    it('should throw ForbiddenException when GitHub not connected', async () => {
      const dto = createGitHubDto();

      service.createFromGitHub.mockRejectedValue(
        new ForbiddenException('GitHub connection required'),
      );

      await expect(
        controller.createFromGitHub(mockWorkspaceId, mockRequest, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when repo not found', async () => {
      const dto = createGitHubDto();

      service.createFromGitHub.mockRejectedValue(
        new NotFoundException('Repository not found'),
      );

      await expect(
        controller.createFromGitHub(mockWorkspaceId, mockRequest, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('detectPatterns', () => {
    it('should detect patterns from files', async () => {
      const files = [
        { path: 'package.json', content: '{"name": "my-app"}' },
      ];
      const mockPatterns = [
        {
          type: 'project_name',
          pattern: 'my-app',
          suggestedVariable: 'project_name',
          occurrences: [{ file: 'package.json', line: 1, context: 'my-app' }],
          confidence: 0.95,
        },
      ];

      service.detectPatterns.mockResolvedValue(mockPatterns);

      const result = await controller.detectPatterns({ files });

      expect(service.detectPatterns).toHaveBeenCalledWith(files);
      expect(result).toEqual({ patterns: mockPatterns });
    });

    it('should return empty array for files with no patterns', async () => {
      const files = [{ path: 'README.md', content: '# My Project' }];

      service.detectPatterns.mockResolvedValue([]);

      const result = await controller.detectPatterns({ files });

      expect(result.patterns).toEqual([]);
    });
  });

  describe('getFileTreePreview', () => {
    it('should return file tree for project', async () => {
      const mockTree = {
        tree: [
          { path: 'src', type: 'directory' as const, children: [] },
          { path: 'package.json', type: 'file' as const, size: 1000 },
        ],
        totalFiles: 1,
        totalDirectories: 1,
        totalSize: 1000,
      };

      service.getFileTreePreview.mockResolvedValue(mockTree);

      const result = await controller.getFileTreePreview(
        mockWorkspaceId,
        mockRequest,
        {
          source: { type: 'project', projectId: mockProjectId },
        },
      );

      expect(service.getFileTreePreview).toHaveBeenCalled();
      expect(result).toEqual(mockTree);
    });

    it('should return file tree for GitHub URL', async () => {
      const mockTree = {
        tree: [{ path: 'README.md', type: 'file' as const, size: 500 }],
        totalFiles: 1,
        totalDirectories: 0,
        totalSize: 500,
      };

      service.getFileTreePreview.mockResolvedValue(mockTree);

      const result = await controller.getFileTreePreview(
        mockWorkspaceId,
        mockRequest,
        {
          source: {
            type: 'github_url',
            githubUrl: 'https://github.com/owner/repo',
          },
        },
      );

      expect(result).toEqual(mockTree);
    });
  });

  describe('getFileContents', () => {
    it('should return file contents for pattern detection', async () => {
      const mockFiles = [
        { path: 'package.json', content: '{"name": "my-app"}' },
      ];

      service.getFileContents.mockResolvedValue(mockFiles);

      const result = await controller.getFileContents(
        mockWorkspaceId,
        mockRequest,
        {
          source: { type: 'project', projectId: mockProjectId },
        },
      );

      expect(service.getFileContents).toHaveBeenCalled();
      expect(result).toEqual({ files: mockFiles });
    });
  });

  describe('applyTemplatization', () => {
    it('should apply patterns to files', async () => {
      const files = [{ path: 'package.json', content: '{"name": "my-app"}' }];
      const patterns = [{ pattern: 'my-app', variable: 'project_name' }];
      const mockResult = [
        { path: 'package.json', content: '{"name": "{{project_name}}"}' },
      ];

      service.applyTemplatization.mockResolvedValue(mockResult);

      const result = await controller.applyTemplatization({ files, patterns });

      expect(service.applyTemplatization).toHaveBeenCalledWith(files, patterns);
      expect(result).toEqual({ files: mockResult });
    });
  });
});
