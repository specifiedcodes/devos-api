import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class BurndownQueryDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class BurndownDataPointDto {
  date!: string;
  totalPoints!: number;
  completedPoints!: number;
  remainingPoints!: number;
  idealRemaining!: number;
  storiesCompleted!: number;
  storiesTotal!: number;
  scopeChanges!: number;
}

export class BurndownResponseDto {
  sprintId!: string;
  sprintName!: string;
  startDate!: string;
  endDate!: string;
  dataPoints!: BurndownDataPointDto[];
}
