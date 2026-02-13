import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from '../controllers/analytics.controller';
import { AnalyticsCalculationService } from '../services/analytics-calculation.service';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AnalyticsController (GET endpoints)', () => {
  let controller: AnalyticsController;
  let calculationService: jest.Mocked<AnalyticsCalculationService>;

  const mockFunnelMetrics = {
    period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
    totalUsersStarted: 100,
    totalUsersCompleted: 75,
    overallCompletionRate: 75,
    stepMetrics: [],
    tutorialMetrics: {
      startedCount: 50,
      completedCount: 40,
      skippedCount: 5,
      completionRate: 80,
      skipRate: 10,
      averageDurationSeconds: 180,
    },
    timingMetrics: {
      averageTotalTimeSeconds: 300,
      medianTotalTimeSeconds: 280,
      under60SecondsCount: 20,
      under60SecondsRate: 20,
      under10MinutesCount: 70,
      under10MinutesRate: 70,
    },
  };

  const mockUserAnalytics = {
    userId: 'user-123',
    onboardingStatus: 'completed' as const,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    completedAt: new Date('2026-01-01T10:05:00Z'),
    totalDurationSeconds: 300,
    stepsCompleted: [],
    tutorialEvents: [],
    achievements: ['completed_in_under_10_minutes'],
  };

  beforeEach(async () => {
    const mockCalculationService = {
      calculateFunnelMetrics: jest.fn(),
      calculateUserOnboardingMetrics: jest.fn(),
    };

    const mockEventsService = {
      logEvent: jest.fn(),
      getEventsByUser: jest.fn(),
      getEventsByType: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsCalculationService, useValue: mockCalculationService },
        { provide: AnalyticsEventsService, useValue: mockEventsService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    calculationService = module.get(AnalyticsCalculationService) as jest.Mocked<AnalyticsCalculationService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/analytics/onboarding/funnel', () => {
    it('should return funnel metrics for admin user', async () => {
      const req = {
        user: {
          userId: 'admin-123',
          role: 'admin',
        },
        query: {},
      };

      calculationService.calculateFunnelMetrics.mockResolvedValue(mockFunnelMetrics);

      const result = await controller.getFunnelMetrics(req);

      expect(result).toEqual(mockFunnelMetrics);
      expect(calculationService.calculateFunnelMetrics).toHaveBeenCalled();
    });

    it('should return funnel metrics for owner user', async () => {
      const req = {
        user: {
          userId: 'owner-123',
          role: 'owner',
        },
        query: {},
      };

      calculationService.calculateFunnelMetrics.mockResolvedValue(mockFunnelMetrics);

      const result = await controller.getFunnelMetrics(req);

      expect(result).toEqual(mockFunnelMetrics);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      const req = {
        user: {
          userId: 'user-123',
          role: 'user',
        },
        query: {},
      };

      await expect(controller.getFunnelMetrics(req)).rejects.toThrow(ForbiddenException);
    });

    it('should use default date range (30 days)', async () => {
      const req = {
        user: {
          userId: 'admin-123',
          role: 'admin',
        },
        query: {},
      };

      calculationService.calculateFunnelMetrics.mockResolvedValue(mockFunnelMetrics);

      await controller.getFunnelMetrics(req);

      const call = calculationService.calculateFunnelMetrics.mock.calls[0];
      const startDate = call[0] as Date;
      const endDate = call[1] as Date;

      expect(endDate.getTime() - startDate.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -5);
    });

    it('should use custom date range from query params', async () => {
      const startDate = '2026-01-01T00:00:00Z';
      const endDate = '2026-01-15T23:59:59Z';

      const req = {
        user: {
          userId: 'admin-123',
          role: 'admin',
        },
        query: {
          startDate,
          endDate,
        },
      };

      calculationService.calculateFunnelMetrics.mockResolvedValue(mockFunnelMetrics);

      await controller.getFunnelMetrics(req);

      expect(calculationService.calculateFunnelMetrics).toHaveBeenCalledWith(
        new Date(startDate),
        new Date(endDate),
        undefined,
      );
    });

    it('should filter by workspaceId when provided', async () => {
      const req = {
        user: {
          userId: 'admin-123',
          role: 'admin',
        },
        query: {
          workspaceId: 'workspace-456',
        },
      };

      calculationService.calculateFunnelMetrics.mockResolvedValue(mockFunnelMetrics);

      await controller.getFunnelMetrics(req);

      const call = calculationService.calculateFunnelMetrics.mock.calls[0];
      expect(call[2]).toBe('workspace-456');
    });
  });

  describe('GET /api/v1/analytics/onboarding/user/:userId', () => {
    it('should return analytics for own user', async () => {
      const req = {
        user: {
          userId: 'user-123',
          role: 'user',
        },
      };

      calculationService.calculateUserOnboardingMetrics.mockResolvedValue(mockUserAnalytics);

      const result = await controller.getUserAnalytics(req, 'user-123');

      expect(result).toEqual(mockUserAnalytics);
      expect(calculationService.calculateUserOnboardingMetrics).toHaveBeenCalledWith('user-123');
    });

    it('should allow admin to view any user analytics', async () => {
      const req = {
        user: {
          userId: 'admin-123',
          role: 'admin',
        },
      };

      calculationService.calculateUserOnboardingMetrics.mockResolvedValue(mockUserAnalytics);

      const result = await controller.getUserAnalytics(req, 'user-456');

      expect(result).toEqual(mockUserAnalytics);
      expect(calculationService.calculateUserOnboardingMetrics).toHaveBeenCalledWith('user-456');
    });

    it('should allow owner to view any user analytics', async () => {
      const req = {
        user: {
          userId: 'owner-123',
          role: 'owner',
        },
      };

      calculationService.calculateUserOnboardingMetrics.mockResolvedValue(mockUserAnalytics);

      const result = await controller.getUserAnalytics(req, 'user-456');

      expect(result).toEqual(mockUserAnalytics);
    });

    it('should throw ForbiddenException when user tries to access other user analytics', async () => {
      const req = {
        user: {
          userId: 'user-123',
          role: 'user',
        },
      };

      await expect(controller.getUserAnalytics(req, 'user-456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      const req = {
        user: {
          userId: 'user-123',
          role: 'user',
        },
      };

      calculationService.calculateUserOnboardingMetrics.mockRejectedValue(
        new NotFoundException('User has not started onboarding'),
      );

      await expect(controller.getUserAnalytics(req, 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
