import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for test results within a deployment approval request
 */
export class TestResultsDto {
  @IsInt()
  @Min(0)
  passed!: number;

  @IsInt()
  @Min(0)
  failed!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  skipped?: number;
}

/**
 * DTO for updating project deployment approval settings
 * Story 6.9: Manual Deployment Approval
 */
export class UpdateApprovalSettingsDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['automatic', 'manual', 'staging_auto_production_manual'])
  approvalMode!: string;
}

/**
 * Response DTO for approval settings
 */
export class ApprovalSettingsResponseDto {
  projectId!: string;
  approvalMode!: string;
  updatedAt?: string;
}

/**
 * DTO for creating a deployment approval request
 */
export class CreateDeploymentApprovalDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['railway', 'vercel'])
  platform!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  branch!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  commitSha?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['production', 'staging', 'development'])
  environment!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  storyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  storyTitle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  changes?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TestResultsDto)
  testResults?: TestResultsDto;
}

/**
 * DTO for rejecting a deployment
 */
export class RejectDeploymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * Response DTO for a single deployment approval
 */
export class DeploymentApprovalResponseDto {
  id!: string;
  projectId!: string;
  platform!: string;
  branch!: string;
  commitSha?: string;
  environment!: string;
  status!: string;
  storyId?: string;
  storyTitle?: string;
  changes?: string[];
  testResults?: { passed: number; failed: number; skipped?: number };
  requestedAt!: string;
  requestedBy!: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

/**
 * Response DTO for paginated approval list
 */
export class DeploymentApprovalListResponseDto {
  approvals!: DeploymentApprovalResponseDto[];
  total!: number;
  page!: number;
  perPage!: number;
}

/**
 * Query DTO for listing deployment approvals with pagination/filter
 */
export class DeploymentApprovalListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'expired'])
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

/**
 * Response DTO for pending count
 */
export class PendingCountResponseDto {
  pendingCount!: number;
}
