import { IsDateString, IsEnum, IsOptional } from 'class-validator';

/**
 * Enum for cost breakdown grouping dimensions
 */
export enum CostGroupBy {
  MODEL = 'model',
  PROVIDER = 'provider',
  TASK_TYPE = 'taskType',
  AGENT = 'agent',
  PROJECT = 'project',
}

/**
 * DTO for querying cost breakdown data
 * Used by GET /breakdown endpoint
 */
export class CostBreakdownQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(CostGroupBy)
  groupBy?: CostGroupBy; // defaults to 'model' if not specified
}
