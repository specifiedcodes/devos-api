export interface StepCompleted {
  step: string;
  completedAt: Date;
  durationSeconds: number;
}

export interface TutorialEvent {
  event: string;
  timestamp: Date;
  data: Record<string, any>;
}

export interface UserAnalyticsDto {
  userId: string;
  onboardingStatus: 'not_started' | 'in_progress' | 'completed';
  startedAt: Date | null;
  completedAt: Date | null;
  totalDurationSeconds: number | null;
  stepsCompleted: StepCompleted[];
  tutorialEvents: TutorialEvent[];
  achievements: string[];
}
