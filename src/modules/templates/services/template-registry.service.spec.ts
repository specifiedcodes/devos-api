/**
 * TemplateRegistryService Tests
 *
 * Story 19-1: Template Registry Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TemplateRegistryService } from './template-registry.service';
import { TemplateAuditService } from './template-audit.service';
import { TemplateValidatorService } from './template-validator.service';
import { Template, TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { TemplateAuditEventType } from '../../../database/entities/template-audit-event.entity';

describe('TemplateRegistryService', () => {
  let service: TemplateRegistryService;
  let templateRepo: jest.Mocked<Repository<Template>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let auditService: jest.Mocked<TemplateAuditService>;
  let validatorService: jest.Mocked<TemplateValidatorService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockTemplateId = '33333333-3333-3333-3333-333333333333';

  const mockMember: Partial<WorkspaceMember> = {
    workspaceId: mockWorkspaceId,
    userId: mockActorId,
    role: WorkspaceRole.DEVELOPER,
  };

  const validCreateDto: CreateTemplateDto = {
    name: 'test-template',
    displayName: 'Test Template',
    description: 'A test template',
    definition: {
      stack: { frontend: 'Next.js', backend: 'NestJS' },
      variables: [],
      files: { source_type: TemplateSourceType.GIT, repository: 'https://github.com/test/template' },
    },
    category: TemplateCategory.WEB_APP,
    tags: ['test', 'template'],
  };

  const mockTemplate: Partial<Template> = {
    id: mockTemplateId,
    workspaceId: mockWorkspaceId,
    name: 'test-template',
    displayName: 'Test Template',
    description: 'A test template',
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: validCreateDto.definition as any,
    category: TemplateCategory.WEB_APP,
    tags: ['test', 'template'],
    icon: 'layout-dashboard',
    screenshots: [],
    stackSummary: {},
    variables: [],
    sourceType: TemplateSourceType.GIT,
    sourceUrl: null,
    sourceBranch: 'main',
    isOfficial: false,
    isPublished: false,
    isActive: true,
    totalUses: 0,
    avgRating: 0,
    ratingCount: 0,
    createdBy: mockActorId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Create a function to get fresh mock query builder
  const createMockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockTemplate], 1]),
    getOne: jest.fn().mockResolvedValue(null), // Default to null for findByName checks
    getMany: jest.fn().mockResolvedValue([mockTemplate]),
    getRawMany: jest.fn().mockResolvedValue([{ category: 'web-app', count: '5' }]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  });

  let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>;

  beforeEach(async () => {
    mockQueryBuilder = createMockQueryBuilder();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateRegistryService,
        {
          provide: getRepositoryToken(Template),
          useValue: {
            count: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: TemplateAuditService,
          useValue: {
            logEvent: jest.fn(),
            logTemplateCreated: jest.fn(),
            logTemplateUpdated: jest.fn(),
            logTemplateDeleted: jest.fn(),
            logTemplatePublished: jest.fn(),
            logTemplateUnpublished: jest.fn(),
            logTemplateUsed: jest.fn(),
            logTemplateRatingUpdated: jest.fn(),
          },
        },
        {
          provide: TemplateValidatorService,
          useValue: {
            validateDefinition: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
          },
        },
      ],
    }).compile();

    service = module.get<TemplateRegistryService>(TemplateRegistryService);
    templateRepo = module.get(getRepositoryToken(Template));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    auditService = module.get(TemplateAuditService);
    validatorService = module.get(TemplateValidatorService);
  });

  describe('create', () => {
    beforeEach(() => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      templateRepo.count.mockResolvedValue(0);
      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockReturnValue(mockTemplate as Template);
      templateRepo.save.mockResolvedValue(mockTemplate as Template);
    });

    it('should create a template with valid data', async () => {
      const result = await service.create(mockWorkspaceId, validCreateDto, mockActorId);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-template');
      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('should validate definition against JSON Schema', async () => {
      await service.create(mockWorkspaceId, validCreateDto, mockActorId);

      expect(validatorService.validateDefinition).toHaveBeenCalledWith(validCreateDto.definition);
    });

    it('should reject invalid definitions', async () => {
      validatorService.validateDefinition.mockReturnValue({
        valid: false,
        errors: [{ path: '/stack', message: 'Missing required field', keyword: 'required' }],
        warnings: [],
      });

      await expect(
        service.create(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate names within workspace', async () => {
      // findByName uses createQueryBuilder, set getOne to return existing template
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockTemplate as Template);

      await expect(
        service.create(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ConflictException);
    });

    it('should enforce MAX_DEFINITIONS_PER_WORKSPACE limit', async () => {
      templateRepo.count.mockResolvedValue(100);

      await expect(
        service.create(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-member users', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject viewer role', async () => {
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        role: WorkspaceRole.VIEWER,
      } as WorkspaceMember);

      await expect(
        service.create(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should sanitize tags', async () => {
      const dtoWithTags = {
        ...validCreateDto,
        tags: ['  TEST  ', 'Template', ' test '],
      };

      await service.create(mockWorkspaceId, dtoWithTags, mockActorId);

      expect(templateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['test', 'template'],
        }),
      );
    });

    it('should log audit event on success', async () => {
      await service.create(mockWorkspaceId, validCreateDto, mockActorId);

      expect(auditService.logTemplateCreated).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockTemplateId,
        mockActorId,
        expect.any(Object),
      );
    });
  });

  describe('findById', () => {
    it('should return template for valid id', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as Template);

      const result = await service.findById(mockTemplateId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockTemplateId);
    });

    it('should return null for non-existing id', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existing-id');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as Template);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      templateRepo.save.mockResolvedValue(mockTemplate as Template);
    });

    it('should update specified fields only', async () => {
      const result = await service.update(
        mockTemplateId,
        { displayName: 'Updated Name' },
        mockActorId,
      );

      expect(result).toBeDefined();
      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('should re-validate definition if changed', async () => {
      const newDef = {
        stack: { frontend: 'Updated' },
        variables: [],
        files: { source_type: 'git' },
      };

      await service.update(
        mockTemplateId,
        { definition: newDef as any },
        mockActorId,
      );

      expect(validatorService.validateDefinition).toHaveBeenCalledWith(newDef);
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);

      await expect(
        service.update(mockTemplateId, { displayName: 'test' }, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow creator to update own templates', async () => {
      const result = await service.update(
        mockTemplateId,
        { displayName: 'Updated' },
        mockActorId,
      );

      expect(result).toBeDefined();
    });

    it('should allow admin to update any template', async () => {
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      const result = await service.update(
        mockTemplateId,
        { displayName: 'Updated' },
        'other-user-id',
      );

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for missing template', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(mockTemplateId, { displayName: 'test' }, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as Template);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      templateRepo.remove.mockResolvedValue(mockTemplate as Template);
    });

    it('should remove template from database', async () => {
      await service.delete(mockTemplateId, mockActorId);

      expect(templateRepo.remove).toHaveBeenCalled();
    });

    it('should log audit event with snapshot', async () => {
      await service.delete(mockTemplateId, mockActorId);

      expect(auditService.logTemplateDeleted).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockTemplateId,
        mockActorId,
        expect.objectContaining({ name: 'test-template' }),
      );
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);

      await expect(
        service.delete(mockTemplateId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('publish', () => {
    beforeEach(() => {
      // Need to mock findOne for findById to work
      templateRepo.findOne.mockResolvedValue({ ...mockTemplate, isPublished: false } as Template);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      templateRepo.save.mockImplementation(async (template: any) => {
        return { ...template, isPublished: true } as Template;
      });
      auditService.logTemplatePublished.mockResolvedValue(null);
    });

    it('should set isPublished to true', async () => {
      const result = await service.publish(mockTemplateId, mockActorId);

      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('should log publish event', async () => {
      await service.publish(mockTemplateId, mockActorId);

      expect(auditService.logTemplatePublished).toHaveBeenCalled();
    });

    it('should return unchanged if already published', async () => {
      templateRepo.findOne.mockResolvedValue({ ...mockTemplate, isPublished: true } as Template);

      await service.publish(mockTemplateId, mockActorId);

      expect(templateRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    beforeEach(() => {
      templateRepo.findOne.mockResolvedValue({ ...mockTemplate, isPublished: true } as Template);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      templateRepo.save.mockResolvedValue(mockTemplate as Template);
    });

    it('should set isPublished to false', async () => {
      const result = await service.unpublish(mockTemplateId, mockActorId);

      expect(templateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: false }),
      );
    });
  });

  describe('incrementUsage', () => {
    it('should increment total_uses counter', async () => {
      await service.incrementUsage(mockTemplateId, mockWorkspaceId);

      expect(auditService.logTemplateUsed).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockTemplateId,
        undefined,
      );
    });
  });

  describe('updateRating', () => {
    it('should calculate and update average rating', async () => {
      templateRepo.findOne.mockResolvedValue({ ...mockTemplate, avgRating: 4.0, ratingCount: 5 } as Template);

      await service.updateRating(mockTemplateId, 5);

      expect(templateRepo.update).toHaveBeenCalled();
      expect(auditService.logTemplateRatingUpdated).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should return paginated results', async () => {
      const result = await service.list({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply category filter', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      await service.list({ category: TemplateCategory.WEB_APP });

      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('should apply search filter with ILIKE escaping', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      await service.list({ search: 'test%_value' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        { search: '%test\\%\\_value%' },
      );
    });

    it('should apply tag filter', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      await service.list({ tag: 'typescript' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('@>'),
        { tag: ['typescript'] },
      );
    });

    it('should apply sorting', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      await service.list({ sortBy: 'name', sortOrder: 'ASC' });

      expect(mockQb.orderBy).toHaveBeenCalledWith('template.name', 'ASC');
    });
  });

  describe('findByCategory', () => {
    it('should return templates for valid category', async () => {
      templateRepo.find.mockResolvedValue([mockTemplate as Template]);

      const result = await service.findByCategory(TemplateCategory.WEB_APP);

      expect(result).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should return matching templates', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      const result = await service.search('test', 10);

      expect(mockQb.where).toHaveBeenCalled();
      expect(mockQb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('getFeatured', () => {
    it('should return featured templates first when available', async () => {
      // Create separate mock query builders for each call
      const featuredQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...mockTemplate, isFeatured: true, featuredOrder: 0 },
          { ...mockTemplate, isFeatured: true, featuredOrder: 1 },
        ]),
      };

      templateRepo.createQueryBuilder = jest.fn().mockReturnValue(featuredQb);

      const result = await service.getFeatured(5);

      expect(featuredQb.where).toHaveBeenCalledWith('template.isActive = true');
      expect(featuredQb.andWhere).toHaveBeenCalledWith('template.isPublished = true');
      expect(featuredQb.andWhere).toHaveBeenCalledWith('template.isFeatured = true');
      expect(featuredQb.orderBy).toHaveBeenCalledWith('template.featuredOrder', 'ASC');
    });

    it('should fill remaining slots with official templates when not enough featured', async () => {
      const featuredQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...mockTemplate, id: '1', isFeatured: true, featuredOrder: 0 },
        ]),
      };

      const additionalQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...mockTemplate, id: '2', isOfficial: true },
          { ...mockTemplate, id: '3', isOfficial: true },
        ]),
      };

      let callCount = 0;
      templateRepo.createQueryBuilder = jest.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? featuredQb : additionalQb;
      });

      const result = await service.getFeatured(5);

      // Should have both featured and additional templates
      expect(result).toHaveLength(3);
    });

    it('should return only featured templates when enough are featured', async () => {
      const featuredQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...mockTemplate, id: '1', isFeatured: true, featuredOrder: 0 },
          { ...mockTemplate, id: '2', isFeatured: true, featuredOrder: 1 },
          { ...mockTemplate, id: '3', isFeatured: true, featuredOrder: 2 },
        ]),
      };

      templateRepo.createQueryBuilder = jest.fn().mockReturnValue(featuredQb);

      const result = await service.getFeatured(3);

      expect(result).toHaveLength(3);
      // Should only call createQueryBuilder once since we have enough featured
      expect(templateRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrending', () => {
    it('should return templates sorted by usage', async () => {
      const mockQb = templateRepo.createQueryBuilder('template');
      const result = await service.getTrending(10);

      expect(mockQb.orderBy).toHaveBeenCalledWith('template.totalUses', 'DESC');
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts', async () => {
      // The mockQueryBuilder already has getRawMany configured
      const result = await service.getCategories();

      expect(result).toBeDefined();
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.addSelect).toHaveBeenCalled();
    });
  });

  describe('getOfficialTemplates', () => {
    it('should return only official templates', async () => {
      templateRepo.find.mockResolvedValue([{ ...mockTemplate, isOfficial: true } as Template]);

      const result = await service.getOfficialTemplates();

      expect(result).toHaveLength(1);
      expect(result[0].isOfficial).toBe(true);
    });
  });

  describe('sanitizeTags', () => {
    it('should trim, lowercase, and deduplicate tags', () => {
      const sanitizeTags = (service as any).sanitizeTags.bind(service);
      const result = sanitizeTags(['  TEST  ', 'Template', ' test ', 'ANOTHER']);

      expect(result).toEqual(['test', 'template', 'another']);
    });

    it('should limit to MAX_TAGS', () => {
      const sanitizeTags = (service as any).sanitizeTags.bind(service);
      const manyTags = Array(30).fill(0).map((_, i) => `tag${i}`);
      const result = sanitizeTags(manyTags);

      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should filter empty and too long tags', () => {
      const sanitizeTags = (service as any).sanitizeTags.bind(service);
      const longTag = 'a'.repeat(100);
      const result = sanitizeTags(['valid', '', '   ', longTag]);

      expect(result).toEqual(['valid']);
    });
  });
});
