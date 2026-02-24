/**
 * AdminTemplateAnalyticsService Tests
 *
 * Story 19-9: Template Analytics
 *
 * TDD: Tests written first, service implemented to satisfy them.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminTemplateAnalyticsService } from '../services/admin-template-analytics.service';
import { TemplateAnalyticsEvent } from '../../../database/entities/template-analytics-event.entity';
import { Template } from '../../../database/entities/template.entity';
import { RedisService } from '../../redis/redis.service';

describe('AdminTemplateAnalyticsService', () => {
  let service: AdminTemplateAnalyticsService;
  let eventRepo: jest.Mocked<Partial<Repository<TemplateAnalyticsEvent>>>;
  let templateRepo: jest.Mocked<Partial<Repository<Template>>>;
  let redisService: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    const mockQB = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ totalViews: '0', totalInstallations: '0' }),
      getRawMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    };

    eventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQB),
    };

    templateRepo = {
      count: jest.fn().mockResolvedValue(50),
      createQueryBuilder: jest.fn().mockReturnValue(mockQB),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTemplateAnalyticsService,
        {
          provide: getRepositoryToken(TemplateAnalyticsEvent),
          useValue: eventRepo,
        },
        {
          provide: getRepositoryToken(Template),
          useValue: templateRepo,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<AdminTemplateAnalyticsService>(AdminTemplateAnalyticsService);
  });

  describe('getMarketplaceAnalytics', () => {
    it('should return marketplace-wide analytics', async () => {
      const result = await service.getMarketplaceAnalytics('30d', 10);

      expect(result).toHaveProperty('topByViews');
      expect(result).toHaveProperty('topByInstallations');
      expect(result).toHaveProperty('totalMarketplaceViews');
      expect(result).toHaveProperty('totalMarketplaceInstallations');
      expect(result).toHaveProperty('totalTemplates');
      expect(result).toHaveProperty('totalPublishedTemplates');
      expect(result).toHaveProperty('averageConversionRate');
      expect(result).toHaveProperty('categoryBreakdown');
      expect(result).toHaveProperty('trending');
      expect(result).toHaveProperty('featuredPerformance');
    });

    it('should return cached result if available', async () => {
      const cached = {
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
      };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getMarketplaceAnalytics('30d', 10);

      expect(result).toEqual(cached);
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should include category breakdown', async () => {
      const result = await service.getMarketplaceAnalytics('30d', 10);

      expect(result.categoryBreakdown).toBeDefined();
      expect(Array.isArray(result.categoryBreakdown)).toBe(true);
    });

    it('should include trending templates', async () => {
      const result = await service.getMarketplaceAnalytics('30d', 10);

      expect(result.trending).toBeDefined();
      expect(Array.isArray(result.trending)).toBe(true);
    });
  });
});
