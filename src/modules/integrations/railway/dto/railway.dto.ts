import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsEnum,
  IsArray,
  IsUUID,
  IsNumber,
  Length,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RailwayServiceType,
  RailwayServiceStatus,
} from '../../../../database/entities/railway-service.entity';
import { DeploymentStatus } from '../../../../database/entities/railway-deployment.entity';

/**
 * Railway DTOs
 * Story 6.5: Railway Deployment Integration
 * Story 23-3: Railway CLI Deployment DTOs
 */

// ---- Request DTOs ----

export class CreateRailwayProjectDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'name must contain only alphanumeric characters and hyphens',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** TODO: Wire environmentName into RailwayService.createProject and controller.
   *  Currently accepted but not forwarded to the Railway API. */
  @IsOptional()
  @IsIn(['production', 'staging', 'development'])
  environmentName?: string = 'production';

  @IsOptional()
  @IsBoolean()
  linkGitHubRepo?: boolean = true;
}

export class TriggerDeploymentDto {
  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsOptional()
  @IsString()
  branch?: string = 'main';

  @IsOptional()
  @IsString()
  commitSha?: string;
}

export class SetEnvironmentVariablesDto {
  @IsObject()
  @IsNotEmpty()
  variables!: Record<string, string>;
}

export class DeploymentListQueryDto {
  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsOptional()
  @IsIn(['building', 'deploying', 'success', 'failed', 'crashed', 'queued'])
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

export class RailwayProjectResponseDto {
  id!: string;
  name!: string;
  description?: string;
  projectUrl!: string;
  environments!: Array<{ id: string; name: string }>;
  createdAt!: string;
}

export class DeploymentResponseDto {
  id!: string;
  status!: string;
  projectId!: string;
  environmentId?: string;
  deploymentUrl?: string;
  branch?: string;
  commitSha?: string;
  createdAt!: string;
  updatedAt?: string;
  meta?: Record<string, any>;
}

export class DeploymentListResponseDto {
  deployments!: DeploymentResponseDto[];
  total!: number;
}

export class SetVariablesResponseDto {
  success!: boolean;
  variableCount!: number;
  environmentId!: string;
}

// ============================================================
// Story 23-3: Railway CLI Deployment DTOs
// ============================================================

// ---- Request DTOs (CLI Operations) ----

/**
 * DTO for provisioning a new Railway service (web, api, worker, database, cache, cron).
 */
export class ProvisionServiceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(RailwayServiceType)
  serviceType!: RailwayServiceType;

  @IsOptional()
  @IsIn(['postgres', 'redis', 'mysql', 'mongodb'])
  databaseType?: string;

  @IsOptional()
  @IsString()
  githubRepo?: string;

  @IsOptional()
  @IsString()
  sourceDirectory?: string;

  @IsOptional()
  @IsObject()
  config?: {
    buildCommand?: string;
    startCommand?: string;
    healthcheckPath?: string;
    dockerfile?: string;
  };
}

/**
 * DTO for bulk deploying multiple services at once.
 */
export class BulkDeployDto {
  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];
}

/**
 * DTO for adding a domain to a Railway service.
 */
export class AddDomainDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, {
    message: 'customDomain must be a valid domain format (e.g., example.com, sub.example.com)',
  })
  customDomain?: string;

  @IsOptional()
  @IsBoolean()
  generateRailwayDomain?: boolean;
}

/**
 * Command allowlist for Railway CLI execution.
 */
export const RAILWAY_CLI_ALLOWED_COMMANDS = [
  'whoami', 'status', 'list', 'init', 'link', 'up', 'add',
  'redeploy', 'restart', 'down', 'domain', 'logs', 'variable',
  'environment', 'service', 'connect',
] as const;

/**
 * DTO for executing a Railway CLI command within an agent sandbox.
 */
export class ExecuteCliCommandDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([...RAILWAY_CLI_ALLOWED_COMMANDS])
  command!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsNumber()
  @Min(5000)
  @Max(600000)
  timeoutMs?: number;
}

/**
 * DTO for setting environment variables on a Railway service.
 */
export class SetServiceVariablesDto {
  @IsObject()
  @IsNotEmpty()
  variables!: Record<string, string>;
}

/**
 * DTO for rolling back a deployment to a previous version.
 */
export class RollbackDeploymentDto {
  @IsString()
  @IsNotEmpty()
  railwayDeploymentId!: string;
}

// ---- Response DTOs (CLI Operations) ----

/**
 * Response DTO representing a Railway service entity.
 */
export class RailwayServiceEntityDto {
  id!: string;
  projectId!: string;
  railwayServiceId!: string;
  name!: string;
  serviceType!: RailwayServiceType;
  status!: RailwayServiceStatus;
  deploymentUrl?: string;
  customDomain?: string;
  deployOrder!: number;
  config!: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * Response DTO for a bulk deployment operation.
 */
export class BulkDeploymentResponseDto {
  deploymentId!: string;
  services!: Array<{
    serviceId: string;
    serviceName: string;
    status: DeploymentStatus;
    deploymentUrl?: string;
    error?: string;
  }>;
  startedAt!: string;
  status!: 'in_progress' | 'success' | 'partial_failure' | 'failed';
}

/**
 * Response DTO for domain information.
 */
export class DomainResponseDto {
  domain!: string;
  type!: 'railway' | 'custom';
  status!: 'active' | 'pending_dns' | 'pending_ssl' | 'error';
  dnsInstructions?: {
    type: 'CNAME' | 'A';
    name: string;
    value: string;
  };
}

/**
 * Response DTO for Railway project status.
 */
export class RailwayStatusResponseDto {
  connected!: boolean;
  username?: string;
  projectName?: string;
  services!: Array<{
    name: string;
    status: string;
    url?: string;
  }>;
}

/**
 * Response DTO for a Railway CLI execution result.
 */
export class RailwayCliResultDto {
  exitCode!: number;
  output!: string;
  error?: string;
  durationMs!: number;
}

/**
 * Response DTO for service connection information (masked).
 */
export class ServiceConnectionInfoDto {
  serviceId!: string;
  serviceName!: string;
  serviceType!: RailwayServiceType;
  connectionVariables!: Array<{
    name: string;
    masked: boolean;
    present: boolean;
  }>;
}

// ============================================================
// Story 24-5: Log Streaming & Deployment History DTOs
// ============================================================

/**
 * Query DTO for getting service logs.
 */
export class GetLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  lines?: number = 50;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  buildLogs?: boolean = false;
}

/**
 * Query DTO for deployment history pagination.
 */
export class DeploymentHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;
}

/**
 * Response DTO for paginated deployment history.
 */
export class DeploymentHistoryResponseDto {
  deployments!: Array<{
    id: string;
    railwayDeploymentId: string;
    status: DeploymentStatus;
    deploymentUrl?: string;
    commitSha?: string;
    branch?: string;
    triggeredBy?: string;
    triggerType?: string;
    buildDurationSeconds?: number;
    deployDurationSeconds?: number;
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
  }>;
  total!: number;
  page!: number;
  limit!: number;
}

/**
 * Response DTO for service logs.
 */
export class ServiceLogsResponseDto {
  logs!: string[];
  serviceId!: string;
  serviceName!: string;
}

/**
 * Response DTO for Railway health check.
 */
export class HealthCheckResponseDto {
  connected!: boolean;
  username?: string;
  error?: string;
}
