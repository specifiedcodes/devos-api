import {
  IsOptional,
  IsEnum,
  IsString,
  IsObject,
} from 'class-validator';
import { AgentStatus } from '../../../database/entities/agent.entity';

export class UpdateAgentDto {
  @IsOptional()
  @IsEnum(AgentStatus, {
    message: `status must be one of: ${Object.values(AgentStatus).join(', ')}`,
  })
  status?: AgentStatus;

  @IsOptional()
  @IsString()
  currentTask?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
