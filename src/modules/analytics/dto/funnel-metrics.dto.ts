export interface StepMetric {
  step: string;
  completedCount: number;
  completionRate: number;
  averageTimeSeconds: number;
  dropoffRate: number;
}

export interface TutorialMetrics {
  startedCount: number;
  completedCount: number;
  skippedCount: number;
  completionRate: number;
  skipRate: number;
  averageDurationSeconds: number;
}

export interface TimingMetrics {
  averageTotalTimeSeconds: number;
  medianTotalTimeSeconds: number;
  under60SecondsCount: number;
  under60SecondsRate: number;
  under10MinutesCount: number;
  under10MinutesRate: number;
}

export interface FunnelMetricsDto {
  period: {
    start: Date;
    end: Date;
  };
  totalUsersStarted: number;
  totalUsersCompleted: number;
  overallCompletionRate: number;
  stepMetrics: StepMetric[];
  tutorialMetrics: TutorialMetrics;
  timingMetrics: TimingMetrics;
}
