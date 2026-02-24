/**
 * AdminFeaturedTemplatesController Tests
 *
 * Story 19-8: Featured Templates Curation
 */
import { AdminFeaturedTemplatesController } from '../controllers/admin-featured-templates.controller';
import { AdminFeaturedTemplatesService } from '../services/admin-featured-templates.service';
import { TemplateTestStatus } from '../../../database/entities/template.entity';
import { FEATURED_TEMPLATES_CONSTANTS } from '../../templates/dto/featured-template.dto';
import { UnauthorizedException } from '@nestjs/common';

describe('AdminFeaturedTemplatesController', () => {
  let controller: AdminFeaturedTemplatesController;
  let mockService: any;

  const mockFeaturedTemplate = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'nextjs-saas-starter',
    displayName: 'Next.js SaaS Starter',
    description: 'Full-stack SaaS template',
    icon: 'layout-dashboard',
    isOfficial: true,
    isFeatured: true,
    featuredOrder: 0,
    testStatus: TemplateTestStatus.PASSING,
    lastTestRunAt: new Date().toISOString(),
    totalUses: 100,
    avgRating: 4.5,
    ratingCount: 50,
    category: 'saas',
    tags: ['nextjs', 'saas'],
    screenshots: [],
    stackSummary: {},
  };

  const mockRequest = {
    user: {
      id: 'admin-user-id',
      userId: 'admin-user-id',
    },
  };

  beforeEach(() => {
    mockService = {
      listFeatured: jest.fn(),
      getEligibleTemplates: jest.fn(),
      featureTemplate: jest.fn(),
      unfeatureTemplate: jest.fn(),
      reorderFeaturedTemplates: jest.fn(),
      updateTestStatus: jest.fn(),
    };

    controller = new AdminFeaturedTemplatesController(mockService);
  });

  describe('listFeatured', () => {
    it('should return list of featured templates', async () => {
      const mockResponse = {
        templates: [mockFeaturedTemplate],
        total: 1,
        maxAllowed: FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES,
      };
      mockService.listFeatured.mockResolvedValue(mockResponse);

      const result = await controller.listFeatured({});

      expect(result).toEqual(mockResponse);
      expect(mockService.listFeatured).toHaveBeenCalledWith({});
    });

    it('should pass query parameters to service', async () => {
      const mockResponse = {
        templates: [],
        total: 0,
        maxAllowed: FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES,
      };
      mockService.listFeatured.mockResolvedValue(mockResponse);

      await controller.listFeatured({ testStatus: TemplateTestStatus.PASSING, includeTestStatus: true });

      expect(mockService.listFeatured).toHaveBeenCalledWith({
        testStatus: TemplateTestStatus.PASSING,
        includeTestStatus: true,
      });
    });
  });

  describe('getEligibleTemplates', () => {
    it('should return eligible templates with default limit', async () => {
      const mockTemplates = [{ ...mockFeaturedTemplate, isFeatured: false }];
      mockService.getEligibleTemplates.mockResolvedValue(mockTemplates);

      const result = await controller.getEligibleTemplates();

      expect(result).toEqual(mockTemplates);
      expect(mockService.getEligibleTemplates).toHaveBeenCalledWith(50);
    });

    it('should use provided limit', async () => {
      mockService.getEligibleTemplates.mockResolvedValue([]);

      await controller.getEligibleTemplates('20');

      expect(mockService.getEligibleTemplates).toHaveBeenCalledWith(20);
    });
  });

  describe('featureTemplate', () => {
    it('should feature a template', async () => {
      mockService.featureTemplate.mockResolvedValue(mockFeaturedTemplate);

      const result = await controller.featureTemplate(
        mockFeaturedTemplate.id,
        { featuredOrder: 0 },
        mockRequest,
      );

      expect(result).toEqual(mockFeaturedTemplate);
      expect(mockService.featureTemplate).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        { featuredOrder: 0 },
        'admin-user-id',
      );
    });

    it('should feature a template without specified order', async () => {
      mockService.featureTemplate.mockResolvedValue(mockFeaturedTemplate);

      const result = await controller.featureTemplate(
        mockFeaturedTemplate.id,
        {},
        mockRequest,
      );

      expect(result).toEqual(mockFeaturedTemplate);
      expect(mockService.featureTemplate).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        {},
        'admin-user-id',
      );
    });

    it('should use userId fallback from request.user.id', async () => {
      const requestWithOnlyId = {
        user: {
          id: 'fallback-admin-id',
        },
      };
      mockService.featureTemplate.mockResolvedValue(mockFeaturedTemplate);

      await controller.featureTemplate(mockFeaturedTemplate.id, {}, requestWithOnlyId);

      expect(mockService.featureTemplate).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        {},
        'fallback-admin-id',
      );
    });

    it('should throw UnauthorizedException when no admin ID in request', async () => {
      const requestWithoutUser = { user: {} };

      await expect(
        controller.featureTemplate(mockFeaturedTemplate.id, {}, requestWithoutUser),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('unfeatureTemplate', () => {
    it('should unfeature a template', async () => {
      const unfeaturedTemplate = { ...mockFeaturedTemplate, isFeatured: false, featuredOrder: null };
      mockService.unfeatureTemplate.mockResolvedValue(unfeaturedTemplate);

      const result = await controller.unfeatureTemplate(mockFeaturedTemplate.id, mockRequest);

      expect(result).toEqual(unfeaturedTemplate);
      expect(mockService.unfeatureTemplate).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        'admin-user-id',
      );
    });

    it('should throw UnauthorizedException when no admin ID in request', async () => {
      const requestWithoutUser = { user: {} };

      await expect(
        controller.unfeatureTemplate(mockFeaturedTemplate.id, requestWithoutUser),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('reorderTemplates', () => {
    it('should reorder templates using templateIds array', async () => {
      const mockResponse = {
        templates: [mockFeaturedTemplate],
        total: 1,
        maxAllowed: FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES,
      };
      mockService.reorderFeaturedTemplates.mockResolvedValue(mockResponse);

      const result = await controller.reorderTemplates(
        { templateIds: [mockFeaturedTemplate.id, 'template-id-2'] },
        mockRequest,
      );

      expect(result).toEqual(mockResponse);
      expect(mockService.reorderFeaturedTemplates).toHaveBeenCalledWith(
        { templateIds: [mockFeaturedTemplate.id, 'template-id-2'] },
        'admin-user-id',
      );
    });

    it('should reorder templates using items array', async () => {
      const mockResponse = {
        templates: [mockFeaturedTemplate],
        total: 1,
        maxAllowed: FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES,
      };
      mockService.reorderFeaturedTemplates.mockResolvedValue(mockResponse);

      const items = [
        { id: mockFeaturedTemplate.id, featuredOrder: 0 },
        { id: 'template-id-2', featuredOrder: 1 },
      ];

      const result = await controller.reorderTemplates({ templateIds: [], items }, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockService.reorderFeaturedTemplates).toHaveBeenCalledWith(
        { templateIds: [], items },
        'admin-user-id',
      );
    });
  });

  describe('updateTestStatus', () => {
    it('should update test status to passing', async () => {
      mockService.updateTestStatus.mockResolvedValue(undefined);

      await controller.updateTestStatus(mockFeaturedTemplate.id, { passing: true }, mockRequest);

      expect(mockService.updateTestStatus).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        true,
        undefined,
        'admin-user-id',
      );
    });

    it('should update test status to failing with error message', async () => {
      mockService.updateTestStatus.mockResolvedValue(undefined);

      await controller.updateTestStatus(mockFeaturedTemplate.id, {
        passing: false,
        errorMessage: 'Build failed',
      }, mockRequest);

      expect(mockService.updateTestStatus).toHaveBeenCalledWith(
        mockFeaturedTemplate.id,
        false,
        'Build failed',
        'admin-user-id',
      );
    });
  });
});
