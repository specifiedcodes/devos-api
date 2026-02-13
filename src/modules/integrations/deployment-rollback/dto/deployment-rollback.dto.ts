import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Deployment Rollback DTOs
 * Story 6.10: Deployment Rollback
 */

// ---- Request DTOs ----

export class CreateManualRollbackDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['railway', 'vercel'])
  platform!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deploymentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetDeploymentId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['production', 'staging', 'development'])
  environment!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateAutoRollbackDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['railway', 'vercel'])
  platform!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deploymentId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['production', 'staging', 'development'])
  environment!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class DeploymentRollbackListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['railway', 'vercel'])
  platform?: string;

  @IsOptional()
  @IsString()
  @IsIn(['in_progress', 'success', 'failed'])
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

// ---- Response DTOs ----

export class DeploymentRollbackResponseDto {
  id!: string;
  projectId!: string;
  platform!: string;
  deploymentId!: string;
  targetDeploymentId?: string;
  newDeploymentId?: string;
  environment!: string;
  status!: string;
  reason?: string;
  triggerType!: string;
  initiatedBy!: string;
  initiatedAt!: string;
  completedAt?: string;
  errorMessage?: string;
}

export class DeploymentRollbackListResponseDto {
  rollbacks!: DeploymentRollbackResponseDto[];
  total!: number;
  page!: number;
  perPage!: number;
}

export class RollbackSummaryResponseDto {
  totalRollbacks!: number;
  successCount!: number;
  failedCount!: number;
  manualCount!: number;
  automaticCount!: number;
  averageDurationSeconds!: number | null;
  lastRollback!: {
    id: string;
    platform: string;
    status: string;
    triggerType: string;
    initiatedAt: string;
    completedAt?: string;
  } | null;
}
