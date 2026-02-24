/**
 * TemplateAnalyticsController Tests
 *
 * Story 19-9: Template Analytics
 *
 * TDD: Tests written first, controller implemented to satisfy them.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TemplateAnalyticsController } from '../controllers/template-analytics.controller';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateRegistryService } from '../services/template-registry.service';

describe('TemplateAnalyticsController', () => {
  let controller: TemplateAnalyticsController;
  let analyticsService: jest.Mocked<Partial<TemplateAnalyticsService>>;
  let registryService: jest.Mocked<Partial<TemplateRegistryService>>;

  const mockTemplateId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '33333333-3333-3333-3333-333333333333';

  const mockReq = {
    user: {
      id: mockUserId,
      sub: mockUserId,
      email: 'user@test.com',
      workspaceId: '22222222-2222-2222-2222-222222222222',
    },
  } as any;

  beforeEach(async () => {
    analyticsService = {
      getTemplateAnalytics: jest.fn().mockResolvedValue({
        totalViews: 100,
        totalInstallations: 25,
        views7d: 10,
        views30d: 50,
        views90d: 80,
        installations7d: 3,
        installations30d: 15,
        installations90d: 22,
        avgRating: 4.5,
        ratingCount: 12,
        conversionRate: 25,
        topReferrers: [{ referrer: 'google', count: 15 }],
        installSuccessRate: 83.33,
      }),
      getCreatorAnalytics: jest.fn().mockResolvedValue({
        topTemplates: [],
        viewsTrend: [],
        installationsTrend: [],
        totalReach: 0,
        totalViews: 0,
        totalInstallations: 0,
      }),
      getExportData: jest.fn().mockResolvedValue([]),
      checkExportRateLimit: jest.fn().mockResolvedValue(undefined),
    };

    registryService = {
      findById: jest.fn().mockResolvedValue({
        id: mockTemplateId,
        createdBy: mockUserId,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateAnalyticsController],
      providers: [
        {
          provide: TemplateAnalyticsService,
          useValue: analyticsService,
        },
        {
          provide: TemplateRegistryService,
          useValue: registryService,
        },
      ],
    }).compile();

    controller = module.get<TemplateAnalyticsController>(TemplateAnalyticsController);
  });

  describe('GET /api/v1/templates/:id/analytics', () => {
    it('should return analytics summary for a template', async () => {
      const result = await controller.getTemplateAnalytics(mockTemplateId, {}, mockReq);

      expect(result).toHaveProperty('totalViews', 100);
      expect(result).toHaveProperty('totalInstallations', 25);
      expect(result).toHaveProperty('conversionRate', 25);
      expect(analyticsService.getTemplateAnalytics).toHaveBeenCalledWith(mockTemplateId);
    });

    it('should verify template exists and user has access', async () => {
      registryService.findById = jest.fn().mockResolvedValue(null);

      await expect(
        controller.getTemplateAnalytics(mockTemplateId, {}, mockReq),
      ).rejects.toThrow();
    });
  });

  describe('GET /api/v1/templates/my/analytics', () => {
    it('should return creator analytics for authenticated user', async () => {
      const result = await controller.getMyAnalytics({}, mockReq);

      expect(result).toHaveProperty('topTemplates');
      expect(result).toHaveProperty('viewsTrend');
      expect(result).toHaveProperty('totalReach');
      expect(analyticsService.getCreatorAnalytics).toHaveBeenCalledWith(
        mockUserId,
        undefined,
      );
    });

    it('should pass period query parameter', async () => {
      await controller.getMyAnalytics({ period: '7d' }, mockReq);

      expect(analyticsService.getCreatorAnalytics).toHaveBeenCalledWith(
        mockUserId,
        '7d',
      );
    });
  });

  describe('GET /api/v1/templates/:id/analytics/export', () => {
    it('should return export data as CSV-ready array', async () => {
      analyticsService.getExportData = jest.fn().mockResolvedValue([
        {
          id: 'evt-1',
          eventType: 'view',
          referrer: 'google',
          metadata: {},
          createdAt: new Date('2026-01-15'),
        },
      ]);

      const result = await controller.exportAnalytics(
        mockTemplateId,
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        mockReq,
      );

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('templateId', mockTemplateId);
      expect(analyticsService.getExportData).toHaveBeenCalled();
    });

    it('should require startDate and endDate', async () => {
      await expect(
        controller.exportAnalytics(
          mockTemplateId,
          { startDate: '', endDate: '' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid non-owner access', async () => {
      registryService.findById = jest.fn().mockResolvedValue({
        id: mockTemplateId,
        createdBy: 'other-user-id',
      });

      await expect(
        controller.exportAnalytics(
          mockTemplateId,
          { startDate: '2026-01-01', endDate: '2026-01-31' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
