import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';
import {
  CliSessionStatus,
  CliSessionAgentType,
} from '../../../database/entities/cli-session.entity';

/**
 * DTO for creating a CLI session record
 * Story 8.5: CLI Session History and Replay
 *
 * Used by orchestrator to persist session history when terminated
 */
export class CreateCliSessionDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  agentId!: string;

  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  storyKey?: string;

  @IsEnum(CliSessionAgentType)
  agentType!: CliSessionAgentType;

  @IsString()
  outputText!: string; // Raw output text (will be compressed by service)

  @IsEnum(CliSessionStatus)
  status!: CliSessionStatus;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;
}

/**
 * DTO for internal session creation (already compressed)
 */
export class CreateCliSessionInternalDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  agentId!: string;

  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  storyKey?: string;

  @IsEnum(CliSessionAgentType)
  agentType!: CliSessionAgentType;

  @IsString()
  compressedOutput!: string; // Already compressed (gzip base64)

  @IsInt()
  @Min(0)
  lineCount!: number;

  @IsInt()
  @Min(0)
  outputSizeBytes!: number;

  @IsEnum(CliSessionStatus)
  status!: CliSessionStatus;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  durationSeconds?: number;
}
