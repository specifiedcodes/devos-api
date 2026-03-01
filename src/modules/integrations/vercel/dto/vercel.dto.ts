import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  Length,
  MaxLength,
  Matches,
  Min,
  Max,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// DEPRECATED: Scheduled for removal. See Epic 28.
// TODO(epic-28-cleanup): Remove after sunset period

/**
 * @deprecated Vercel deployment integration is deprecated. Use Railway instead. See Epic 28.
 *
 * Vercel DTOs
 * Story 6.6: Vercel Deployment Integration (Alternative)
 */

// ---- Request DTOs ----

export class CreateVercelProjectDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'name must contain only lowercase alphanumeric characters and hyphens',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'nextjs',
    'react',
    'vue',
    'nuxt',
    'svelte',
    'angular',
    'astro',
    'gatsby',
    'remix',
    'other',
  ])
  framework?: string;

  @IsOptional()
  @IsBoolean()
  linkGitHubRepo?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  buildCommand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  outputDirectory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  installCommand?: string;
}

export class TriggerVercelDeploymentDto {
  @IsOptional()
  @IsString()
  @IsIn(['production', 'preview'])
  target?: string = 'production';

  @IsOptional()
  @IsString()
  ref?: string = 'main';
}

export class VercelEnvironmentVariableDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'key must start with a letter or underscore and contain only alphanumeric characters and underscores',
  })
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  value!: string;

  @IsOptional()
  @IsArray()
  @IsIn(['production', 'preview', 'development'], { each: true })
  target?: string[];

  @IsOptional()
  @IsIn(['plain', 'encrypted', 'system'])
  type?: string = 'encrypted';
}

export class SetVercelEnvironmentVariablesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VercelEnvironmentVariableDto)
  variables!: VercelEnvironmentVariableDto[];
}

export class VercelDeploymentListQueryDto {
  @IsOptional()
  @IsIn(['production', 'preview'])
  target?: string;

  @IsOptional()
  @IsIn(['BUILDING', 'READY', 'ERROR', 'QUEUED', 'CANCELED'])
  state?: string;

  // Note: Vercel API uses cursor-based pagination (since/until timestamps),
  // not offset-based page numbers. Page parameter intentionally omitted.

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 10;
}

// ---- Response DTOs ----

export class VercelProjectResponseDto {
  id!: string;
  name!: string;
  framework?: string;
  projectUrl!: string;
  latestDeploymentUrl?: string;
  createdAt!: string;
}

export class VercelDeploymentResponseDto {
  id!: string;
  status!: string;
  projectId!: string;
  url?: string;
  target?: string;
  ref?: string;
  readyState?: string;
  createdAt!: string;
  readyAt?: string;
  meta?: Record<string, any>;
}

export class VercelDeploymentListResponseDto {
  deployments!: VercelDeploymentResponseDto[];
  total!: number;
}

export class SetVercelVariablesResponseDto {
  success!: boolean;
  variableCount!: number;
  projectId!: string;
}
