import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProvider } from '../../../database/entities/api-usage.entity';

/**
 * DTO for recording API usage
 */
export class RecordUsageDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  byokKeyId?: string;

  @IsEnum(ApiProvider)
  provider!: ApiProvider;

  @IsString()
  model!: string;

  @IsInt()
  @Min(0)
  inputTokens!: number;

  @IsInt()
  @Min(0)
  outputTokens!: number;
}
