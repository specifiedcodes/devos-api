import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AgentStatus, AgentType } from '../../../database/entities/agent.entity';

export class ListAgentsQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(AgentStatus, {
    message: `status must be one of: ${Object.values(AgentStatus).join(', ')}`,
  })
  status?: AgentStatus;

  @IsOptional()
  @IsEnum(AgentType, {
    message: `type must be one of: ${Object.values(AgentType).join(', ')}`,
  })
  type?: AgentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
