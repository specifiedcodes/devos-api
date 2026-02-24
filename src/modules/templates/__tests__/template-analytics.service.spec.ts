/**
 * TemplateAnalyticsService Tests
 *
 * Story 19-9: Template Analytics
 *
 * TDD: Tests written first, service implemented to satisfy them.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import {
  TemplateAnalyticsEvent,
  TemplateAnalyticsEventType,
} from '../../../database/entities/template-analytics-event.entity';
import { Template } from '../../../database/entities/template.entity';
import { RedisService } from '../../redis/redis.service';

describe('TemplateAnalyticsService', () => {
  let service: TemplateAnalyticsService;
  let eventRepo: jest.Mocked<Partial<Repository<TemplateAnalyticsEvent>>>;
  let templateRepo: jest.Mocked<Partial<Repository<Template>>>;
  let redisService: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const mockTemplateId = '11111111-1111-1111-1111-111111111111';
  const mockWorkspaceId = '22222222-2222-2222-2222-222222222222';
  const mockUserId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    eventRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'evt-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'evt-1', ...data })),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    templateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateAnalyticsService,
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

    service = module.get<TemplateAnalyticsService>(TemplateAnalyticsService);
  });

  describe('trackEvent', () => {
    it('should create and save an analytics event', async () => {
      const result = await service.trackEvent({
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        eventType: TemplateAnalyticsEventType.VIEW,
        referrer: 'homepage',
        metadata: { source: 'carousel' },
      });

      expect(eventRepo.create).toHaveBeenCalledWith({
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        eventType: TemplateAnalyticsEventType.VIEW,
        referrer: 'homepage',
        metadata: { source: 'carousel' },
      });
      expect(eventRepo.save).toHaveBeenCalled();
      expect(result).toBe('evt-1');
    });

    it('should return null and not throw on error (fire-and-forget)', async () => {
      eventRepo.save = jest.fn().mockRejectedValue(new Error('DB error'));

      const result = await service.trackEvent({
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        eventType: TemplateAnalyticsEventType.VIEW,
      });

      expect(result).toBeNull();
    });

    it('should allow null userId for anonymous events', async () => {
      await service.trackEvent({
        templateId: mockTemplateId,
        workspaceId: mockWorkspaceId,
        userId: null,
        eventType: TemplateAnalyticsEventType.VIEW,
      });

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });
  });

  describe('getTemplateAnalytics', () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
    };

    beforeEach(() => {
      eventRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

      // Default: total counts
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalViews: '100',
        totalInstallations: '25',
        installStarted: '30',
        installCompleted: '25',
        installFailed: '5',
      });

      // Periodic counts
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(10);
    });

    it('should return analytics summary for a template', async () => {
      templateRepo.findOne = jest.fn().mockResolvedValue({
        id: mockTemplateId,
        avgRating: 4.5,
        ratingCount: 12,
      });

      const result = await service.getTemplateAnalytics(mockTemplateId);

      expect(result).toHaveProperty('totalViews');
      expect(result).toHaveProperty('totalInstallations');
      expect(result).toHaveProperty('conversionRate');
      expect(result).toHaveProperty('topReferrers');
      expect(result).toHaveProperty('installSuccessRate');
    });

    it('should return cached result if available', async () => {
      const cached = {
        totalViews: 50,
        totalInstallations: 10,
        conversionRate: 20,
        topReferrers: [],
        installSuccessRate: 100,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getTemplateAnalytics(mockTemplateId);
      expect(result).toEqual(cached);
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should cache the result in Redis', async () => {
      templateRepo.findOne = jest.fn().mockResolvedValue({
        id: mockTemplateId,
        avgRating: 4.5,
        ratingCount: 12,
      });

      await service.getTemplateAnalytics(mockTemplateId);

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('template-analytics:template:'),
        expect.any(String),
        300, // 5 minutes in seconds
      );
    });
  });

  describe('getCreatorAnalytics', () => {
    it('should return aggregated analytics for all templates owned by user', async () => {
      templateRepo.find = jest.fn().mockResolvedValue([
        {
          id: mockTemplateId,
          name: 'test-template',
          displayName: 'Test Template',
          createdBy: mockUserId,
        },
      ]);

      const mockQB = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            templateId: mockTemplateId,
            totalViews: '50',
            totalInstallations: '10',
          },
        ]),
        getRawOne: jest.fn().mockResolvedValue({ uniqueUsers: '25' }),
        getCount: jest.fn().mockResolvedValue(0),
      };

      eventRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQB);

      const result = await service.getCreatorAnalytics(mockUserId, '30d');

      expect(result).toHaveProperty('topTemplates');
      expect(result).toHaveProperty('viewsTrend');
      expect(result).toHaveProperty('installationsTrend');
      expect(result).toHaveProperty('totalReach');
      expect(result).toHaveProperty('totalViews');
      expect(result).toHaveProperty('totalInstallations');
    });

    it('should return empty analytics when user has no templates', async () => {
      templateRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.getCreatorAnalytics(mockUserId, '30d');

      expect(result.topTemplates).toEqual([]);
      expect(result.totalViews).toBe(0);
      expect(result.totalInstallations).toBe(0);
      expect(result.totalReach).toBe(0);
    });
  });

  describe('getExportData', () => {
    it('should return events within date range', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          templateId: mockTemplateId,
          eventType: TemplateAnalyticsEventType.VIEW,
          referrer: 'google',
          metadata: {},
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'evt-2',
          templateId: mockTemplateId,
          eventType: TemplateAnalyticsEventType.INSTALL_COMPLETED,
          referrer: null,
          metadata: {},
          createdAt: new Date('2026-01-16'),
        },
      ];

      eventRepo.find = jest.fn().mockResolvedValue(mockEvents);

      const result = await service.getExportData(
        mockTemplateId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toHaveLength(2);
      expect(eventRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            templateId: mockTemplateId,
          }),
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('should validate date range (max 365 days)', async () => {
      await expect(
        service.getExportData(
          mockTemplateId,
          new Date('2025-01-01'),
          new Date('2026-12-31'),
        ),
      ).rejects.toThrow();
    });
  });

  describe('parsePeriod', () => {
    it('should parse 7d period correctly', () => {
      const days = (service as any).parsePeriodDays('7d');
      expect(days).toBe(7);
    });

    it('should parse 30d period correctly', () => {
      const days = (service as any).parsePeriodDays('30d');
      expect(days).toBe(30);
    });

    it('should parse 90d period correctly', () => {
      const days = (service as any).parsePeriodDays('90d');
      expect(days).toBe(90);
    });

    it('should default to 30 for invalid period', () => {
      const days = (service as any).parsePeriodDays('invalid');
      expect(days).toBe(30);
    });
  });
});
