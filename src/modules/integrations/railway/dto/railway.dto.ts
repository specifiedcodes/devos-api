import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  Length,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Railway DTOs
 * Story 6.5: Railway Deployment Integration
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
