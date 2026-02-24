/**
 * AdminFeaturedTemplatesService Tests
 *
 * Story 19-8: Featured Templates Curation
 */
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Template, TemplateTestStatus } from '../../../database/entities/template.entity';
import { TemplateAuditService } from '../../templates/services/template-audit.service';
import { AdminFeaturedTemplatesService } from '../services/admin-featured-templates.service';
import { FEATURED_TEMPLATES_CONSTANTS } from '../../templates/dto/featured-template.dto';

describe('AdminFeaturedTemplatesService', () => {
  let service: AdminFeaturedTemplatesService;
  let mockTemplateRepo: any;
  let mockDataSource: any;
  let mockAuditService: any;

  const createMockTemplate = (overrides: Partial<Template> = {}): Template => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    workspaceId: null,
    name: 'nextjs-saas-starter',
    displayName: 'Next.js SaaS Starter',
    description: 'Full-stack SaaS template',
    longDescription: null,
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: { stack: {}, variables: [], files: { source_type: 'git' } },
    category: 'saas' as any,
    tags: ['nextjs', 'saas'],
    icon: 'layout-dashboard',
    screenshots: [],
    stackSummary: {},
    variables: [],
    sourceType: 'git' as any,
    sourceUrl: null,
    sourceBranch: 'main',
    isOfficial: true,
    isPublished: true,
    isActive: true,
    totalUses: 100,
    avgRating: 4.5,
    ratingCount: 50,
    isFeatured: false,
    featuredOrder: null,
    testStatus: TemplateTestStatus.UNKNOWN,
    lastTestRunAt: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Template);

  const mockTemplate = createMockTemplate();
  const mockFeaturedTemplate = createMockTemplate({
    id: '123e4567-e89b-12d3-a456-426614174001',
    name: 'featured-template',
    isFeatured: true,
    featuredOrder: 0,
    testStatus: TemplateTestStatus.PASSING,
    lastTestRunAt: new Date(),
  });

  const createMockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockFeaturedTemplate]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawOne: jest.fn().mockResolvedValue({ maxOrder: 2 }),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    const mockQueryBuilder = createMockQueryBuilder();

    mockTemplateRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => {
        const mockManager = {
          update: jest.fn().mockResolvedValue(undefined),
          save: jest.fn().mockImplementation(async (t: Template) => t),
          count: jest.fn().mockResolvedValue(3),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(mockManager);
      }),
    };

    mockAuditService = {
      logTemplateFeatured: jest.fn().mockResolvedValue({}),
      logTemplateUnfeatured: jest.fn().mockResolvedValue({}),
      logTemplatesReordered: jest.fn().mockResolvedValue({}),
      logEvent: jest.fn().mockResolvedValue({}),
    };

    service = new AdminFeaturedTemplatesService(
      mockTemplateRepo,
      mockDataSource,
      mockAuditService,
    );
  });

  describe('listFeatured', () => {
    it('should return list of featured templates', async () => {
      const result = await service.listFeatured();

      expect(result.templates).toBeDefined();
      expect(result.maxAllowed).toBe(FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES);
    });

    it('should filter by test status when provided', async () => {
      await service.listFeatured({ testStatus: TemplateTestStatus.PASSING });

      expect(mockTemplateRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getEligibleTemplates', () => {
    it('should return published templates that are not featured', async () => {
      const result = await service.getEligibleTemplates(50);

      expect(result).toBeDefined();
    });
  });

  describe('featureTemplate', () => {
    const adminId = 'admin-user-id';

    it('should feature a published template', async () => {
      const template = createMockTemplate();
      mockTemplateRepo.findOne.mockResolvedValue(template);

      const result = await service.featureTemplate(template.id, {}, adminId);

      expect(result.isFeatured).toBe(true);
      expect(mockAuditService.logTemplateFeatured).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.featureTemplate('non-existent', {}, adminId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for unpublished template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(createMockTemplate({ isPublished: false }));

      await expect(service.featureTemplate(mockTemplate.id, {}, adminId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for inactive template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(createMockTemplate({ isActive: false }));

      await expect(service.featureTemplate(mockTemplate.id, {}, adminId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException for already featured template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(createMockTemplate({ isFeatured: true }));

      await expect(service.featureTemplate(mockTemplate.id, {}, adminId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when max featured templates reached', async () => {
      const template = createMockTemplate();
      mockTemplateRepo.findOne.mockResolvedValue(template);

      // Override transaction to simulate max count
      mockDataSource.transaction = jest.fn((cb) => {
        const mockManager = {
          save: jest.fn(),
          count: jest.fn().mockResolvedValue(FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES),
          createQueryBuilder: jest.fn(),
        };
        return cb(mockManager);
      });

      await expect(service.featureTemplate(template.id, {}, adminId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use specified featured order when provided', async () => {
      const template = createMockTemplate();
      mockTemplateRepo.findOne.mockResolvedValue(template);

      const result = await service.featureTemplate(template.id, { featuredOrder: 2 }, adminId);

      expect(result.featuredOrder).toBe(2);
    });
  });

  describe('unfeatureTemplate', () => {
    const adminId = 'admin-user-id';

    it('should unfeature a featured template', async () => {
      const featuredTemplate = createMockTemplate({
        id: 'featured-id',
        name: 'featured-template',
        isFeatured: true,
        featuredOrder: 0,
      });
      mockTemplateRepo.findOne.mockResolvedValue(featuredTemplate);

      const result = await service.unfeatureTemplate(featuredTemplate.id, adminId);

      expect(result.isFeatured).toBe(false);
      expect(mockAuditService.logTemplateUnfeatured).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.unfeatureTemplate('non-existent', adminId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-featured template', async () => {
      const nonFeaturedTemplate = createMockTemplate({ isFeatured: false });
      mockTemplateRepo.findOne.mockResolvedValue(nonFeaturedTemplate);

      await expect(service.unfeatureTemplate(nonFeaturedTemplate.id, adminId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reorderFeaturedTemplates', () => {
    const adminId = 'admin-user-id';

    it('should reorder featured templates using templateIds array', async () => {
      const featuredTemplate1 = createMockTemplate({
        id: 'template-id-1',
        name: 'featured-template-1',
        isFeatured: true,
        featuredOrder: 0,
      });
      const featuredTemplate2 = createMockTemplate({
        id: 'template-id-2',
        name: 'featured-template-2',
        isFeatured: true,
        featuredOrder: 1,
      });
      const templateIds = [featuredTemplate1.id, featuredTemplate2.id];

      mockTemplateRepo.find.mockResolvedValue([featuredTemplate1, featuredTemplate2] as Template[]);

      const result = await service.reorderFeaturedTemplates({ templateIds }, adminId);

      expect(result.templates).toBeDefined();
      expect(mockAuditService.logTemplatesReordered).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing templates', async () => {
      const featuredTemplate = createMockTemplate({
        id: 'featured-id',
        isFeatured: true,
      });
      mockTemplateRepo.find.mockResolvedValue([featuredTemplate]);

      await expect(
        service.reorderFeaturedTemplates(
          { templateIds: [featuredTemplate.id, 'missing-id'] },
          adminId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-featured templates', async () => {
      const featuredTemplate = createMockTemplate({
        id: 'featured-id',
        isFeatured: true,
      });
      const nonFeaturedTemplate = createMockTemplate({
        id: 'non-featured-id',
        isFeatured: false,
      });
      mockTemplateRepo.find.mockResolvedValue([featuredTemplate, nonFeaturedTemplate]);

      await expect(
        service.reorderFeaturedTemplates(
          { templateIds: [featuredTemplate.id, nonFeaturedTemplate.id] },
          adminId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate orders', async () => {
      const featuredTemplate1 = createMockTemplate({
        id: 'template-id-1',
        isFeatured: true,
      });
      const featuredTemplate2 = createMockTemplate({
        id: 'template-id-2',
        isFeatured: true,
      });

      mockTemplateRepo.find.mockResolvedValue([featuredTemplate1, featuredTemplate2] as Template[]);

      await expect(
        service.reorderFeaturedTemplates(
          {
            templateIds: [],
            items: [
              { id: featuredTemplate1.id, featuredOrder: 0 },
              { id: featuredTemplate2.id, featuredOrder: 0 },
            ],
          },
          adminId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for out-of-range order', async () => {
      const featuredTemplate1 = createMockTemplate({
        id: 'template-id-1',
        isFeatured: true,
      });
      const featuredTemplate2 = createMockTemplate({
        id: 'template-id-2',
        isFeatured: true,
      });

      mockTemplateRepo.find.mockResolvedValue([featuredTemplate1, featuredTemplate2] as Template[]);

      await expect(
        service.reorderFeaturedTemplates(
          {
            templateIds: [],
            items: [
              { id: featuredTemplate1.id, featuredOrder: 0 },
              { id: featuredTemplate2.id, featuredOrder: 10 },
            ],
          },
          adminId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTestStatus', () => {
    it('should update test status to passing', async () => {
      const featuredTemplate = createMockTemplate({
        id: 'featured-id',
        isFeatured: true,
        testStatus: TemplateTestStatus.UNKNOWN,
      });
      mockTemplateRepo.findOne.mockResolvedValue(featuredTemplate);
      mockTemplateRepo.save.mockImplementation(async (t: Template) => t);

      await service.updateTestStatus(featuredTemplate.id, true);

      expect(mockTemplateRepo.save).toHaveBeenCalled();
    });

    it('should update test status to failing with error message', async () => {
      const featuredTemplate = createMockTemplate({
        id: 'featured-id',
        isFeatured: true,
        testStatus: TemplateTestStatus.UNKNOWN,
      });
      mockTemplateRepo.findOne.mockResolvedValue(featuredTemplate);
      mockTemplateRepo.save.mockImplementation(async (t: Template) => t);

      await service.updateTestStatus(featuredTemplate.id, false, 'Build failed');

      expect(mockTemplateRepo.save).toHaveBeenCalled();
    });

    it('should not update test status for non-featured template', async () => {
      const nonFeaturedTemplate = createMockTemplate({ isFeatured: false });
      mockTemplateRepo.findOne.mockResolvedValue(nonFeaturedTemplate);

      await service.updateTestStatus(nonFeaturedTemplate.id, true);

      expect(mockTemplateRepo.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent template', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.updateTestStatus('non-existent', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
