import { IsEnum, IsObject, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentJobType } from '../entities/agent-job.entity';

export class CreateJobDto {
  @ApiProperty({
    enum: AgentJobType,
    description: 'Type of agent job to create',
    example: AgentJobType.SPAWN_AGENT,
  })
  @IsEnum(AgentJobType, {
    message: `jobType must be one of: ${Object.values(AgentJobType).join(', ')}`,
  })
  @IsNotEmpty()
  jobType!: AgentJobType;

  @ApiProperty({
    description: 'Job-specific payload data',
    example: { agentType: 'dev', projectId: 'uuid', taskDescription: 'Implement story 5.1' },
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Job priority (1 = highest, larger = lower priority)',
    example: 5,
    default: 5,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number;
}
