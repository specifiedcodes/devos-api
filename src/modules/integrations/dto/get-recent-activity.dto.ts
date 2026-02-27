/**
 * GetRecentActivityDto
 * Story 21-7: Integration Management UI (AC2)
 *
 * DTO for the GET /management/activity endpoint query parameters.
 */

import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetRecentActivityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
