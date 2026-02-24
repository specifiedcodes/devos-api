/**
 * TemplateScaffoldingService Unit Tests
 *
 * Story 19-3: Parameterized Scaffolding
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue, Job } from 'bull';
import { Template } from '../../../database/entities/template.entity';
import {
  TemplateScaffoldingService,
  ScaffoldJobStatus,
  ScaffoldJobData,
} from './template-scaffolding.service';
import { TemplateEngineService } from './template-engine.service';
import { VariableResolverService } from './variable-resolver.service';

describe('TemplateScaffoldingService', () => {
  let service: TemplateScaffoldingService;
  let mockTemplateRepo: jest.Mocked<Repository<Template>>;
  let mockQueue: jest.Mocked<Queue>;
  let mockTemplateEngine: jest.Mocked<TemplateEngineService>;
  let mockVariableResolver: jest.Mocked<VariableResolverService>;

  const mockTemplate: Template = {
    id: 'template-123',
    name: 'test-template',
    displayName: 'Test Template',
    description: 'A test template',
    longDescription: null,
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: {
      stack: { frontend: 'React', backend: 'Node.js' },
      variables: [
        { name: 'project_name', type: 'string', required: true },
        { name: 'description', type: 'string', default: 'A new project' },
      ],
      files: { source_type: 'inline', inline_files: {} },
    },
    category: 'web-app' as any,
    tags: ['test'],
    icon: 'code',
    screenshots: [],
    stackSummary: {},
    variables: [
      { name: 'project_name', type: 'string', required: true },
    ],
    sourceType: 'inline' as any,
    sourceUrl: null,
    sourceBranch: 'main',
    isOfficial: true,
    isPublished: true,
    isActive: true,
    totalUses: 0,
    avgRating: 0,
    ratingCount: 0,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockTemplateRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
    } as any;

    mockTemplateEngine = {
      render: jest.fn((t, v) => {
        let result = t;
        for (const [key, value] of Object.entries(v || {})) {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }
        return result;
      }),
      renderFile: jest.fn((file, vars) => ({
        path: file.path,
        content: mockTemplateEngine.render(file.content, vars),
        size: 100,
      })),
      shouldSkipFile: jest.fn().mockReturnValue(false),
    } as any;

    mockVariableResolver = {
      validate: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      resolve: jest.fn((defs, values) => ({ ...values })),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateScaffoldingService,
        { provide: getRepositoryToken(Template), useValue: mockTemplateRepo },
        { provide: getQueueToken('scaffold'), useValue: mockQueue },
        { provide: TemplateEngineService, useValue: mockTemplateEngine },
        { provide: VariableResolverService, useValue: mockVariableResolver },
      ],
    }).compile();

    service = module.get<TemplateScaffoldingService>(TemplateScaffoldingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== Scaffold Tests ====================
  describe('scaffold', () => {
    it('should create a BullMQ job', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(mockTemplate);
      mockQueue.add.mockResolvedValue({ id: 'job-123' } as Job);

      const result = await service.scaffold('ws-1', 'user-1', {
        templateId: 'template-123',
        projectName: 'my-project',
        variables: { project_name: 'MyProject' },
      });

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('status', ScaffoldJobStatus.PENDING);
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should return preview for dry run', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(mockTemplate);

      const result = await service.scaffold('ws-1', 'user-1', {
        templateId: 'template-123',
        projectName: 'my-project',
        variables: { project_name: 'MyProject' },
        dryRun: true,
      });

      expect(result).toHaveProperty('preview');
      expect((result as any).preview).toHaveProperty('fileCount');
    });

    it('should throw for invalid variables', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(mockTemplate);
      mockVariableResolver.validate.mockReturnValue({
        valid: false,
        errors: [{ field: 'project_name', message: 'Required', type: 'required' }],
      });

      await expect(
        service.scaffold('ws-1', 'user-1', {
          templateId: 'template-123',
          projectName: 'my-project',
          variables: {},
        }),
      ).rejects.toThrow();
    });
  });

  // ==================== ValidateVariables Tests ====================
  describe('validateVariables', () => {
    it('should validate variables correctly', () => {
      mockVariableResolver.validate.mockReturnValue({ valid: true, errors: [] });
      mockVariableResolver.resolve.mockReturnValue({ project_name: 'Test' });

      const result = service.validateVariables(mockTemplate, { project_name: 'Test' });

      expect(result.valid).toBe(true);
      expect(result.resolved).toHaveProperty('project_name');
    });

    it('should return errors for invalid variables', () => {
      mockVariableResolver.validate.mockReturnValue({
        valid: false,
        errors: [{ field: 'project_name', message: 'Required', type: 'required' }],
      });

      const result = service.validateVariables(mockTemplate, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ==================== ResolveVariables Tests ====================
  describe('resolveVariables', () => {
    it('should apply defaults', () => {
      mockVariableResolver.resolve.mockReturnValue({
        project_name: 'Test',
        description: 'A new project',
      });

      const result = service.resolveVariables(mockTemplate, { project_name: 'Test' });

      expect(result.description).toBe('A new project');
    });
  });

  // ==================== FetchSourceFiles Tests ====================
  describe('fetchSourceFiles', () => {
    it('should return files for templates', async () => {
      // The service returns placeholder files for git-based templates
      const files = await service.fetchSourceFiles(mockTemplate);

      expect(files).toBeDefined();
      // Files are returned (either inline or placeholders)
      expect(Array.isArray(files)).toBe(true);
    });

    it('should return files for inline template definition', async () => {
      const inlineTemplate = {
        ...mockTemplate,
        definition: {
          ...mockTemplate.definition,
          files: {
            source_type: 'inline',
            inline_files: {
              'package.json': '{"name": "{{project_name}}"}',
              'README.md': '# {{project_name}}',
            },
          },
        },
      };

      const files = await service.fetchSourceFiles(inlineTemplate as any);

      expect(files).toBeDefined();
      expect(files.length).toBe(2);
      expect(files[0].path).toBe('package.json');
    });
  });

  // ==================== ProcessFiles Tests ====================
  describe('processFiles', () => {
    it('should process files with variable substitution', async () => {
      const sourceFiles = [
        { path: 'package.json', content: '{"name": "{{project_name}}"}' },
      ];

      const result = await service.processFiles(
        sourceFiles,
        { project_name: 'MyApp' },
        mockTemplate,
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('MyApp');
    });

    it('should skip binary files', async () => {
      mockTemplateEngine.shouldSkipFile.mockReturnValue(true);

      const sourceFiles = [
        { path: 'image.png', content: '\x00\x00\x00' },
      ];

      const result = await service.processFiles(sourceFiles, {}, mockTemplate);

      expect(result).toHaveLength(0);
    });
  });

  // ==================== GetJobStatus Tests ====================
  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const mockJob = {
        id: 'job-123',
        data: {},
        progress: 50,
        getState: jest.fn().mockResolvedValue('active'),
        timestamp: Date.now(),
        processedOn: null,
        finishedOn: null,
        failedReason: null,
        returnvalue: null,
      };

      mockQueue.getJob.mockResolvedValue(mockJob as any);

      const result = await service.getJobStatus('job-123');

      expect(result).not.toBeNull();
      expect(result?.status).toBe(ScaffoldJobStatus.PROCESSING);
      expect(result?.progress).toBe(50);
    });

    it('should return null for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.getJobStatus('non-existent');

      expect(result).toBeNull();
    });
  });

  // ==================== CancelJob Tests ====================
  describe('cancelJob', () => {
    it('should cancel job', async () => {
      const mockJob = {
        remove: jest.fn().mockResolvedValue(undefined),
      };

      mockQueue.getJob.mockResolvedValue(mockJob as any);

      const result = await service.cancelJob('job-123');

      expect(result).toBe(true);
    });

    it('should return false for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.cancelJob('non-existent');

      expect(result).toBe(false);
    });
  });

  // ==================== RenameFiles Tests ====================
  describe('renameFiles', () => {
    it('should rename files with variables in path', () => {
      const files = [
        { path: 'src/{{name}}.ts', content: '// code', size: 10 },
      ];

      const result = service.renameFiles(files, { name: 'user' });

      expect(result[0].path).toBe('src/user.ts');
    });
  });

  // ==================== ApplyVariableSubstitution Tests ====================
  describe('applyVariableSubstitution', () => {
    it('should substitute variables in content', () => {
      mockTemplateEngine.render.mockReturnValue('Hello World');

      const result = service.applyVariableSubstitution(
        'Hello {{name}}',
        { name: 'World' },
      );

      expect(result).toBe('Hello World');
    });
  });

  // ==================== GetTemplate Tests ====================
  describe('getTemplate', () => {
    it('should return template by ID', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate('template-123');

      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException for missing template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.getTemplate('non-existent')).rejects.toThrow();
    });
  });
});
