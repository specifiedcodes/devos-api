import { IsDateString, IsOptional } from 'class-validator';

/**
 * DTO for querying usage data
 */
export class UsageQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
