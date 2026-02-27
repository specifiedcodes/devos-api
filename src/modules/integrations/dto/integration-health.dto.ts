/**
 * Integration Health DTOs
 * Story 21-9: Integration Health Monitoring (AC4)
 */

import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetHealthHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export interface HealthSummaryResponse {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  counts: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    disconnected: number;
  };
}

export interface HealthHistoryEntry {
  timestamp: string;
  status: string;
  responseTimeMs: number;
  error?: string;
}

export interface ProbeResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disconnected';
  responseTimeMs: number;
  error?: string;
  details?: Record<string, any>;
}
