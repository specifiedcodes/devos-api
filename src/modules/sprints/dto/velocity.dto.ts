import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VelocityQueryDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  last_n?: number;
}

export class VelocitySprintDto {
  sprintId!: string;
  sprintName!: string;
  plannedPoints!: number;
  completedPoints!: number;
  completionRate!: number;
  startDate!: string;
  endDate!: string;
  averageCycleTimeHours!: number | null;
  carriedOverPoints!: number;
  scopeChangePoints!: number;
}

export class VelocityResponseDto {
  projectId!: string;
  sprints!: VelocitySprintDto[];
  averageVelocity!: number;
}
