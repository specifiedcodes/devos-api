import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEventsService } from './analytics-events.service';
import { FunnelMetricsDto, StepMetric, TutorialMetrics, TimingMetrics } from '../dto/funnel-metrics.dto';
import { UserAnalyticsDto, StepCompleted, TutorialEvent } from '../dto/user-analytics.dto';

@Injectable()
export class AnalyticsCalculationService {
  constructor(
    private readonly eventsService: AnalyticsEventsService,
  ) {}

  /**
   * Calculate onboarding funnel metrics for a date range
   * Includes step completion rates, dropoff rates, tutorial metrics, and timing metrics
   */
  async calculateFunnelMetrics(
    startDate: Date,
    endDate: Date,
    workspaceId?: string,
  ): Promise<FunnelMetricsDto> {
    // Get all onboarding events in date range
    const onboardingStarted = await this.eventsService.getEventsByType(
      'onboarding_started',
      startDate,
      endDate,
      workspaceId,
    );

    const onboardingCompleted = await this.eventsService.getEventsByType(
      'onboarding_completed',
      startDate,
      endDate,
      workspaceId,
    );

    const totalUsersStarted = new Set(onboardingStarted.map(e => e.userId)).size;
    const totalUsersCompleted = new Set(onboardingCompleted.map(e => e.userId)).size;

    const overallCompletionRate = totalUsersStarted > 0
      ? (totalUsersCompleted / totalUsersStarted) * 100
      : 0;

    // Calculate step metrics
    const steps = [
      'account_created',
      'github_connected',
      'ai_key_added',
      'first_project_created',
      'tutorial_completed',
    ];

    const stepMetrics = await Promise.all(
      steps.map(step => this.calculateStepMetrics(step, startDate, endDate, workspaceId, totalUsersStarted)),
    );

    // Calculate tutorial metrics
    const tutorialMetrics = await this.calculateTutorialMetrics(startDate, endDate, workspaceId);

    // Calculate timing metrics
    const timingMetrics = await this.calculateTimingMetrics(startDate, endDate, workspaceId);

    return {
      period: { start: startDate, end: endDate },
      totalUsersStarted,
      totalUsersCompleted,
      overallCompletionRate,
      stepMetrics,
      tutorialMetrics,
      timingMetrics,
    };
  }

  /**
   * Calculate metrics for a specific onboarding step
   */
  private async calculateStepMetrics(
    step: string,
    startDate: Date,
    endDate: Date,
    workspaceId: string | undefined,
    totalUsersStarted: number,
  ): Promise<StepMetric> {
    const stepCompletedEvents = await this.eventsService.getEventsByType(
      'onboarding_step_completed',
      startDate,
      endDate,
      workspaceId,
    );

    const stepCompleted = stepCompletedEvents.filter(
      e => e.eventData?.stepName === step,
    );

    const completedCount = new Set(stepCompleted.map(e => e.userId)).size;
    const completionRate = totalUsersStarted > 0
      ? (completedCount / totalUsersStarted) * 100
      : 0;
    const dropoffRate = 100 - completionRate;

    // Calculate average duration
    const durations = stepCompleted
      .map(e => e.eventData?.timeFromStart)
      .filter(d => typeof d === 'number');

    const averageTimeSeconds = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length / 1000
      : 0;

    return {
      step,
      completedCount,
      completionRate,
      averageTimeSeconds,
      dropoffRate,
    };
  }

  /**
   * Calculate tutorial-specific metrics
   */
  private async calculateTutorialMetrics(
    startDate: Date,
    endDate: Date,
    workspaceId: string | undefined,
  ): Promise<TutorialMetrics> {
    const tutorialStarted = await this.eventsService.getEventsByType(
      'tutorial_started',
      startDate,
      endDate,
      workspaceId,
    );

    const tutorialCompleted = await this.eventsService.getEventsByType(
      'tutorial_completed',
      startDate,
      endDate,
      workspaceId,
    );

    const tutorialSkipped = await this.eventsService.getEventsByType(
      'tutorial_skipped',
      startDate,
      endDate,
      workspaceId,
    );

    const startedCount = new Set(tutorialStarted.map(e => e.userId)).size;
    const completedCount = new Set(tutorialCompleted.map(e => e.userId)).size;
    const skippedCount = new Set(tutorialSkipped.map(e => e.userId)).size;

    const completionRate = startedCount > 0
      ? (completedCount / startedCount) * 100
      : 0;
    const skipRate = startedCount > 0
      ? (skippedCount / startedCount) * 100
      : 0;

    // Calculate average tutorial duration
    const durations: number[] = [];
    for (const startEvent of tutorialStarted) {
      const completeEvent = tutorialCompleted.find(e => e.userId === startEvent.userId);
      if (completeEvent) {
        const durationMs = completeEvent.timestamp.getTime() - startEvent.timestamp.getTime();
        durations.push(durationMs);
      }
    }

    const averageDurationSeconds = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length / 1000
      : 0;

    return {
      startedCount,
      completedCount,
      skippedCount,
      completionRate,
      skipRate,
      averageDurationSeconds,
    };
  }

  /**
   * Calculate timing metrics (average time, median time, target achievement rates)
   */
  private async calculateTimingMetrics(
    startDate: Date,
    endDate: Date,
    workspaceId: string | undefined,
  ): Promise<TimingMetrics> {
    const onboardingStarted = await this.eventsService.getEventsByType(
      'onboarding_started',
      startDate,
      endDate,
      workspaceId,
    );

    const onboardingCompleted = await this.eventsService.getEventsByType(
      'onboarding_completed',
      startDate,
      endDate,
      workspaceId,
    );

    const durations: number[] = [];
    let under60SecondsCount = 0;
    let under10MinutesCount = 0;

    for (const startEvent of onboardingStarted) {
      const completeEvent = onboardingCompleted.find(e => e.userId === startEvent.userId);
      if (completeEvent) {
        const durationMs = completeEvent.timestamp.getTime() - startEvent.timestamp.getTime();
        const durationSeconds = durationMs / 1000;
        durations.push(durationSeconds);

        if (durationSeconds < 60) under60SecondsCount++;
        if (durationSeconds < 600) under10MinutesCount++;
      }
    }

    const averageTotalTimeSeconds = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const medianTotalTimeSeconds = durations.length > 0
      ? this.calculateMedian(durations)
      : 0;

    const totalCompleted = durations.length;
    const under60SecondsRate = totalCompleted > 0
      ? (under60SecondsCount / totalCompleted) * 100
      : 0;
    const under10MinutesRate = totalCompleted > 0
      ? (under10MinutesCount / totalCompleted) * 100
      : 0;

    return {
      averageTotalTimeSeconds,
      medianTotalTimeSeconds,
      under60SecondsCount,
      under60SecondsRate,
      under10MinutesCount,
      under10MinutesRate,
    };
  }

  /**
   * Calculate median of an array of numbers
   */
  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Calculate user-specific onboarding analytics
   */
  async calculateUserOnboardingMetrics(userId: string): Promise<UserAnalyticsDto> {
    const events = await this.eventsService.getEventsByUser(userId);

    const onboardingStarted = events.find(e => e.eventType === 'onboarding_started');
    const onboardingCompleted = events.find(e => e.eventType === 'onboarding_completed');

    if (!onboardingStarted) {
      throw new NotFoundException('User has not started onboarding');
    }

    const totalDurationSeconds = onboardingCompleted
      ? (onboardingCompleted.timestamp.getTime() - onboardingStarted.timestamp.getTime()) / 1000
      : null;

    const stepsCompleted: StepCompleted[] = events
      .filter(e => e.eventType === 'onboarding_step_completed')
      .map(e => ({
        step: e.eventData?.stepName || 'unknown',
        completedAt: e.timestamp,
        durationSeconds: (e.eventData?.timeFromStart || 0) / 1000,
      }));

    const tutorialEvents: TutorialEvent[] = events
      .filter(e => e.eventType.startsWith('tutorial_'))
      .map(e => ({
        event: e.eventType,
        timestamp: e.timestamp,
        data: e.eventData || {},
      }));

    const achievements: string[] = [];
    if (totalDurationSeconds && totalDurationSeconds < 600) {
      achievements.push('completed_in_under_10_minutes');
    }
    if (tutorialEvents.some(e => e.event === 'tutorial_completed')) {
      achievements.push('tutorial_completed');
    }

    return {
      userId,
      onboardingStatus: onboardingCompleted ? 'completed' : 'in_progress',
      startedAt: onboardingStarted.timestamp,
      completedAt: onboardingCompleted?.timestamp || null,
      totalDurationSeconds,
      stepsCompleted,
      tutorialEvents,
      achievements,
    };
  }
}
