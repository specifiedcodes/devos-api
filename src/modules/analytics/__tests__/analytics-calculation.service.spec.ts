import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsCalculationService } from '../services/analytics-calculation.service';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { NotFoundException } from '@nestjs/common';

describe('AnalyticsCalculationService', () => {
  let service: AnalyticsCalculationService;
  let eventsService: jest.Mocked<AnalyticsEventsService>;

  const mockUserId = 'user-123';
  const mockWorkspaceId = 'workspace-123';
  const baseDate = new Date('2026-01-01T00:00:00Z');

  beforeEach(async () => {
    const mockEventsService = {
      getEventsByType: jest.fn(),
      getEventsByUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsCalculationService,
        { provide: AnalyticsEventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<AnalyticsCalculationService>(AnalyticsCalculationService);
    eventsService = module.get(AnalyticsEventsService) as jest.Mocked<AnalyticsEventsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateFunnelMetrics', () => {
    it('should calculate funnel metrics with complete onboarding flow', async () => {
      const startDate = new Date('2026-01-01T00:00:00Z');
      const endDate = new Date('2026-01-31T23:59:59Z');

      // Mock events
      const onboardingStartedEvents: Partial<AnalyticsEvent>[] = [
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'onboarding_started', timestamp: new Date('2026-01-01T10:00:00Z'), eventData: {} },
        { userId: 'user-2', workspaceId: mockWorkspaceId, eventType: 'onboarding_started', timestamp: new Date('2026-01-02T10:00:00Z'), eventData: {} },
      ];

      const onboardingCompletedEvents: Partial<AnalyticsEvent>[] = [
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'onboarding_completed', timestamp: new Date('2026-01-01T10:05:00Z'), eventData: {} },
      ];

      const stepCompletedEvents: Partial<AnalyticsEvent>[] = [
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-01T10:00:10Z'), eventData: { stepName: 'github_connected', timeFromStart: 10000 } },
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-01T10:00:30Z'), eventData: { stepName: 'ai_key_added', timeFromStart: 30000 } },
        { userId: 'user-2', workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-02T10:00:15Z'), eventData: { stepName: 'github_connected', timeFromStart: 15000 } },
      ];

      const tutorialStartedEvents: Partial<AnalyticsEvent>[] = [
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'tutorial_started', timestamp: new Date('2026-01-01T10:01:00Z'), eventData: {} },
      ];

      const tutorialCompletedEvents: Partial<AnalyticsEvent>[] = [
        { userId: 'user-1', workspaceId: mockWorkspaceId, eventType: 'tutorial_completed', timestamp: new Date('2026-01-01T10:04:00Z'), eventData: {} },
      ];

      const tutorialSkippedEvents: Partial<AnalyticsEvent>[] = [];

      eventsService.getEventsByType
        .mockResolvedValueOnce(onboardingStartedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(onboardingCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(stepCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(stepCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(stepCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(stepCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(stepCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(tutorialStartedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(tutorialCompletedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(tutorialSkippedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(onboardingStartedEvents as AnalyticsEvent[])
        .mockResolvedValueOnce(onboardingCompletedEvents as AnalyticsEvent[]);

      const result = await service.calculateFunnelMetrics(startDate, endDate);

      expect(result.totalUsersStarted).toBe(2);
      expect(result.totalUsersCompleted).toBe(1);
      expect(result.overallCompletionRate).toBe(50);
      expect(result.stepMetrics).toHaveLength(5);
      expect(result.tutorialMetrics.completionRate).toBe(100);
    });

    it('should handle empty events gracefully', async () => {
      const startDate = new Date('2026-01-01T00:00:00Z');
      const endDate = new Date('2026-01-31T23:59:59Z');

      eventsService.getEventsByType.mockResolvedValue([]);

      const result = await service.calculateFunnelMetrics(startDate, endDate);

      expect(result.totalUsersStarted).toBe(0);
      expect(result.totalUsersCompleted).toBe(0);
      expect(result.overallCompletionRate).toBe(0);
      expect(result.timingMetrics.averageTotalTimeSeconds).toBe(0);
    });

    it('should filter by workspaceId when provided', async () => {
      const startDate = new Date('2026-01-01T00:00:00Z');
      const endDate = new Date('2026-01-31T23:59:59Z');
      const workspaceId = 'workspace-456';

      eventsService.getEventsByType.mockResolvedValue([]);

      await service.calculateFunnelMetrics(startDate, endDate, workspaceId);

      expect(eventsService.getEventsByType).toHaveBeenCalledWith(
        'onboarding_started',
        startDate,
        endDate,
        workspaceId,
      );
    });
  });

  describe('calculateUserOnboardingMetrics', () => {
    it('should calculate user-specific onboarding metrics', async () => {
      const events: Partial<AnalyticsEvent>[] = [
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_started', timestamp: new Date('2026-01-01T10:00:00Z'), eventData: {} },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-01T10:00:10Z'), eventData: { stepName: 'github_connected', timeFromStart: 10000 } },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-01T10:00:30Z'), eventData: { stepName: 'ai_key_added', timeFromStart: 30000 } },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_completed', timestamp: new Date('2026-01-01T10:05:00Z'), eventData: {} },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'tutorial_started', timestamp: new Date('2026-01-01T10:01:00Z'), eventData: {} },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'tutorial_completed', timestamp: new Date('2026-01-01T10:04:00Z'), eventData: {} },
      ];

      eventsService.getEventsByUser.mockResolvedValue(events as AnalyticsEvent[]);

      const result = await service.calculateUserOnboardingMetrics(mockUserId);

      expect(result.userId).toBe(mockUserId);
      expect(result.onboardingStatus).toBe('completed');
      expect(result.totalDurationSeconds).toBe(300); // 5 minutes
      expect(result.stepsCompleted).toHaveLength(2);
      expect(result.tutorialEvents).toHaveLength(2);
      expect(result.achievements).toContain('completed_in_under_10_minutes');
      expect(result.achievements).toContain('tutorial_completed');
    });

    it('should handle in-progress onboarding', async () => {
      const events: Partial<AnalyticsEvent>[] = [
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_started', timestamp: new Date('2026-01-01T10:00:00Z'), eventData: {} },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_step_completed', timestamp: new Date('2026-01-01T10:00:10Z'), eventData: { stepName: 'github_connected', timeFromStart: 10000 } },
      ];

      eventsService.getEventsByUser.mockResolvedValue(events as AnalyticsEvent[]);

      const result = await service.calculateUserOnboardingMetrics(mockUserId);

      expect(result.onboardingStatus).toBe('in_progress');
      expect(result.completedAt).toBeNull();
      expect(result.totalDurationSeconds).toBeNull();
    });

    it('should throw NotFoundException when user has not started onboarding', async () => {
      eventsService.getEventsByUser.mockResolvedValue([]);

      await expect(service.calculateUserOnboardingMetrics(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should identify achievements correctly', async () => {
      const events: Partial<AnalyticsEvent>[] = [
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_started', timestamp: new Date('2026-01-01T10:00:00Z'), eventData: {} },
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'onboarding_completed', timestamp: new Date('2026-01-01T10:00:45Z'), eventData: {} }, // 45 seconds
        { userId: mockUserId, workspaceId: mockWorkspaceId, eventType: 'tutorial_completed', timestamp: new Date('2026-01-01T10:01:00Z'), eventData: {} },
      ];

      eventsService.getEventsByUser.mockResolvedValue(events as AnalyticsEvent[]);

      const result = await service.calculateUserOnboardingMetrics(mockUserId);

      expect(result.achievements).toContain('completed_in_under_10_minutes');
      expect(result.achievements).toContain('tutorial_completed');
    });
  });
});
