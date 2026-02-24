/**
 * AdminTemplateAnalyticsController Tests
 *
 * Story 19-9: Template Analytics
 *
 * TDD: Tests written first, controller implemented to satisfy them.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminTemplateAnalyticsController } from '../controllers/admin-template-analytics.controller';
import { AdminTemplateAnalyticsService } from '../services/admin-template-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';

describe('AdminTemplateAnalyticsController', () => {
  let controller: AdminTemplateAnalyticsController;
  let service: jest.Mocked<Partial<AdminTemplateAnalyticsService>>;

  beforeEach(async () => {
    service = {
      getMarketplaceAnalytics: jest.fn().mockResolvedValue({
        topByViews: [],
        topByInstallations: [],
        totalMarketplaceViews: 500,
        totalMarketplaceInstallations: 100,
        totalTemplates: 50,
        totalPublishedTemplates: 30,
        averageConversionRate: 20,
        categoryBreakdown: [],
        trending: [],
        featuredPerformance: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTemplateAnalyticsController],
      providers: [
        {
          provide: AdminTemplateAnalyticsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminTemplateAnalyticsController>(AdminTemplateAnalyticsController);
  });

  describe('GET /api/admin/templates/analytics', () => {
    it('should return marketplace analytics', async () => {
      const result = await controller.getMarketplaceAnalytics({});

      expect(result).toHaveProperty('topByViews');
      expect(result).toHaveProperty('totalMarketplaceViews', 500);
      expect(result).toHaveProperty('totalTemplates', 50);
      expect(service.getMarketplaceAnalytics).toHaveBeenCalledWith('30d', 10);
    });

    it('should pass query params to service', async () => {
      await controller.getMarketplaceAnalytics({ period: '7d', limit: '5' });

      expect(service.getMarketplaceAnalytics).toHaveBeenCalledWith('7d', 5);
    });

    it('should default limit to 10', async () => {
      await controller.getMarketplaceAnalytics({ period: '90d' });

      expect(service.getMarketplaceAnalytics).toHaveBeenCalledWith('90d', 10);
    });

    it('should handle invalid limit gracefully', async () => {
      await controller.getMarketplaceAnalytics({ limit: 'invalid' });

      expect(service.getMarketplaceAnalytics).toHaveBeenCalledWith('30d', 10);
    });
  });
});
