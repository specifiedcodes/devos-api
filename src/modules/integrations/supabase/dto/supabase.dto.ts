import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Length,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

// DEPRECATED: Scheduled for removal. See Epic 28.
// TODO(epic-28-cleanup): Remove after sunset period

/**
 * @deprecated Supabase database provisioning is deprecated. Use Railway instead. See Epic 28.
 *
 * Supabase DTOs
 * Story 6.7: Supabase Database Provisioning
 */

// ---- Request DTOs ----

export class CreateSupabaseProjectDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Matches(/^[a-zA-Z0-9-_ ]+$/, {
    message:
      'name must contain only alphanumeric characters, hyphens, underscores, and spaces',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'us-east-1',
    'us-west-1',
    'eu-west-1',
    'eu-west-2',
    'ap-southeast-1',
    'ap-northeast-1',
    'ap-south-1',
    'sa-east-1',
  ])
  region?: string = 'us-east-1';

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  dbPassword!: string;

  @IsOptional()
  @IsString()
  @IsIn(['free', 'pro', 'team'])
  plan?: string = 'free';
}

// ---- Response DTOs ----

export class SupabaseProjectResponseDto {
  id!: string;
  name!: string;
  organizationId!: string;
  region!: string;
  status!: string;
  projectUrl!: string;
  database?: { host: string; version?: string };
  createdAt!: string;
}

export class SupabaseConnectionStringResponseDto {
  host!: string;
  port!: number;
  poolerHost!: string;
  poolerPort!: number;
  database!: string;
  user!: string;
  supabaseProjectRef!: string;
  supabaseUrl!: string;
  anonKey?: string;
}

export class SupabaseOrganizationDto {
  id!: string;
  name!: string;
}

export class SupabaseOrganizationListResponseDto {
  organizations!: SupabaseOrganizationDto[];
}

export class SupabasePauseResumeResponseDto {
  success!: boolean;
  message!: string;
}
