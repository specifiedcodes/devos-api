import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsDateString,
  IsUUID,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CliSessionStatus,
  CliSessionAgentType,
} from '../../../database/entities/cli-session.entity';

/**
 * DTO for querying CLI sessions
 * Story 8.5: CLI Session History and Replay
 */
export class GetSessionsQueryDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsEnum(CliSessionAgentType)
  @IsOptional()
  agentType?: CliSessionAgentType;

  @IsEnum(CliSessionStatus)
  @IsOptional()
  status?: CliSessionStatus;

  @IsString()
  @Length(1, 50)
  @IsOptional()
  storyKey?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

/**
 * Options passed to service for session retrieval
 */
export interface GetSessionsOptions {
  workspaceId: string;
  projectId?: string;
  agentType?: CliSessionAgentType;
  status?: CliSessionStatus;
  storyKey?: string;
  startDate?: Date;
  endDate?: Date;
  limit: number;
  offset: number;
}
