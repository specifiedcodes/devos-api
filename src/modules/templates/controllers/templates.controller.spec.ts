/**
 * TemplatesController Tests
 *
 * Story 19-1: Template Registry Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from '../services/templates.service';
import { TemplateRegistryService } from '../services/template-registry.service';
import { TemplateScaffoldingService } from '../services/template-scaffolding.service';
import { TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { TemplateListResult } from '../interfaces/template.interfaces';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let templatesService: jest.Mocked<TemplatesService>;
  let registryService: jest.Mocked<TemplateRegistryService>;

  const mockTemplate = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    workspaceId: null,
    name: 'nextjs-saas-starter',
    displayName: 'Next.js SaaS Starter',
    description: 'A full-stack SaaS template',
    longDescription: null,
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: {
      stack: { frontend: 'Next.js', backend: 'NestJS', database: 'PostgreSQL' },
      variables: [],
      files: { source_type: 'git', repository: 'https://github.com/example/template' },
    },
    category: TemplateCategory.SAAS,
    tags: ['saas', 'nextjs'],
    icon: 'rocket',
    screenshots: [],
    stackSummary: { frontend: 'Next.js', backend: 'NestJS', database: 'PostgreSQL' },
    variables: [],
    sourceType: TemplateSourceType.GIT,
    sourceUrl: 'https://github.com/example/template',
    sourceBranch: 'main',
    isOfficial: true,
    isPublished: true,
    isActive: true,
    totalUses: 100,
    avgRating: 4.5,
    ratingCount: 20,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isFeatured: false,
    featuredOrder: null,
    testStatus: 'unknown',
    lastTestRunAt: null,
  };

  const mockLegacyTemplate = {
    id: 'nextjs-saas-starter',
    name: 'Next.js SaaS Starter',
    description: 'A full-stack SaaS template',
    category: TemplateCategory.SAAS,
    techStack: {
      framework: 'Next.js 15',
      language: 'TypeScript',
      styling: 'Tailwind CSS',
      database: 'PostgreSQL',
      orm: 'Prisma',
      apiLayer: 'tRPC',
      testing: ['Jest'],
      additional: [],
    },
    defaultPreferences: {
      repoStructure: 'polyrepo' as const,
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest',
    },
    icon: 'rocket',
    recommended: true,
    tags: ['saas', 'nextjs'],
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      workspaceId: 'workspace-123',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: {
            getAllTemplates: jest.fn(),
            getTemplateById: jest.fn(),
            getTemplatesByCategory: jest.fn(),
            getRecommendedTemplate: jest.fn(),
          },
        },
        {
          provide: TemplateRegistryService,
          useValue: {
            list: jest.fn(),
            findById: jest.fn(),
            findByName: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            publish: jest.fn(),
            unpublish: jest.fn(),
            incrementUsage: jest.fn(),
            findByCategory: jest.fn(),
            search: jest.fn(),
            getFeatured: jest.fn(),
            getTrending: jest.fn(),
            getCategories: jest.fn(),
            getOfficialTemplates: jest.fn(),
          },
        },
        {
          provide: TemplateScaffoldingService,
          useValue: {
            scaffold: jest.fn(),
            validateVariables: jest.fn(),
            getJobStatus: jest.fn(),
            cancelJob: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    templatesService = module.get(TemplatesService);
    registryService = module.get(TemplateRegistryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listTemplates', () => {
    it('should return paginated template list', async () => {
      const mockResult: TemplateListResult<any> = {
        items: [mockTemplate as any],
        total: 1,
        page: 1,
        limit: 20,
      };
      registryService.list.mockResolvedValue(mockResult);

      const result = await controller.listTemplates({}, mockRequest as any);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should pass workspace context for authenticated users', async () => {
      registryService.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.listTemplates({}, mockRequest as any);

      expect(registryService.list).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'workspace-123' }),
      );
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts', async () => {
      registryService.getCategories.mockResolvedValue([
        { category: 'web-app', count: 5 },
        { category: 'api', count: 3 },
      ]);

      const result = await controller.getCategories();

      expect(result.categories).toHaveLength(2);
    });
  });

  describe('getFeatured', () => {
    it('should return featured templates', async () => {
      registryService.getFeatured.mockResolvedValue([mockTemplate as any]);

      const result = await controller.getFeatured('5');

      expect(registryService.getFeatured).toHaveBeenCalledWith(5);
      expect(result).toHaveLength(1);
    });

    it('should use default limit if not specified', async () => {
      registryService.getFeatured.mockResolvedValue([]);

      await controller.getFeatured();

      expect(registryService.getFeatured).toHaveBeenCalledWith(10);
    });
  });

  describe('getTrending', () => {
    it('should return trending templates', async () => {
      registryService.getTrending.mockResolvedValue([mockTemplate as any]);

      const result = await controller.getTrending('10');

      expect(registryService.getTrending).toHaveBeenCalledWith(10);
    });
  });

  describe('getTemplateById', () => {
    it('should return database template for valid UUID', async () => {
      registryService.findById.mockResolvedValue(mockTemplate as any);

      const result = await controller.getTemplateById(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(registryService.findById).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should fallback to legacy service for non-UUID ids', async () => {
      templatesService.getTemplateById.mockResolvedValue(mockLegacyTemplate as any);

      const result = await controller.getTemplateById('nextjs-saas-starter', mockRequest as any);

      expect(templatesService.getTemplateById).toHaveBeenCalledWith('nextjs-saas-starter');
    });
  });

  describe('createTemplate', () => {
    const createDto = {
      name: 'new-template',
      displayName: 'New Template',
      description: 'Description',
      definition: {
        stack: { frontend: 'Next.js' },
        variables: [],
        files: { source_type: TemplateSourceType.GIT },
      },
      category: TemplateCategory.WEB_APP,
    };

    it('should create template with workspace context', async () => {
      registryService.create.mockResolvedValue(mockTemplate as any);

      const result = await controller.createTemplate(createDto, mockRequest as any);

      expect(registryService.create).toHaveBeenCalledWith(
        'workspace-123',
        createDto,
        'user-123',
      );
    });

    it('should use null workspaceId if not in request', async () => {
      registryService.create.mockResolvedValue(mockTemplate as any);

      const requestWithoutWorkspace = { user: { id: 'user-123', email: 'test@example.com' } };
      await controller.createTemplate(createDto, requestWithoutWorkspace as any);

      expect(registryService.create).toHaveBeenCalledWith(
        null,
        createDto,
        'user-123',
      );
    });
  });

  describe('updateTemplate', () => {
    it('should update template with user context', async () => {
      registryService.update.mockResolvedValue(mockTemplate as any);

      const result = await controller.updateTemplate(
        '123e4567-e89b-12d3-a456-426614174000',
        { displayName: 'Updated' },
        mockRequest as any,
      );

      expect(registryService.update).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        { displayName: 'Updated' },
        'user-123',
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template with user context', async () => {
      registryService.delete.mockResolvedValue(undefined);

      await controller.deleteTemplate(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(registryService.delete).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'user-123',
      );
    });
  });

  describe('publishTemplate', () => {
    it('should publish template', async () => {
      registryService.publish.mockResolvedValue({ ...mockTemplate, isPublished: true } as any);

      const result = await controller.publishTemplate(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(registryService.publish).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'user-123',
      );
    });
  });

  describe('unpublishTemplate', () => {
    it('should unpublish template', async () => {
      registryService.unpublish.mockResolvedValue({ ...mockTemplate, isPublished: false } as any);

      const result = await controller.unpublishTemplate(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(registryService.unpublish).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'user-123',
      );
    });
  });

  describe('recordUsage', () => {
    it('should increment usage counter', async () => {
      await controller.recordUsage(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(registryService.incrementUsage).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'workspace-123',
      );
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return database templates first', async () => {
      registryService.findByCategory.mockResolvedValue([mockTemplate as any]);

      const result = await controller.getTemplatesByCategory(TemplateCategory.SAAS);

      expect(registryService.findByCategory).toHaveBeenCalledWith(TemplateCategory.SAAS);
    });

    it('should fallback to legacy service if no database templates', async () => {
      registryService.findByCategory.mockResolvedValue([]);
      templatesService.getTemplatesByCategory.mockResolvedValue([mockLegacyTemplate as any]);

      const result = await controller.getTemplatesByCategory(TemplateCategory.SAAS);

      expect(templatesService.getTemplatesByCategory).toHaveBeenCalledWith(TemplateCategory.SAAS);
    });
  });

  describe('toResponseDto', () => {
    it('should map all template fields correctly', async () => {
      registryService.findById.mockResolvedValue(mockTemplate as any);

      const result = await controller.getTemplateById(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(result.id).toBe(mockTemplate.id);
      expect(result.name).toBe(mockTemplate.name);
      expect(result.displayName).toBe(mockTemplate.displayName);
      expect(result.category).toBe(mockTemplate.category);
      expect(result.tags).toEqual(mockTemplate.tags);
      expect(result.isOfficial).toBe(mockTemplate.isOfficial);
      expect(result.totalUses).toBe(mockTemplate.totalUses);
    });

    it('should include legacy techStack for backward compatibility', async () => {
      registryService.findById.mockResolvedValue(mockTemplate as any);

      const result = await controller.getTemplateById(
        '123e4567-e89b-12d3-a456-426614174000',
        mockRequest as any,
      );

      expect(result.techStack).toBeDefined();
      expect(result.defaultPreferences).toBeDefined();
    });
  });
});
