import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Deployment Monitoring DTOs
 * Story 6.8: Deployment Status Monitoring
 *
 * Unified deployment representation aggregating Railway and Vercel deployments.
 */

// ---- Request DTOs ----

export class UnifiedDeploymentListQueryDto {
  @IsOptional()
  @IsIn(['railway', 'vercel', 'all'])
  platform?: string = 'all';

  @IsOptional()
  @IsIn([
    'queued',
    'building',
    'deploying',
    'success',
    'failed',
    'crashed',
    'canceled',
  ])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage?: number = 10;
}

export class DeploymentDetailQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['railway', 'vercel'])
  platform!: string;
}

// ---- Response DTOs ----

export class UnifiedDeploymentDto {
  id!: string;
  platform!: string; // 'railway' | 'vercel'
  status!: string; // platform-specific raw status
  normalizedStatus!: string; // 'queued' | 'building' | 'deploying' | 'success' | 'failed' | 'crashed' | 'canceled' | 'unknown'
  branch?: string;
  commitSha?: string;
  deploymentUrl?: string;
  startedAt!: string;
  completedAt?: string;
  duration?: number | null; // seconds
  logs?: string | null;
  meta?: Record<string, any>;
}

export class PlatformStatusDto {
  connected!: boolean;
  projectLinked!: boolean;
}

export class UnifiedDeploymentListResponseDto {
  deployments!: UnifiedDeploymentDto[];
  total!: number;
  page!: number;
  perPage!: number;
  platforms!: {
    railway: PlatformStatusDto;
    vercel: PlatformStatusDto;
  };
}

export class ActiveDeploymentDto {
  id!: string;
  platform!: string;
  status!: string;
  normalizedStatus!: string;
  branch?: string;
  startedAt!: string;
  elapsedSeconds!: number;
}

export class ActiveDeploymentsResponseDto {
  activeDeployments!: ActiveDeploymentDto[];
  hasActiveDeployments!: boolean;
  pollingIntervalMs!: number; // always 10000
}

export class PlatformDeploymentBreakdownDto {
  total!: number;
  success!: number;
  failed!: number;
  inProgress!: number;
}

export class DeploymentSummaryResponseDto {
  totalDeployments!: number;
  successCount!: number;
  failedCount!: number;
  inProgressCount!: number;
  canceledCount!: number;
  successRate!: number; // percentage, 0-100, 2 decimal places
  averageDurationSeconds?: number | null;
  lastDeployment?: UnifiedDeploymentDto | null;
  platformBreakdown!: {
    railway: PlatformDeploymentBreakdownDto;
    vercel: PlatformDeploymentBreakdownDto;
  };
}
