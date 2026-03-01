export type HealthIndicator = 'on_track' | 'at_risk' | 'behind';

export class SprintMetricsSummaryDto {
  sprintId!: string;
  sprintName!: string;
  status!: string;
  totalPoints!: number;
  completedPoints!: number;
  remainingPoints!: number;
  completionRate!: number;
  averageCycleTimeHours!: number | null;
  predictedCompletionDate!: string | null;
  healthIndicator!: HealthIndicator;
  daysRemaining!: number;
  startDate!: string;
  endDate!: string;
}

export class CycleTimeDistributionDto {
  lessThanOneDay!: number;
  oneToThreeDays!: number;
  threeToSevenDays!: number;
  moreThanSevenDays!: number;
  averageCycleTimeHours!: number | null;
}
