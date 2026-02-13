import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AgentJobType, AgentJobStatus } from '../entities/agent-job.entity';

export class ListJobsQueryDto {
  @ApiPropertyOptional({
    enum: AgentJobStatus,
    description: 'Filter by job status',
  })
  @IsOptional()
  @IsEnum(AgentJobStatus, {
    message: `status must be one of: ${Object.values(AgentJobStatus).join(', ')}`,
  })
  status?: AgentJobStatus;

  @ApiPropertyOptional({
    enum: AgentJobType,
    description: 'Filter by job type',
  })
  @IsOptional()
  @IsEnum(AgentJobType, {
    message: `jobType must be one of: ${Object.values(AgentJobType).join(', ')}`,
  })
  jobType?: AgentJobType;

  @ApiPropertyOptional({
    description: 'Number of results to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
